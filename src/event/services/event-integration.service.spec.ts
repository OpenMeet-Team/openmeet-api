import { Test, TestingModule } from '@nestjs/testing';
import { EventIntegrationService } from './event-integration.service';
import { EventQueryService } from './event-query.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../bluesky/shadow-account/shadow-account.service';
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

describe('EventIntegrationService', () => {
  let service: EventIntegrationService;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let shadowAccountService: jest.Mocked<ShadowAccountService>;
  let eventRepository: jest.Mocked<Repository<EventEntity>>;

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
    } as any;

    tenantService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockTenantConnection),
    } as any;

    shadowAccountService = {
      findOrCreateShadowAccount: jest.fn().mockResolvedValue(mockUser),
    } as any;

    // Instead of creating a mock object, we'll use Jest's spying capability
    const EventEntityMock = {
      prototype: {
        generateUlid: jest.fn(),
        generateSlug: jest.fn(),
      },
    };

    // Setup repository mocks with proper type casting
    eventRepository = {
      findOne: jest.fn(),
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
        'tenant1',
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
        service.processExternalEvent(mockEventDto, '')
      ).rejects.toThrow('Tenant ID is required');
      
      await expect(
        service.processExternalEvent(mockEventDto, null as any)
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
      expect(tenantService.getTenantConnection).toHaveBeenCalledWith('custom-tenant');
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
      await service.processExternalEvent(
        eventWithLocation,
        'tenant1',
      );

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
});
