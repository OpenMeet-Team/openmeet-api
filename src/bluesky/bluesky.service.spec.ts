import { Test, TestingModule } from '@nestjs/testing';
import { BlueskyService } from './bluesky.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { EventManagementService } from '../event/services/event-management.service';
import { EventQueryService } from '../event/services/event-query.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventType, EventStatus } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { BlueskyIdService } from './bluesky-id.service';
import { BlueskyIdentityService } from './bluesky-identity.service';

// Mock modules first before creating mock implementations
jest.mock('@atproto/api', () => ({
  Agent: jest.fn(),
}));
jest.mock('@atproto/oauth-client-node');
jest.mock('../utils/bluesky', () => ({
  initializeOAuthClient: jest.fn(),
}));
jest.mock('../utils/delay', () => ({
  delay: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@atproto/identity', () => ({
  HandleResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue('did:plc:test-resolved'),
  })),
  DidResolver: jest.fn().mockImplementation(() => ({
    resolveNoCheck: jest.fn().mockResolvedValue({
      id: 'did:plc:test-resolved',
      alsoKnownAs: ['at://test.user'],
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://test-pds.example.com',
        },
      ],
    }),
  })),
  IdResolver: jest.fn().mockImplementation(() => ({
    handle: {
      resolve: jest.fn().mockResolvedValue('did:plc:test-resolved'),
    },
    did: {
      resolveNoCheck: jest.fn().mockResolvedValue({
        id: 'did:plc:test-resolved',
        alsoKnownAs: ['at://test.user'],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://test-pds.example.com',
          },
        ],
      }),
    },
  })),
  getPds: jest.fn().mockReturnValue('https://test-pds.example.com'),
  getHandle: jest.fn().mockReturnValue('test.user'),
}));

// Create mock service implementations
const mockUserService = {
  findById: jest.fn(),
  update: jest.fn(),
};

