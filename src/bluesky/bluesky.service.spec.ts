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
  });
});
