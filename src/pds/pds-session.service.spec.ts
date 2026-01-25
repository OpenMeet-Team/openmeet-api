import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { ContextIdFactory } from '@nestjs/core';
import { PdsSessionService } from './pds-session.service';
import { PdsCredentialService } from './pds-credential.service';
import { PdsAccountService } from './pds-account.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { BlueskyService } from '../bluesky/bluesky.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { Agent } from '@atproto/api';

// Mock the @atproto/api Agent and CredentialSession
const mockResumeSession = jest.fn().mockResolvedValue(undefined);
jest.mock('@atproto/api', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    did: 'did:plc:test123',
  })),
  CredentialSession: jest.fn().mockImplementation(() => ({
    resumeSession: mockResumeSession,
  })),
}));

describe('PdsSessionService', () => {
  let service: PdsSessionService;
  let module: TestingModule;
  let mockUserAtprotoIdentityService: {
    findByUserUlid: jest.Mock;
    findByDid: jest.Mock;
  };
  let mockPdsCredentialService: {
    decrypt: jest.Mock;
  };
  let mockPdsAccountService: {
    createSession: jest.Mock;
  };
  let mockBlueskyService: {
    resumeSession: jest.Mock;
  };
  let mockElastiCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  const tenantId = 'test-tenant';
  const userUlid = '01HV1234567890ABCDEF';
  const testDid = 'did:plc:test123';
  const testHandle = 'alice.dev.opnmt.me';
  const testPdsUrl = 'https://pds-dev.openmeet.net';
  const encryptedCredentials =
    '{"v":1,"iv":"abc","ciphertext":"xyz","authTag":"tag"}';
  const decryptedPassword = 'secret-password';

  const mockRequest = { tenantId };

  const createMockIdentity = (
    overrides: Partial<UserAtprotoIdentityEntity> = {},
  ): UserAtprotoIdentityEntity =>
    ({
      id: 1,
      userUlid,
      did: testDid,
      handle: testHandle,
      pdsUrl: testPdsUrl,
      pdsCredentials: encryptedCredentials,
      isCustodial: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as UserAtprotoIdentityEntity;

  beforeEach(async () => {
    // Reset the CredentialSession resumeSession mock
    mockResumeSession.mockClear();

    // Create fresh mocks for each test
    mockUserAtprotoIdentityService = {
      findByUserUlid: jest.fn(),
      findByDid: jest.fn(),
    };

    mockPdsCredentialService = {
      decrypt: jest.fn(),
    };

    mockPdsAccountService = {
      createSession: jest.fn(),
    };

    mockBlueskyService = {
      resumeSession: jest.fn(),
    };

    mockElastiCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        PdsSessionService,
        {
          provide: UserAtprotoIdentityService,
          useValue: mockUserAtprotoIdentityService,
        },
        {
          provide: PdsCredentialService,
          useValue: mockPdsCredentialService,
        },
        {
          provide: PdsAccountService,
          useValue: mockPdsAccountService,
        },
        {
          provide: BlueskyService,
          useValue: mockBlueskyService,
        },
        {
          provide: ElastiCacheService,
          useValue: mockElastiCacheService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    // Use resolve() for request-scoped providers
    const contextId = ContextIdFactory.create();
    module.registerRequestByContextId(mockRequest, contextId);

    service = await module.resolve<PdsSessionService>(
      PdsSessionService,
      contextId,
    );
  });

  describe('getSessionForUser()', () => {
    describe('when no identity found', () => {
      it('should return null when user has no AT Protocol identity', async () => {
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(
          mockUserAtprotoIdentityService.findByUserUlid,
        ).toHaveBeenCalledWith(tenantId, userUlid);
      });
    });

    describe('when identity is orphan (custodial but no credentials)', () => {
      it('should return null for orphan accounts', async () => {
        const orphanIdentity = createMockIdentity({
          isCustodial: true,
          pdsCredentials: null,
        });
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          orphanIdentity,
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
      });
    });

    describe('when identity is OAuth (non-custodial)', () => {
      it('should delegate to BlueskyService.resumeSession', async () => {
        const oauthIdentity = createMockIdentity({
          isCustodial: false,
          pdsCredentials: null,
        });
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          oauthIdentity,
        );

        const mockAgent = { did: testDid } as unknown as Agent;
        mockBlueskyService.resumeSession.mockResolvedValue(mockAgent);

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(result!.agent).toBe(mockAgent);
        expect(result!.did).toBe(testDid);
        expect(result!.isCustodial).toBe(false);
        expect(result!.source).toBe('oauth');
        expect(mockBlueskyService.resumeSession).toHaveBeenCalledWith(
          tenantId,
          testDid,
        );
      });

      it('should return null when OAuth session restoration fails', async () => {
        const oauthIdentity = createMockIdentity({
          isCustodial: false,
          pdsCredentials: null,
        });
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          oauthIdentity,
        );

        mockBlueskyService.resumeSession.mockRejectedValue(
          new Error('Session expired'),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
      });
    });

    describe('when identity is custodial with credentials', () => {
      it('should return cached session when available', async () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );

        const cachedSession = {
          accessJwt: 'cached-access-jwt',
          refreshJwt: 'cached-refresh-jwt',
          did: testDid,
          handle: testHandle,
        };
        mockElastiCacheService.get.mockResolvedValue(cachedSession);

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(result!.did).toBe(testDid);
        expect(result!.isCustodial).toBe(true);
        expect(result!.source).toBe('cache');
        expect(mockElastiCacheService.get).toHaveBeenCalledWith(
          `pds:session:${tenantId}:${testDid}`,
        );
        // Should not call createSession when cache hit
        expect(mockPdsAccountService.createSession).not.toHaveBeenCalled();
      });

      it('should call CredentialSession.resumeSession with active: true', async () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );

        const cachedSession = {
          accessJwt: 'cached-access-jwt',
          refreshJwt: 'cached-refresh-jwt',
          did: testDid,
          handle: testHandle,
        };
        mockElastiCacheService.get.mockResolvedValue(cachedSession);

        await service.getSessionForUser(tenantId, userUlid);

        // Verify CredentialSession.resumeSession was called with active: true
        expect(mockResumeSession).toHaveBeenCalledWith({
          did: testDid,
          handle: testHandle,
          accessJwt: 'cached-access-jwt',
          refreshJwt: 'cached-refresh-jwt',
          active: true,
        });
      });

      it('should create fresh session and cache when no cache hit', async () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );

        // No cache hit
        mockElastiCacheService.get.mockResolvedValue(null);

        // Decrypt credentials
        mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);

        // Create session succeeds
        const sessionResponse = {
          did: testDid,
          handle: testHandle,
          accessJwt: 'fresh-access-jwt',
          refreshJwt: 'fresh-refresh-jwt',
        };
        mockPdsAccountService.createSession.mockResolvedValue(sessionResponse);

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(result!.did).toBe(testDid);
        expect(result!.isCustodial).toBe(true);
        expect(result!.source).toBe('fresh');

        // Verify credential decryption
        expect(mockPdsCredentialService.decrypt).toHaveBeenCalledWith(
          encryptedCredentials,
        );

        // Verify session creation
        expect(mockPdsAccountService.createSession).toHaveBeenCalledWith(
          testDid,
          decryptedPassword,
        );

        // Verify caching with 15-minute TTL
        expect(mockElastiCacheService.set).toHaveBeenCalledWith(
          `pds:session:${tenantId}:${testDid}`,
          sessionResponse,
          900,
        );
      });

      it('should return null when credential decryption fails', async () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );
        mockElastiCacheService.get.mockResolvedValue(null);

        mockPdsCredentialService.decrypt.mockImplementation(() => {
          throw new Error('Decryption failed');
        });

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
      });

      it('should return null when PDS session creation fails', async () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );
        mockElastiCacheService.get.mockResolvedValue(null);
        mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);

        mockPdsAccountService.createSession.mockRejectedValue(
          new Error('Invalid credentials'),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
      });
    });
  });

  describe('getSessionForDid()', () => {
    it('should look up identity by DID and return session', async () => {
      const custodialIdentity = createMockIdentity();
      mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
        custodialIdentity,
      );
      mockElastiCacheService.get.mockResolvedValue(null);
      mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);

      const sessionResponse = {
        did: testDid,
        handle: testHandle,
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      };
      mockPdsAccountService.createSession.mockResolvedValue(sessionResponse);

      const result = await service.getSessionForDid(tenantId, testDid);

      expect(result).not.toBeNull();
      expect(result!.did).toBe(testDid);
      expect(mockUserAtprotoIdentityService.findByDid).toHaveBeenCalledWith(
        tenantId,
        testDid,
      );
    });

    it('should return null when DID not found', async () => {
      mockUserAtprotoIdentityService.findByDid.mockResolvedValue(null);

      const result = await service.getSessionForDid(tenantId, testDid);

      expect(result).toBeNull();
    });
  });

  describe('invalidateSession()', () => {
    it('should delete the cached session', async () => {
      await service.invalidateSession(tenantId, testDid);

      expect(mockElastiCacheService.del).toHaveBeenCalledWith(
        `pds:session:${tenantId}:${testDid}`,
      );
    });
  });
});