const mockElastiCacheService = {
  withLock: jest.fn().mockImplementation((key, callback) => callback()),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockEventManagementService = {
  remove: jest.fn().mockResolvedValue({}),
};

const mockEventQueryService = {
  findByBlueskySource: jest.fn(),
};

const mockBlueskyIdService = {
  parseUri: jest.fn(),
};

const mockBlueskyIdentityService = {
  resolveProfile: jest.fn().mockResolvedValue({
    did: 'did:plc:test-resolved',
    handle: 'test.user',
    displayName: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    followersCount: 100,
    followingCount: 50,
    postsCount: 20,
    description: 'Test description',
    source: 'atprotocol-public',
  }),
  extractHandleFromDid: jest.fn().mockResolvedValue('test.user'),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockTenantConnectionService = {
  getTenantConnection: jest.fn().mockResolvedValue({}),
};

const mockRequest = {
  tenantId: 'test-tenant',
};

// Mock Agent implementation to return in tests
const mockAgentImplementation = {
  getProfile: jest.fn().mockResolvedValue({}),
  com: {
    atproto: {
      repo: {
        getRecord: jest.fn(),
        putRecord: jest.fn().mockResolvedValue({
          uri: 'at://test/test',
          cid: 'test-cid',
        }),
        listRecords: jest.fn().mockResolvedValue({
          data: { records: [] },
        }),
        deleteRecord: jest.fn().mockResolvedValue({}),
      },
    },
  },
};

// Mock oauth client implementation
const mockOAuthClientImplementation = {
  restore: jest.fn().mockResolvedValue({ did: 'test-did' }),
  delete: jest.fn().mockResolvedValue(true),
};

describe('BlueskyService', () => {
  let service: BlueskyService;

  // Set up mocks before tests
  beforeAll(() => {
    // Mock Agent constructor
    const { Agent } = jest.requireMock('@atproto/api');
    Agent.mockImplementation(() => mockAgentImplementation);

    // Mock OAuth client initialization
    const { initializeOAuthClient } = jest.requireMock('../utils/bluesky');
    initializeOAuthClient.mockResolvedValue(mockOAuthClientImplementation);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlueskyService,
        { provide: UserService, useValue: mockUserService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ElastiCacheService, useValue: mockElastiCacheService },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        { provide: EventQueryService, useValue: mockEventQueryService },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        { provide: REQUEST, useValue: mockRequest },
        { provide: BlueskyIdService, useValue: mockBlueskyIdService },
        {
          provide: BlueskyIdentityService,
          useValue: mockBlueskyIdentityService,
        },
      ],
    }).compile();

    service = module.get<BlueskyService>(BlueskyService);
  });

  describe('connectAccount', () => {
    it('should connect a Bluesky account', async () => {
      // Arrange
      const user = {
        id: 1,
        socialId: 'did:plc:test-user',
        preferences: {},
      } as UserEntity;

      const tenantId = 'test-tenant';

      mockUserService.findById.mockResolvedValue({
        ...user,
        preferences: { someOtherPreference: true },
      });

      // Act
      const result = await service.connectAccount(user, tenantId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              did: 'did:plc:test-user',
              connected: true,
            }),
          }),
        }),
        tenantId,
      );
    });

    it('should use DID from existingUser.socialId, not from user parameter (JWT payload)', async () => {
      // Arrange
      // Simulate JWT payload user (no socialId, as JWT doesn't include it)
      const jwtUser = {
        id: 1,
        // socialId is NOT in JWT payload, so it's undefined
        socialId: undefined,
        preferences: {},
      } as UserEntity;

      const tenantId = 'test-tenant';

      // Database user has the correct socialId
      mockUserService.findById.mockResolvedValue({
        id: 1,
        socialId: 'did:plc:database-user-did',
        preferences: { existingPref: true },
      });

      // Act
      const result = await service.connectAccount(jwtUser, tenantId);

      // Assert
      expect(result.success).toBe(true);
      // The DID should come from existingUser (database), not from user parameter (JWT)
      expect(mockUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              did: 'did:plc:database-user-did', // From database, not undefined
              connected: true,
            }),
          }),
        }),
        tenantId,
      );
    });

    it('should throw if user not found', async () => {
      // Arrange
      const user = {
        id: 1,
        socialId: 'did:plc:test-user',
      } as UserEntity;

      const tenantId = 'test-tenant';

      mockUserService.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.connectAccount(user, tenantId)).rejects.toThrow(
        /User with id 1 not found/,
      );
    });
  });

  describe('disconnectAccount', () => {
    it('should disconnect a Bluesky account', async () => {
      // Arrange
      const user = {
        id: 1,
        socialId: 'did:plc:test-user',
        preferences: {},
      } as UserEntity;

      const tenantId = 'test-tenant';

      mockUserService.findById.mockResolvedValue({
        ...user,
        preferences: {
          bluesky: {
            did: 'did:plc:test-user',
            connected: true,
            handle: 'test.user',
          },
          someOtherPreference: true,
        },
      });

      // Act
      const result = await service.disconnectAccount(user, tenantId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              connected: false,
            }),
          }),
        }),
        tenantId,
      );
    });

    it('should use DID from existingUser.socialId, not from user parameter (JWT payload)', async () => {
      // Arrange
      // Simulate JWT payload user (no socialId, as JWT doesn't include it)
      const jwtUser = {
        id: 1,
        // socialId is NOT in JWT payload, so it's undefined
        socialId: undefined,
        preferences: {},
      } as UserEntity;

      const tenantId = 'test-tenant';

      // Database user has the correct socialId
      mockUserService.findById.mockResolvedValue({
        id: 1,
        socialId: 'did:plc:database-user-did',
        preferences: {
          bluesky: {
            did: 'did:plc:database-user-did',
            connected: true,
            handle: 'test.user',
          },
        },
      });

      // Act
      const result = await service.disconnectAccount(jwtUser, tenantId);

      // Assert
      expect(result.success).toBe(true);
      // The DID should come from existingUser (database), not from user parameter (JWT)
      expect(mockUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              did: 'did:plc:database-user-did', // From database, not undefined
              connected: false,
            }),
          }),
        }),
        tenantId,
      );
    });
  });

  // Test handling external event deletion
  describe('handleExternalEventDeletion', () => {
    it('should delete matching events when event is deleted in Bluesky', async () => {
      // Arrange
      const mockEvents = [
        { slug: 'test-event-1' },
        { slug: 'test-event-2' },
      ] as EventEntity[];

      mockEventQueryService.findByBlueskySource.mockResolvedValue(mockEvents);

      // Act
      const result = await service.handleExternalEventDeletion(
        'did:plc:test',
        'test-rkey',
        'test-tenant',
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockEventManagementService.remove).toHaveBeenCalledTimes(2);
    });
  });

  // Test session management
  describe('Session management', () => {
    describe('resumeSession', () => {
      it('should return an agent when successful', async () => {
        // Act
        const result = await service.tryResumeSession(
          'test-tenant',
          'test-did',
        );

        // Assert
        expect(result).toBeDefined();
      });

      it('should handle session errors gracefully', async () => {
        // Arrange
        // Mock the OAuthClient restore method to throw an error
        const mockClient = {
          restore: jest.fn().mockRejectedValue(new Error('Some session error')),
        };
        jest
          .spyOn(service as any, 'getOAuthClient')
          .mockResolvedValue(mockClient);

        // Act & Assert
        await expect(
          service.tryResumeSession('test-tenant', 'test-did'),
        ).rejects.toThrow('Unable to access your Bluesky account');
      });
    });
  });

  // Test session reset
  describe('resetSession', () => {
    it('should reset a session successfully', async () => {
      // Arrange
      const did = 'test-did';
      const tenantId = 'test-tenant';

      // Act
      const result = await service.resetSession(did, tenantId);

      // Assert
      expect(result.success).toBe(true);
      // Verify the Redis del was called with the correct key
      expect(mockElastiCacheService.del).toHaveBeenCalledWith(
        `bluesky:session:${did}`,
      );
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const did = 'test-did';
      const tenantId = 'test-tenant';

      // Mock elasticache del to throw an error
      mockElastiCacheService.del.mockRejectedValueOnce(
        new Error('Failed to delete session'),
      );

      // Act
      const result = await service.resetSession(did, tenantId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to reset session');
    });
  });

  // Test public profile lookup
  describe('getPublicProfile', () => {
    // Set up mock response data
    const mockProfileData = {
      did: 'did:plc:test-resolved',
      handle: 'test.user',
      displayName: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
      followersCount: 100,
      followingCount: 50,
      postsCount: 25,
      description: 'Test user bio',
      indexedAt: '2023-01-01T00:00:00Z',
    };

    beforeEach(() => {
      // Mock the getProfile method to return test data
      mockAgentImplementation.getProfile.mockResolvedValue({
        data: mockProfileData,
      });

      // Ensure the import is mocked
      const { HandleResolver, getPds } = jest.requireMock('@atproto/identity');
      const mockResolve = jest.fn().mockResolvedValue('did:plc:test-resolved');
      HandleResolver.mockImplementation(() => ({
        resolve: mockResolve,
      }));
      getPds.mockResolvedValue('https://test-pds.example.com');
    });

    it('should resolve a handle to a DID and fetch profile data', async () => {
      // Arrange
      const handle = 'test.user';

      // Act
      const result = await service.getPublicProfile(handle);

      // Assert
      expect(result).toBeDefined();
      expect(result.did).toBe('did:plc:test-resolved');
      expect(result.handle).toBe('test.user');
    });

    it('should use the provided DID directly if available', async () => {
      // Arrange
      const did = 'did:plc:direct-did';

      // Act
      const result = await service.getPublicProfile(did);

      // Assert
      expect(result).toBeDefined();
    });

    it('should handle errors during profile lookup', async () => {
      // Arrange
      const handle = 'error.user';

      // Mock BlueskyIdentityService to throw an error
      mockBlueskyIdentityService.resolveProfile.mockRejectedValueOnce(
        new Error('Unable to resolve profile for error.user: Handle not found'),
      );

      // Act & Assert
      await expect(service.getPublicProfile(handle)).rejects.toThrow();
    });
  });

  // Test enhanced profile lookup
  describe('getEnhancedProfile', () => {
    it('should return enhanced profile data for a user', async () => {
      // Arrange
      const connectedAt = new Date('2023-01-01');
      const user = {
        id: 1,
        preferences: {
          bluesky: {
            did: 'did:plc:test-user',
            handle: 'test.user',
            avatar: 'https://example.com/old-avatar.jpg',
            connected: true,
            connectedAt,
          },
        },
      } as UserEntity;

      const tenantId = 'test-tenant';

      // Mock getPublicProfile to return test data
      jest.spyOn(service, 'getPublicProfile').mockResolvedValue({
        did: 'did:plc:test-user',
        handle: 'test.user',
        displayName: 'Test User',
        avatar: 'https://example.com/new-avatar.jpg',
        followersCount: 100,
        followingCount: 50,
        description: 'Updated bio',
      });

      // Act
      const result = await service.getEnhancedProfile(user, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.did).toBe('did:plc:test-user');
      expect(result.handle).toBe('test.user');
      expect(result.displayName).toBe('Test User');
      expect(result.avatar).toBe('https://example.com/new-avatar.jpg');
      expect(result.connected).toBe(true);
      expect(result.connectedAt).toEqual(connectedAt);
    });

    it('should handle users without ATProtocol account', async () => {
      // Arrange
      const user = {
        id: 1,
        preferences: {},
      } as UserEntity;

      const tenantId = 'test-tenant';

      // Act
      const result = await service.getEnhancedProfile(user, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.connected).toBe(false);
      expect(result.message).toBe('No ATProtocol account connected');
    });

    it('should fallback to stored data if profile lookup fails', async () => {
      // Arrange
      const user = {
        id: 1,
        preferences: {
          bluesky: {
            did: 'did:plc:test-user',
            handle: 'test.user',
            avatar: 'https://example.com/avatar.jpg',
            connected: true,
            connectedAt: new Date('2023-01-01'),
          },
        },
      } as UserEntity;

      const tenantId = 'test-tenant';

      // Mock getPublicProfile to throw an error
      jest
        .spyOn(service, 'getPublicProfile')
        .mockRejectedValue(new Error('Lookup failed'));

      // Act
      const result = await service.getEnhancedProfile(user, tenantId);

      // Assert
      expect(result).toBeDefined();
      expect(result.did).toBe('did:plc:test-user');
      expect(result.handle).toBe('test.user');
      expect(result.avatar).toBe('https://example.com/avatar.jpg');
      expect(result.connected).toBe(true);
      expect(result.message).toContain('Limited profile data available');
    });
  });

  // Test event creation
  describe('createEventRecord', () => {
    it('should create an event on Bluesky', async () => {
      // Arrange
      const event = {
        name: 'Test Event',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.Hybrid,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      const result = await service.createEventRecord(
        event,
        did,
        handle,
        tenantId,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.rkey).toBeDefined();
      expect(
        mockAgentImplementation.com.atproto.repo.putRecord,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: did,
          collection: 'community.lexicon.calendar.event',
          record: expect.objectContaining({
            name: 'Test Event',
            description: 'Test Description',
          }),
        }),
      );
    });

    it('should handle errors during event creation', async () => {
      // Arrange
      const event = {
        name: 'Test Event',
        description: 'Test Description',
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Mock putRecord to throw an error
      mockAgentImplementation.com.atproto.repo.putRecord.mockRejectedValueOnce(
        new Error('Failed to create record'),
      );

      // Act & Assert
      await expect(
        service.createEventRecord(event, did, handle, tenantId),
      ).rejects.toThrow();
    });

    it('should use correct ATProto schema for geo locations ($type, latitude/longitude as strings, name)', async () => {
      // Arrange
      const event = {
        name: 'Test Event with Location',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.InPerson,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
        location: 'Test Venue, 123 Main St',
        lat: 40.7128,
        lon: -74.006,
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      await service.createEventRecord(event, did, handle, tenantId);

      // Assert - verify the location uses correct ATProto schema
      expect(
        mockAgentImplementation.com.atproto.repo.putRecord,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          record: expect.objectContaining({
            locations: expect.arrayContaining([
              expect.objectContaining({
                $type: 'community.lexicon.location.geo',
                latitude: '40.7128',
                longitude: '-74.006',
                name: 'Test Venue, 123 Main St',
              }),
            ]),
          }),
        }),
      );

      // Verify incorrect fields are NOT used
      const putRecordCall =
        mockAgentImplementation.com.atproto.repo.putRecord.mock.calls[0][0];
      const geoLocation = putRecordCall.record.locations.find(
        (loc: Record<string, unknown>) =>
          loc.$type === 'community.lexicon.location.geo',
      );
      expect(geoLocation).not.toHaveProperty('type');
      expect(geoLocation).not.toHaveProperty('lat');
      expect(geoLocation).not.toHaveProperty('lon');
      expect(geoLocation).not.toHaveProperty('description');
    });

    it('should use correct ATProto schema for URI locations ($type)', async () => {
      // Arrange
      const event = {
        name: 'Test Online Event',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.Online,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
        locationOnline: 'https://zoom.us/j/123456789',
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      await service.createEventRecord(event, did, handle, tenantId);

      // Assert - verify the URI location uses correct ATProto schema
      expect(
        mockAgentImplementation.com.atproto.repo.putRecord,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          record: expect.objectContaining({
            locations: expect.arrayContaining([
              expect.objectContaining({
                $type: 'community.lexicon.calendar.event#uri',
                uri: 'https://zoom.us/j/123456789',
                name: 'Online Meeting Link',
              }),
            ]),
          }),
        }),
      );

      // Verify incorrect field is NOT used
      const putRecordCall =
        mockAgentImplementation.com.atproto.repo.putRecord.mock.calls[0][0];
      const uriLocation = putRecordCall.record.locations.find(
        (loc: Record<string, unknown>) =>
          loc.$type === 'community.lexicon.calendar.event#uri',
      );
      expect(uriLocation).not.toHaveProperty('type');
    });

    it('should include both geo and URI locations for hybrid events with correct schema', async () => {
      // Arrange
      const event = {
        name: 'Test Hybrid Event',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.Hybrid,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
        location: 'Conference Center',
        lat: 51.5074,
        lon: -0.1278,
        locationOnline: 'https://meet.google.com/abc-defg-hij',
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      await service.createEventRecord(event, did, handle, tenantId);

      // Assert - verify both locations use correct ATProto schema
      const putRecordCall =
        mockAgentImplementation.com.atproto.repo.putRecord.mock.calls[0][0];
      const locations = putRecordCall.record.locations;

      expect(locations).toHaveLength(2);

      // Check geo location
      const geoLocation = locations.find(
        (loc: Record<string, unknown>) =>
          loc.$type === 'community.lexicon.location.geo',
      );
      expect(geoLocation).toEqual({
        $type: 'community.lexicon.location.geo',
        latitude: '51.5074',
        longitude: '-0.1278',
        name: 'Conference Center',
      });

      // Check URI location
      const uriLocation = locations.find(
        (loc: Record<string, unknown>) =>
          loc.$type === 'community.lexicon.calendar.event#uri',
      );
      expect(uriLocation).toEqual({
        $type: 'community.lexicon.calendar.event#uri',
        uri: 'https://meet.google.com/abc-defg-hij',
        name: 'Online Meeting Link',
      });
    });

    it('should serialize Date objects to ISO strings for startsAt, endsAt, and createdAt', async () => {
      // Arrange - use Date objects (as would come from materializeOccurrence)
      const startDate = new Date('2023-12-01T12:00:00.000Z');
      const endDate = new Date('2023-12-01T14:00:00.000Z');
      const createdAt = new Date('2023-11-01T00:00:00.000Z');

      const event = {
        name: 'Test Event with Date Objects',
        description: 'Test Description',
        startDate,
        endDate,
        type: EventType.InPerson,
        status: EventStatus.Published,
        createdAt,
        slug: 'test-event-dates',
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      await service.createEventRecord(event, did, handle, tenantId);

      // Assert - verify dates are ISO strings, not Date objects
      const putRecordCall =
        mockAgentImplementation.com.atproto.repo.putRecord.mock.calls[0][0];
      const record = putRecordCall.record;

      // Dates should be ISO strings, not Date objects
      expect(typeof record.startsAt).toBe('string');
      expect(typeof record.endsAt).toBe('string');
      expect(typeof record.createdAt).toBe('string');

      // Verify the actual ISO string values
      expect(record.startsAt).toBe('2023-12-01T12:00:00.000Z');
      expect(record.endsAt).toBe('2023-12-01T14:00:00.000Z');
      expect(record.createdAt).toBe('2023-11-01T00:00:00.000Z');
    });

    it('should handle dates that are already ISO strings', async () => {
      // Arrange - use string dates (as might come from some code paths)
      const event = {
        name: 'Test Event with String Dates',
        description: 'Test Description',
        startDate: '2023-12-01T12:00:00.000Z',
        endDate: '2023-12-01T14:00:00.000Z',
        type: EventType.InPerson,
        status: EventStatus.Published,
        createdAt: '2023-11-01T00:00:00.000Z',
        slug: 'test-event-string-dates',
      } as unknown as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Mock getRecord to throw a 404 error to indicate rkey is available
      mockAgentImplementation.com.atproto.repo.getRecord.mockRejectedValueOnce({
        status: 404,
      });

      // Act
      await service.createEventRecord(event, did, handle, tenantId);

      // Assert - verify dates remain as strings
      const putRecordCall =
        mockAgentImplementation.com.atproto.repo.putRecord.mock.calls[0][0];
      const record = putRecordCall.record;

      expect(typeof record.startsAt).toBe('string');
      expect(typeof record.endsAt).toBe('string');
      expect(typeof record.createdAt).toBe('string');

      expect(record.startsAt).toBe('2023-12-01T12:00:00.000Z');
      expect(record.endsAt).toBe('2023-12-01T14:00:00.000Z');
      expect(record.createdAt).toBe('2023-11-01T00:00:00.000Z');
    });

    it('should generate TID-based rkey for new events (not slug-based)', async () => {
      // Arrange - event with a long slug that would cause issues with old approach
      const event = {
        name: 'Test Event with Very Long Name',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.InPerson,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
        slug: 'this-is-a-very-long-slug-that-would-exceed-fifty-characters-limit',
        // No sourceData.rkey - this is a new event
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Act
      const result = await service.createEventRecord(
        event,
        did,
        handle,
        tenantId,
      );

      // Assert - rkey should be a TID (approximately 13 chars, base32-sortable format)
      expect(result.rkey).toBeDefined();
      // TID format: 13 characters, base32-sortable (lowercase letters and digits 2-7)
      expect(result.rkey).toMatch(/^[a-z2-7]{13}$/);
      // Should NOT be the slug
      expect(result.rkey).not.toBe(event.slug);
      // Should NOT contain the slug
      expect(result.rkey).not.toContain('this-is-a-very-long');
    });

    it('should preserve existing rkey when updating events', async () => {
      // Arrange - event with existing rkey in sourceData
      const existingRkey = 'existing-rkey-123';
      const event = {
        name: 'Test Event Update',
        description: 'Test Description',
        startDate: new Date('2023-12-01T12:00:00Z'),
        endDate: new Date('2023-12-01T14:00:00Z'),
        type: EventType.InPerson,
        status: EventStatus.Published,
        createdAt: new Date('2023-11-01T00:00:00Z'),
        slug: 'test-event-update',
        sourceData: {
          rkey: existingRkey,
        },
      } as EventEntity;

      const did = 'test-did';
      const handle = 'test.handle';
      const tenantId = 'test-tenant';

      // Act
      const result = await service.createEventRecord(
        event,
        did,
        handle,
        tenantId,
      );

      // Assert - should use the existing rkey, not generate a new one
      expect(result.rkey).toBe(existingRkey);
    });
  });
});
