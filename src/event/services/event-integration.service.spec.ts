import { Test, TestingModule } from '@nestjs/testing';
import { EventIntegrationService } from './event-integration.service';
import { EventQueryService } from './event-query.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { ExternalEventDto } from '../dto/external-event.dto';
import { EventSourceType } from '../../core/constants/source-type.constant';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import {
  EventType,
  EventStatus,
  EventVisibility,
} from '../../core/constants/constant';
import { Repository } from 'typeorm';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import { BadRequestException } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
import { FileService } from '../../file/file.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Add constants for metrics tokens
const PROM_METRIC_EVENT_INTEGRATION_PROCESSED_TOTAL =
  'PROM_METRIC_EVENT_INTEGRATION_PROCESSED_TOTAL';
const PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_MATCHES_TOTAL =
  'PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_MATCHES_TOTAL';
const PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_FAILURES_TOTAL =
  'PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_FAILURES_TOTAL';
const PROM_METRIC_EVENT_INTEGRATION_PROCESSING_DURATION_SECONDS =
  'PROM_METRIC_EVENT_INTEGRATION_PROCESSING_DURATION_SECONDS';

describe('EventIntegrationService', () => {
  let service: EventIntegrationService;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let shadowAccountService: jest.Mocked<ShadowAccountService>;
  let eventRepository: jest.Mocked<Repository<EventEntity>>;
  let fileService: jest.Mocked<FileService>;

  // Mock Prometheus metrics
  let processedCounter: jest.Mocked<Counter<string>>;
  let deduplicationMatchesCounter: jest.Mocked<Counter<string>>;
  let deduplicationFailuresCounter: jest.Mocked<Counter<string>>;
  let processingDurationHistogram: jest.Mocked<Histogram<string>>;

  const mockTenantConnection = {
    getRepository: jest.fn(),
  };

  const mockUser = {
    id: 1,
    firstName: 'test.bsky.social',
    socialId: 'did:plc:1234',
    provider: 'bluesky',
    isShadowAccount: true,
  } as UserEntity;

  // Mock existing event
  const mockExistingEvent = {
    id: 1,
    name: 'Existing Event',
    description: 'Test Description',
    startDate: new Date('2023-10-15T18:00:00Z'),
    endDate: new Date('2023-10-15T20:00:00Z'),
    type: EventType.InPerson,
    status: EventStatus.Published,
    visibility: EventVisibility.Public,
    sourceType: EventSourceType.BLUESKY,
    sourceId: 'did:plc:1234',
    sourceUrl: 'https://bsky.app/profile/test.bsky.social/post/1234',
    sourceData: {
      handle: 'test.bsky.social',
      rkey: '1234',
    },
    lastSyncedAt: new Date(),
    user: mockUser,
  } as Partial<EventEntity>;

  const mockEventDto: ExternalEventDto = {
    name: 'Test Event',
    description: 'Test Description',
    startDate: '2023-10-15T18:00:00Z',
    endDate: '2023-10-15T20:00:00Z',
    type: EventType.InPerson,
    source: {
      type: EventSourceType.BLUESKY,
      id: 'did:plc:1234',
      handle: 'test.bsky.social',
      url: 'https://bsky.app/profile/test.bsky.social/post/1234',
      metadata: {
        rkey: '1234',
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mocks
    eventQueryService = {
      findBySourceAttributes: jest.fn(),
      findByBlueskySource: jest.fn(),
    } as any;

    tenantService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockTenantConnection),
    } as any;

    shadowAccountService = {
      findOrCreateShadowAccount: jest.fn().mockResolvedValue(mockUser),
    } as any;

    fileService = {
      findById: jest.fn(),
    } as any;

    // Setup Prometheus metrics mocks
    processedCounter = {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    deduplicationMatchesCounter = {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    deduplicationFailuresCounter = {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    processingDurationHistogram = {
      observe: jest.fn(),
      labels: jest.fn().mockReturnThis(),
      startTimer: jest.fn().mockReturnValue(jest.fn()),
    } as any;

    // Instead of creating a mock object, we'll use Jest's spying capability
    const EventEntityMock = {
      prototype: {
        generateUlid: jest.fn(),
        generateSlug: jest.fn(),
      },
    };

    // Create a mock query builder
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    // Setup repository mocks with proper type casting
    eventRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(() => {
        // Return an instance of our mocked EventEntity
        return {
          ...EventEntityMock.prototype,
          id: 2,
          name: '',
          description: '',
          startDate: new Date(),
          type: EventType.InPerson,
          locationOnline: '',
        } as unknown as EventEntity; // Cast to EventEntity
      }),
      save: jest.fn().mockImplementation((entity) => {
        // Return a properly typed entity
        return Promise.resolve({
          ...(entity as any), // Cast entity to any to avoid property errors
          id: (entity as any).id || 2,
          name: (entity as any).name || mockEventDto.name,
          // Add required methods to make TypeScript happy
          generateUlid: jest.fn(),
          generateSlug: jest.fn(),
          setEntityName: jest.fn(),
          toJSON: jest.fn(),
          reload: jest.fn(),
          hasId: jest.fn(),
          remove: jest.fn(),
          softRemove: jest.fn(),
          recover: jest.fn(),
        } as unknown as EventEntity);
      }),
      merge: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      remove: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    } as any;

    mockTenantConnection.getRepository.mockReturnValue(eventRepository);

    // Spy on EventEntity methods
    jest
      .spyOn(EventEntity.prototype, 'generateUlid')
      .mockImplementation(() => {});
    jest
      .spyOn(EventEntity.prototype, 'generateSlug')
      .mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventIntegrationService,
        {
          provide: EventQueryService,
          useValue: eventQueryService,
        },
        {
          provide: TenantConnectionService,
          useValue: tenantService,
        },
        {
          provide: ShadowAccountService,
          useValue: shadowAccountService,
        },
        {
          provide: FileService,
          useValue: fileService,
        },
        {
          provide: EventAttendeeService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: BlueskyIdService,
          useValue: {
            createUri: jest.fn(),
            parseUri: jest.fn().mockImplementation((uri: string) => {
              // Parse AT Protocol URIs in format: at://did:plc:xxx/collection/rkey
              const match = uri.match(/^at:\/\/(did:[^\/]+)\/([^\/]+)\/(.+)$/);
              if (match) {
                return {
                  did: match[1],
                  collection: match[2],
                  rkey: match[3],
                };
              }
              throw new Error(`Invalid AT Protocol URI: ${uri}`);
            }),
            isValidUri: jest.fn(),
          },
        },
        {
          provide: PROM_METRIC_EVENT_INTEGRATION_PROCESSED_TOTAL,
          useValue: processedCounter,
        },
        {
          provide: PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_MATCHES_TOTAL,
          useValue: deduplicationMatchesCounter,
        },
        {
          provide: PROM_METRIC_EVENT_INTEGRATION_DEDUPLICATION_FAILURES_TOTAL,
          useValue: deduplicationFailuresCounter,
        },
        {
          provide: PROM_METRIC_EVENT_INTEGRATION_PROCESSING_DURATION_SECONDS,
          useValue: processingDurationHistogram,
        },
      ],
    }).compile();

    service = module.get<EventIntegrationService>(EventIntegrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processExternalEvent', () => {
    it('should update an existing event if one is found', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        mockExistingEvent as unknown as EventEntity,
      ]);

      const updatedEvent = {
        ...mockExistingEvent,
        name: mockEventDto.name,
        // Add required methods
        generateUlid: jest.fn(),
        generateSlug: jest.fn(),
        setEntityName: jest.fn(),
        toJSON: jest.fn(),
        reload: jest.fn(),
        hasId: jest.fn(),
        remove: jest.fn(),
        softRemove: jest.fn(),
        recover: jest.fn(),
      } as unknown as EventEntity;

      eventRepository.save.mockResolvedValue(updatedEvent);
      eventRepository.merge.mockImplementation(() => updatedEvent);

      // Act
      const result = await service.processExternalEvent(
        mockEventDto,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        mockEventDto.source.id,
        mockEventDto.source.type,
        'tenant1',
      );
      expect(eventRepository.save).toHaveBeenCalled();
      expect(result.name).toBe(mockEventDto.name);
    });

    it('should create a new event if no existing event is found', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Mock EventEntity methods specifically for this test
      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      // Act
      const result = await service.processExternalEvent(
        mockEventDto,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        mockEventDto.source.id,
        mockEventDto.source.type,
        'tenant1',
      );
      expect(
        shadowAccountService.findOrCreateShadowAccount,
      ).toHaveBeenCalledWith(
        mockEventDto.source.id,
        mockEventDto.source.handle,
        AuthProvidersEnum.bluesky,
        'tenant1',
        expect.objectContaining({
          bluesky: expect.any(Object),
        }),
      );

      // Verify the entity methods were called
      expect(EventEntity.prototype.generateUlid).toHaveBeenCalled();
      expect(EventEntity.prototype.generateSlug).toHaveBeenCalled();

      expect(eventRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(2);
    });

    it('should validate the tenant ID requirement', async () => {
      // Act & Assert
      await expect(
        service.processExternalEvent(mockEventDto, ''),
      ).rejects.toThrow('Tenant ID is required');

      await expect(
        service.processExternalEvent(mockEventDto, null as any),
      ).rejects.toThrow('Tenant ID is required');
    });

    it('should use the provided tenant ID for connection', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Mock EventEntity methods specifically for this test
      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      // Act
      await service.processExternalEvent(mockEventDto, 'custom-tenant');

      // Assert
      expect(tenantService.getTenantConnection).toHaveBeenCalledWith(
        'custom-tenant',
      );
      expect(EventEntity.prototype.generateUlid).toHaveBeenCalled();
      expect(EventEntity.prototype.generateSlug).toHaveBeenCalled();
    });

    it('should handle location data correctly if provided', async () => {
      // Arrange
      const eventWithLocation: ExternalEventDto = {
        ...mockEventDto,
        location: {
          description: 'Test Location',
          lat: 40.7128,
          lon: -74.006,
          url: 'https://meet.google.com/abc-defg-hij',
        },
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Mock EventEntity methods specifically for this test
      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      let capturedEvent: any = null;
      eventRepository.save.mockImplementation((event: any) => {
        capturedEvent = event;
        return Promise.resolve({
          ...event,
          id: 2,
          // Add required methods
          generateUlid: jest.fn(),
          generateSlug: jest.fn(),
          setEntityName: jest.fn(),
          toJSON: jest.fn(),
          reload: jest.fn(),
          hasId: jest.fn(),
          remove: jest.fn(),
          softRemove: jest.fn(),
          recover: jest.fn(),
        } as unknown as EventEntity);
      });

      // Act
      await service.processExternalEvent(eventWithLocation, 'tenant1');

      // Assert
      expect(EventEntity.prototype.generateUlid).toHaveBeenCalled();
      expect(EventEntity.prototype.generateSlug).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(capturedEvent.location).toBe('Test Location');
      expect(capturedEvent.lat).toBe(40.7128);
      expect(capturedEvent.lon).toBe(-74.006);
      expect(capturedEvent.locationOnline).toBe(
        'https://meet.google.com/abc-defg-hij',
      );
    });
  });

  describe('Enhanced Deduplication Logic', () => {
    // Test primary method: source ID and type
    it('should find existing event by sourceId and sourceType', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        mockExistingEvent as unknown as EventEntity,
      ]);

      // Act
      const result = await service.processExternalEvent(
        mockEventDto,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        mockEventDto.source.id,
        mockEventDto.source.type,
        'tenant1',
      );
      expect(result.id).toBe(mockExistingEvent.id);
    });

    // Test secondary method: source URL
    it('should find existing event by sourceUrl when sourceId check fails', async () => {
      // Arrange
      // Primary method returns empty
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Different sourceId but same URL
      const eventWithDifferentSourceId: ExternalEventDto = {
        ...mockEventDto,
        source: {
          ...mockEventDto.source,
          id: 'different-id', // Changed source ID
        },
      };

      // Mock finding by URL
      eventRepository.find.mockImplementation((criteria: any) => {
        if (
          criteria?.where?.sourceUrl === mockEventDto.source.url &&
          criteria?.where?.sourceType === EventSourceType.BLUESKY
        ) {
          return Promise.resolve([mockExistingEvent as unknown as EventEntity]);
        }
        return Promise.resolve([]);
      });

      // Act
      const result = await service.processExternalEvent(
        eventWithDifferentSourceId,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        'different-id',
        EventSourceType.BLUESKY,
        'tenant1',
      );
      expect(eventRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sourceUrl: mockEventDto.source.url,
            sourceType: EventSourceType.BLUESKY,
          },
        }),
      );
      expect(result.id).toBe(mockExistingEvent.id);
    });

    // Test tertiary method: metadata fields (rkey)
    it('should find existing event by rkey in metadata when primary and secondary methods fail', async () => {
      // Arrange
      // Primary method returns empty
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Different sourceId and URL but same rkey
      const eventWithDifferentSourceIdAndUrl: ExternalEventDto = {
        ...mockEventDto,
        source: {
          ...mockEventDto.source,
          id: 'different-id', // Changed source ID
          url: 'https://different-url.com', // Changed URL
          metadata: {
            rkey: '1234', // Same rkey as existing event
          },
        },
      };

      // For secondary method (find by URL)
      eventRepository.find.mockResolvedValue([]);

      // For tertiary method (find by rkey)
      const mockGetMany = jest
        .fn()
        .mockResolvedValue([mockExistingEvent as unknown as EventEntity]);

      eventRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: mockGetMany,
      } as any);

      // Act
      const result = await service.processExternalEvent(
        eventWithDifferentSourceIdAndUrl,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        'different-id',
        EventSourceType.BLUESKY,
        'tenant1',
      );
      expect(eventRepository.find).toHaveBeenCalled();
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
      expect(result.id).toBe(mockExistingEvent.id);
    });

    // Test tertiary method: metadata fields (cid)
    it('should find existing event by cid in metadata when other methods fail', async () => {
      // Arrange
      // Primary method returns empty
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Different sourceId, URL, and rkey but has cid
      const eventWithDifferentSourceIdUrlRkey: ExternalEventDto = {
        ...mockEventDto,
        source: {
          ...mockEventDto.source,
          id: 'different-id', // Changed source ID
          url: 'https://different-url.com', // Changed URL
          metadata: {
            rkey: 'different-rkey', // Different rkey
            cid: 'some-cid', // But has CID
          },
        },
      };

      // Mock find by URL returning empty for the second check
      eventRepository.find.mockResolvedValue([]);

      // Setup the mock to return empty for rkey and an event for cid
      let queryCount = 0;
      eventRepository.createQueryBuilder.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          // First call (rkey) - return empty
          return {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          } as any;
        } else {
          // Second call (cid) - return the event
          return {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest
              .fn()
              .mockResolvedValue([mockExistingEvent as unknown as EventEntity]),
          } as any;
        }
      });

      // Act
      const result = await service.processExternalEvent(
        eventWithDifferentSourceIdUrlRkey,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        'different-id',
        EventSourceType.BLUESKY,
        'tenant1',
      );
      expect(eventRepository.find).toHaveBeenCalled();
      expect(eventRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(result.id).toBe(mockExistingEvent.id);
    });

    // Test fallback to creating new event when no match found
    it('should create a new event when no existing event is found by any method', async () => {
      // Arrange
      // All checks return empty
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);
      eventRepository.find.mockResolvedValue([]);
      eventRepository.createQueryBuilder.mockImplementation(() => {
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        } as any;
      });

      const newEventWithUnknownSource: ExternalEventDto = {
        ...mockEventDto,
        name: 'New Unique Event',
        source: {
          ...mockEventDto.source,
          id: 'unknown-id',
          url: 'https://unknown-url.com',
          metadata: {
            rkey: 'unknown-rkey',
            cid: 'unknown-cid',
          },
        },
      };

      // Set up for shadow account creation
      shadowAccountService.findOrCreateShadowAccount.mockResolvedValue(
        mockUser,
      );

      // Act
      const result = await service.processExternalEvent(
        newEventWithUnknownSource,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalled();
      expect(eventRepository.find).toHaveBeenCalled();
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
      expect(result.id).toBe(2); // New ID for created event
      expect(shadowAccountService.findOrCreateShadowAccount).toHaveBeenCalled();
    });
  });

  describe('deleteExternalEvent', () => {
    it('should successfully delete an existing event', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        mockExistingEvent as unknown as EventEntity,
      ]);

      // Act
      const result = await service.deleteExternalEvent(
        'did:plc:1234',
        EventSourceType.BLUESKY,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        'did:plc:1234',
        EventSourceType.BLUESKY,
        'tenant1',
      );
      expect(eventRepository.remove).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully deleted');
    });

    it('should return failure when no event is found to delete', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Act
      const result = await service.deleteExternalEvent(
        'unknown-id',
        EventSourceType.BLUESKY,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        'unknown-id',
        EventSourceType.BLUESKY,
        'tenant1',
      );
      expect(eventRepository.remove).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No events found matching');
    });

    it('should validate tenant ID requirement', async () => {
      // Act & Assert
      await expect(
        service.deleteExternalEvent(
          'did:plc:1234',
          EventSourceType.BLUESKY,
          '',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle error during deletion gracefully', async () => {
      // Arrange
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        mockExistingEvent as unknown as EventEntity,
      ]);

      // Mock an error during removal
      eventRepository.remove.mockRejectedValue(
        new Error('Database connection error'),
      );

      // Act
      const result = await service.deleteExternalEvent(
        'did:plc:1234',
        EventSourceType.BLUESKY,
        'tenant1',
      );

      // Assert
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalled();
      expect(eventRepository.remove).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully deleted 0 event(s)');
    });
  });

  describe('Error handling', () => {
    it('should throw an error for unsupported source types', async () => {
      // Arrange
      const unsupportedEvent: ExternalEventDto = {
        ...mockEventDto,
        source: {
          type: 'unsupported' as any,
          id: '12345',
        },
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Act & Assert
      await expect(
        service.processExternalEvent(unsupportedEvent, 'tenant1'),
      ).rejects.toThrow(/Unsupported source type/);
    });
  });

  describe('Bluesky event handling without handle', () => {
    it('should create a new Bluesky event when handle is not provided', async () => {
      // Arrange - Event from firehose without handle (only DID in metadata)
      const eventWithoutHandle: ExternalEventDto = {
        ...mockEventDto,
        source: {
          type: EventSourceType.BLUESKY,
          id: 'at://did:plc:abc123/community.lexicon.calendar.event/xyz789',
          // No handle provided - simulates firehose data
          metadata: {
            did: 'did:plc:abc123',
            rkey: 'xyz789',
            cid: 'bafyreiabc123',
          },
        },
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      // Mock EventEntity methods
      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      // Act
      const result = await service.processExternalEvent(
        eventWithoutHandle,
        'tenant1',
      );

      // Assert - Should use DID as fallback for handle
      expect(
        shadowAccountService.findOrCreateShadowAccount,
      ).toHaveBeenCalledWith(
        'did:plc:abc123', // DID extracted from AT URI
        'did:plc:abc123', // DID used as handle fallback
        AuthProvidersEnum.bluesky,
        'tenant1',
        expect.objectContaining({
          bluesky: expect.objectContaining({
            did: 'did:plc:abc123',
            handle: 'did:plc:abc123', // DID used as handle fallback
            connected: false,
          }),
        }),
      );

      expect(EventEntity.prototype.generateUlid).toHaveBeenCalled();
      expect(EventEntity.prototype.generateSlug).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(2);
    });

    it('should extract DID from AT Protocol URI when handle is missing', async () => {
      // Arrange
      const eventWithAtUri: ExternalEventDto = {
        ...mockEventDto,
        source: {
          type: EventSourceType.BLUESKY,
          id: 'at://did:plc:xyz789/community.lexicon.calendar.event/abc123',
          // No handle
          metadata: {
            rkey: 'abc123',
            cid: 'bafyreixyz789',
          },
        },
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      // Act
      await service.processExternalEvent(eventWithAtUri, 'tenant1');

      // Assert - Should extract DID from URI and use it as handle fallback
      expect(
        shadowAccountService.findOrCreateShadowAccount,
      ).toHaveBeenCalledWith(
        'did:plc:xyz789',
        'did:plc:xyz789',
        AuthProvidersEnum.bluesky,
        'tenant1',
        expect.any(Object),
      );
    });

    it('should use provided handle when available even if DID is in metadata', async () => {
      // Arrange
      const eventWithBothHandleAndDid: ExternalEventDto = {
        ...mockEventDto,
        source: {
          type: EventSourceType.BLUESKY,
          id: 'at://did:plc:abc123/community.lexicon.calendar.event/xyz789',
          handle: 'user.bsky.social', // Handle provided
          metadata: {
            did: 'did:plc:abc123',
            rkey: 'xyz789',
          },
        },
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      const entity = new EventEntity();
      eventRepository.create.mockReturnValue(entity);

      // Act
      await service.processExternalEvent(eventWithBothHandleAndDid, 'tenant1');

      // Assert - Should use the provided handle, not the DID
      expect(
        shadowAccountService.findOrCreateShadowAccount,
      ).toHaveBeenCalledWith(
        'did:plc:abc123',
        'user.bsky.social', // Uses provided handle
        AuthProvidersEnum.bluesky,
        'tenant1',
        expect.objectContaining({
          bluesky: expect.objectContaining({
            did: 'did:plc:abc123',
            handle: 'user.bsky.social',
            connected: false,
          }),
        }),
      );
    });
  });

  describe('Native Event Matching by atprotoRkey', () => {
    it('should find native OpenMeet event by atprotoRkey when it comes back from firehose', async () => {
      // Arrange - native event that was published to AT Protocol
      const nativeEvent = {
        id: 100,
        name: 'Native OpenMeet Event',
        description: 'Created in OpenMeet, published to ATProto',
        startDate: new Date('2024-01-01T10:00:00Z'),
        endDate: new Date('2024-01-01T11:00:00Z'),
        type: EventType.InPerson,
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
        sourceType: null, // Native event - no sourceType
        atprotoRkey: 'native123rkey', // Pre-generated TID
        atprotoUri:
          'at://did:plc:openmeet/community.lexicon.calendar.event/native123rkey',
        user: mockUser,
      } as Partial<EventEntity>;

      // Firehose delivers our own event back to us
      const firehoseEvent: ExternalEventDto = {
        name: 'Native OpenMeet Event',
        description: 'Created in OpenMeet, published to ATProto',
        startDate: '2024-01-01T10:00:00Z',
        endDate: '2024-01-01T11:00:00Z',
        type: EventType.InPerson,
        source: {
          type: EventSourceType.BLUESKY,
          id: 'at://did:plc:openmeet/community.lexicon.calendar.event/native123rkey',
          handle: 'openmeet.bsky.social',
          metadata: {
            rkey: 'native123rkey',
          },
        },
      };

      // Primary source lookup returns empty (this is NOT an imported event)
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);
      // Secondary URL lookup returns empty
      eventRepository.find.mockResolvedValue([]);
      // Tertiary rkey lookup in sourceData returns empty
      eventRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);
      // Native event lookup by atprotoRkey should find it
      eventRepository.findOne.mockResolvedValue(
        nativeEvent as unknown as EventEntity,
      );

      // Act
      const result = await service.processExternalEvent(
        firehoseEvent,
        'tenant1',
      );

      // Assert - should find the native event by atprotoRkey
      expect(result.id).toBe(nativeEvent.id);
      expect(eventRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            atprotoRkey: 'native123rkey',
          }),
        }),
      );
    });
  });
});
