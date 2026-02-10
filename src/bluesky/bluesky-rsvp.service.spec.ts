import { Test, TestingModule } from '@nestjs/testing';
import { BlueskyRsvpService } from './bluesky-rsvp.service';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { AtprotoLexiconService } from './atproto-lexicon.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventSourceType } from '../core/constants/source-type.constant';
import { Counter, Histogram } from 'prom-client';
import { Agent } from '@atproto/api';

describe('BlueskyRsvpService', () => {
  let service: BlueskyRsvpService;
  let blueskyService: jest.Mocked<BlueskyService>;
  let blueskyIdService: jest.Mocked<BlueskyIdService>;
  let atprotoLexiconService: jest.Mocked<AtprotoLexiconService>;
  let rsvpOperationsCounter: jest.Mocked<Counter<string>>;
  let processingDuration: jest.Mocked<Histogram<string>>;

  beforeEach(async () => {
    // Create mocks manually instead of using @golevelup/ts-jest
    blueskyService = {
      resumeSession: jest.fn(),
    } as unknown as jest.Mocked<BlueskyService>;

    blueskyIdService = {
      createUri: jest.fn(),
      parseUri: jest.fn(),
    } as unknown as jest.Mocked<BlueskyIdService>;

    atprotoLexiconService = {
      validate: jest.fn().mockReturnValue({ success: true, value: {} }),
    } as unknown as jest.Mocked<AtprotoLexiconService>;

    rsvpOperationsCounter = {
      inc: jest.fn(),
    } as unknown as jest.Mocked<Counter<string>>;

    processingDuration = {
      startTimer: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as jest.Mocked<Histogram<string>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlueskyRsvpService,
        {
          provide: BlueskyService,
          useValue: blueskyService,
        },
        {
          provide: BlueskyIdService,
          useValue: blueskyIdService,
        },
        {
          provide: AtprotoLexiconService,
          useValue: atprotoLexiconService,
        },
        {
          provide: 'PROM_METRIC_BLUESKY_RSVP_OPERATIONS_TOTAL',
          useValue: rsvpOperationsCounter,
        },
        {
          provide: 'PROM_METRIC_BLUESKY_RSVP_PROCESSING_DURATION_SECONDS',
          useValue: processingDuration,
        },
      ],
    }).compile();

    service = module.get<BlueskyRsvpService>(BlueskyRsvpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRsvp', () => {
    it('should create an RSVP in Bluesky PDS', async () => {
      // Mock event data with all required properties
      const event = {
        id: 1,
        name: 'Test Event',
        sourceType: EventSourceType.BLUESKY,
        sourceData: {
          did: 'did:plc:abcdef123456',
          rkey: 'event123',
          cid: 'bafyreieventcid123',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'ulid123',
        slug: 'test-event',
        description: 'Test event description',
        location: null,
        startTime: new Date(),
        endTime: new Date(),
        timezone: 'UTC',
        published: true,
        visibility: 'public',
        canceled: false,
        status: 'active',
        // Add other required properties as null or default values
        venue: null,
        maxAttendees: null,
        coverPhoto: null,
        recurrence: null,
        metadata: {},
        isPublished: true,
        owner: null,
        tags: [],
        organization: null,
        tenant: null,
        categories: [],
        attendees: [],
        linkedChatRooms: [],
        photo: null,
        ownerId: 1,
        tenantId: 'test-tenant',
        linkedOrganizations: [],
        series: null,
        seriesId: null,
      } as unknown as EventEntity;

      // Mock the user's Bluesky DID
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock the event URI
      const mockEventUri =
        'at://did:plc:abcdef123456/community.lexicon.calendar.event/event123';
      blueskyIdService.createUri.mockReturnValueOnce(mockEventUri);

      // Mock the RSVP URI for the return value
      const mockRsvpUri =
        'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event123-rsvp-123456789';
      blueskyIdService.createUri.mockReturnValueOnce(mockRsvpUri);

      // Mock the Bluesky agent
      const mockAgent = {
        com: {
          atproto: {
            repo: {
              putRecord: jest.fn().mockResolvedValue({
                data: {
                  uri: mockRsvpUri,
                  cid: 'cidxyz123',
                },
              }),
            },
          },
        },
      };
      blueskyService.resumeSession.mockResolvedValue(
        mockAgent as unknown as Agent,
      );

      // Call the service method
      const result = await service.createRsvp(
        event,
        'going',
        userDid,
        tenantId,
      );

      // Assert the expected behavior
      expect(blueskyIdService.createUri).toHaveBeenNthCalledWith(
        1,
        'did:plc:abcdef123456',
        'community.lexicon.calendar.event',
        'event123',
      );
      expect(blueskyService.resumeSession).toHaveBeenCalledWith(
        tenantId,
        userDid,
      );
      expect(mockAgent.com.atproto.repo.putRecord).toHaveBeenCalledWith({
        repo: userDid,
        collection: 'community.lexicon.calendar.rsvp',
        rkey: expect.any(String), // Deterministic hash-based rkey
        record: {
          $type: 'community.lexicon.calendar.rsvp',
          subject: {
            uri: mockEventUri,
            cid: 'bafyreieventcid123', // StrongRef includes CID
          },
          status: 'community.lexicon.calendar.rsvp#going', // NSID-prefixed status
          createdAt: expect.any(String),
        },
      });
      expect(rsvpOperationsCounter.inc).toHaveBeenCalledWith({
        tenant: tenantId,
        operation: 'create',
        status: 'going',
      });
      expect(result).toEqual({
        success: true,
        rsvpUri: mockRsvpUri,
        rsvpCid: 'cidxyz123',
      });
    });

    it('should call lexicon validation before putRecord', async () => {
      // Mock event data
      const event = {
        id: 1,
        name: 'Test Event',
        sourceType: EventSourceType.BLUESKY,
        sourceData: {
          did: 'did:plc:abcdef123456',
          rkey: 'event123',
          cid: 'bafyreieventcid123',
        },
      } as unknown as EventEntity;

      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      const mockEventUri =
        'at://did:plc:abcdef123456/community.lexicon.calendar.event/event123';
      blueskyIdService.createUri.mockReturnValueOnce(mockEventUri);
      blueskyIdService.createUri.mockReturnValueOnce(
        'at://did:plc:xyz789/community.lexicon.calendar.rsvp/rkey',
      );

      const mockAgent = {
        com: {
          atproto: {
            repo: {
              putRecord: jest.fn().mockResolvedValue({
                data: { uri: 'mock-uri', cid: 'mock-cid' },
              }),
            },
          },
        },
      };
      blueskyService.resumeSession.mockResolvedValue(
        mockAgent as unknown as Agent,
      );

      await service.createRsvp(event, 'going', userDid, tenantId);

      // Validate should be called with RSVP collection and record data
      expect(atprotoLexiconService.validate).toHaveBeenCalledWith(
        'community.lexicon.calendar.rsvp',
        expect.objectContaining({
          $type: 'community.lexicon.calendar.rsvp',
          status: 'community.lexicon.calendar.rsvp#going',
        }),
      );
    });

    it('should throw when lexicon validation fails for RSVP', async () => {
      // Mock event data
      const event = {
        id: 1,
        name: 'Test Event',
        sourceType: EventSourceType.BLUESKY,
        sourceData: {
          did: 'did:plc:abcdef123456',
          rkey: 'event123',
          cid: 'bafyreieventcid123',
        },
      } as unknown as EventEntity;

      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      const mockEventUri =
        'at://did:plc:abcdef123456/community.lexicon.calendar.event/event123';
      blueskyIdService.createUri.mockReturnValueOnce(mockEventUri);

      const mockAgent = {
        com: {
          atproto: {
            repo: {
              putRecord: jest.fn(),
            },
          },
        },
      };
      blueskyService.resumeSession.mockResolvedValue(
        mockAgent as unknown as Agent,
      );

      // Mock validation failure
      atprotoLexiconService.validate.mockReturnValueOnce({
        success: false,
        error: { message: 'Record/subject must have the property "cid"' },
      } as any);

      await expect(
        service.createRsvp(event, 'going', userDid, tenantId),
      ).rejects.toThrow('AT Protocol record validation failed');

      // putRecord should NOT have been called
      expect(mockAgent.com.atproto.repo.putRecord).not.toHaveBeenCalled();
    });

    it('should throw an error if event does not have Bluesky source data', async () => {
      // Mock an event without source data
      const event = {
        id: 1,
        name: 'Non-Bluesky Event',
        sourceType: EventSourceType.OTHER,
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'ulid123',
        slug: 'non-bluesky-event',
        description: 'Test event description',
        location: null,
        startTime: new Date(),
        endTime: new Date(),
        timezone: 'UTC',
        published: true,
        visibility: 'public',
        canceled: false,
        status: 'active',
        // Add other required properties as null or default values
        venue: null,
        maxAttendees: null,
        coverPhoto: null,
        recurrence: null,
        metadata: {},
        isPublished: true,
        owner: null,
        tags: [],
        organization: null,
        tenant: null,
        categories: [],
        attendees: [],
        linkedChatRooms: [],
        photo: null,
        ownerId: 1,
        tenantId: 'test-tenant',
        linkedOrganizations: [],
        series: null,
        seriesId: null,
      } as unknown as EventEntity;

      // Call the service method and expect it to throw
      await expect(
        service.createRsvp(event, 'going', 'did:plc:xyz789', 'tenant123'),
      ).rejects.toThrow('Event does not have AT Protocol source information');
    });
  });

  describe('deleteRsvp', () => {
    it('should delete an RSVP from Bluesky PDS', async () => {
      // Mock RSVP URI and parsed components
      const rsvpUri =
        'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event123-rsvp-123456789';
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock the parsed URI
      blueskyIdService.parseUri.mockReturnValue({
        did: userDid,
        collection: 'community.lexicon.calendar.rsvp',
        rkey: 'event123-rsvp-123456789',
      });

      // Mock the Bluesky agent
      const mockAgent = {
        com: {
          atproto: {
            repo: {
              deleteRecord: jest.fn().mockResolvedValue({}),
            },
          },
        },
      };
      blueskyService.resumeSession.mockResolvedValue(
        mockAgent as unknown as Agent,
      );

      // Call the service method
      const result = await service.deleteRsvp(rsvpUri, userDid, tenantId);

      // Assert the expected behavior
      expect(blueskyIdService.parseUri).toHaveBeenCalledWith(rsvpUri);
      expect(blueskyService.resumeSession).toHaveBeenCalledWith(
        tenantId,
        userDid,
      );
      expect(mockAgent.com.atproto.repo.deleteRecord).toHaveBeenCalledWith({
        repo: userDid,
        collection: 'community.lexicon.calendar.rsvp',
        rkey: 'event123-rsvp-123456789',
      });
      expect(rsvpOperationsCounter.inc).toHaveBeenCalledWith({
        tenant: tenantId,
        operation: 'delete',
      });
      expect(result).toEqual({
        success: true,
      });
    });

    it('should throw an error if RSVP URI DID does not match provided DID', async () => {
      // Mock RSVP URI with a different DID
      const rsvpUri =
        'at://did:plc:different/community.lexicon.calendar.rsvp/event123-rsvp-123456789';
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock the parsed URI with a different DID
      blueskyIdService.parseUri.mockReturnValue({
        did: 'did:plc:different',
        collection: 'community.lexicon.calendar.rsvp',
        rkey: 'event123-rsvp-123456789',
      });

      // Call the service method and expect it to throw
      await expect(
        service.deleteRsvp(rsvpUri, userDid, tenantId),
      ).rejects.toThrow(/RSVP URI DID .* does not match provided DID/);
    });
  });

  describe('listRsvps', () => {
    it('should list RSVPs from Bluesky PDS', async () => {
      // Mock user DID and tenant ID
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock RSVP records from Bluesky
      const mockRecords = {
        data: {
          records: [
            {
              uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event1-rsvp',
              cid: 'cid1',
              rkey: 'event1-rsvp',
              value: {
                status: 'going',
                subject: {
                  uri: 'at://did:plc:abc/community.lexicon.calendar.event/event1',
                },
                createdAt: '2023-01-01T12:00:00Z',
              },
            },
            {
              uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event2-rsvp',
              cid: 'cid2',
              rkey: 'event2-rsvp',
              value: {
                status: 'interested',
                subject: {
                  uri: 'at://did:plc:def/community.lexicon.calendar.event/event2',
                },
                createdAt: '2023-01-02T12:00:00Z',
              },
            },
          ],
        },
      };

      // Mock the Bluesky agent
      const mockAgent = {
        com: {
          atproto: {
            repo: {
              listRecords: jest.fn().mockResolvedValue(mockRecords),
            },
          },
        },
      };
      blueskyService.resumeSession.mockResolvedValue(
        mockAgent as unknown as Agent,
      );

      // Mock the URI creation for each record
      blueskyIdService.createUri
        .mockReturnValueOnce(
          'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event1-rsvp',
        )
        .mockReturnValueOnce(
          'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event2-rsvp',
        );

      // Call the service method
      const result = await service.listRsvps(userDid, tenantId);

      // Assert the expected behavior
      expect(blueskyService.resumeSession).toHaveBeenCalledWith(
        tenantId,
        userDid,
      );
      expect(mockAgent.com.atproto.repo.listRecords).toHaveBeenCalledWith({
        repo: userDid,
        collection: 'community.lexicon.calendar.rsvp',
      });
      expect(blueskyIdService.createUri).toHaveBeenCalledTimes(2);
      expect(rsvpOperationsCounter.inc).toHaveBeenCalledWith({
        tenant: tenantId,
        operation: 'list',
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event1-rsvp',
        cid: 'cid1',
        rkey: 'event1-rsvp',
        status: 'going',
        eventUri: 'at://did:plc:abc/community.lexicon.calendar.event/event1',
        createdAt: '2023-01-01T12:00:00Z',
      });
      expect(result[1]).toEqual({
        uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event2-rsvp',
        cid: 'cid2',
        rkey: 'event2-rsvp',
        status: 'interested',
        eventUri: 'at://did:plc:def/community.lexicon.calendar.event/event2',
        createdAt: '2023-01-02T12:00:00Z',
      });
    });
  });

  describe('findRsvpForEvent', () => {
    it('should find an RSVP for a specific event', async () => {
      // Mock event URI, user DID, and tenant ID
      const eventUri =
        'at://did:plc:abc/community.lexicon.calendar.event/event1';
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock the list of RSVPs
      const mockRsvps = [
        {
          uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event1-rsvp',
          cid: 'cid1',
          rkey: 'event1-rsvp',
          status: 'going',
          eventUri: 'at://did:plc:abc/community.lexicon.calendar.event/event1',
          createdAt: '2023-01-01T12:00:00Z',
        },
        {
          uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event2-rsvp',
          cid: 'cid2',
          rkey: 'event2-rsvp',
          status: 'interested',
          eventUri: 'at://did:plc:def/community.lexicon.calendar.event/event2',
          createdAt: '2023-01-02T12:00:00Z',
        },
      ];

      // Mock the listRsvps method
      jest.spyOn(service, 'listRsvps').mockResolvedValue(mockRsvps);

      // Call the service method
      const result = await service.findRsvpForEvent(
        eventUri,
        userDid,
        tenantId,
      );

      // Assert the expected behavior
      expect(service.listRsvps).toHaveBeenCalledWith(userDid, tenantId);
      expect(result).toEqual({
        exists: true,
        rsvp: mockRsvps[0],
      });
    });

    it('should return exists=false if no RSVP found for the event', async () => {
      // Mock event URI, user DID, and tenant ID
      const eventUri =
        'at://did:plc:abc/community.lexicon.calendar.event/nonexistent';
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock the list of RSVPs
      const mockRsvps = [
        {
          uri: 'at://did:plc:xyz789/community.lexicon.calendar.rsvp/event1-rsvp',
          cid: 'cid1',
          rkey: 'event1-rsvp',
          status: 'going',
          eventUri: 'at://did:plc:abc/community.lexicon.calendar.event/event1',
          createdAt: '2023-01-01T12:00:00Z',
        },
      ];

      // Mock the listRsvps method
      jest.spyOn(service, 'listRsvps').mockResolvedValue(mockRsvps);

      // Call the service method
      const result = await service.findRsvpForEvent(
        eventUri,
        userDid,
        tenantId,
      );

      // Assert the expected behavior
      expect(service.listRsvps).toHaveBeenCalledWith(userDid, tenantId);
      expect(result).toEqual({
        exists: false,
      });
    });

    it('should handle errors and return exists=false', async () => {
      // Mock event URI, user DID, and tenant ID
      const eventUri =
        'at://did:plc:abc/community.lexicon.calendar.event/event1';
      const userDid = 'did:plc:xyz789';
      const tenantId = 'tenant123';

      // Mock an error in listRsvps
      jest
        .spyOn(service, 'listRsvps')
        .mockRejectedValue(new Error('Failed to list RSVPs'));

      // Call the service method
      const result = await service.findRsvpForEvent(
        eventUri,
        userDid,
        tenantId,
      );

      // Assert the expected behavior
      expect(service.listRsvps).toHaveBeenCalledWith(userDid, tenantId);
      expect(result).toEqual({
        exists: false,
      });
    });
  });
});
