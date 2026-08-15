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
import { PdsApiError, SessionUnavailableError } from './pds.errors';

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
    update: jest.Mock;
    transitionTakeOwnershipStatus: jest.Mock;
  };
  let mockPdsCredentialService: {
    decrypt: jest.Mock;
  };
  let mockPdsAccountService: {
    createSession: jest.Mock;
    deleteSession: jest.Mock;
  };
  let mockBlueskyService: {
    resumeSession: jest.Mock;
    revokeOAuthSession: jest.Mock;
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
      takeOwnershipStatus: null,
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
      update: jest.fn(),
      transitionTakeOwnershipStatus: jest.fn().mockResolvedValue(true),
    };

    mockPdsCredentialService = {
      decrypt: jest.fn(),
    };

    mockPdsAccountService = {
      createSession: jest.fn(),
      deleteSession: jest.fn(),
    };

    mockBlueskyService = {
      resumeSession: jest.fn(),
      revokeOAuthSession: jest.fn(),
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
      it('should throw SessionUnavailableError with needsOAuthLink=true for orphan accounts', async () => {
        const orphanIdentity = createMockIdentity({
          isCustodial: false, // Non-custodial (took ownership)
          pdsCredentials: null, // But no credentials
        });
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          orphanIdentity,
        );

        // OAuth restoration will also fail (no session in Redis)
        mockBlueskyService.resumeSession.mockRejectedValue(
          new Error('No OAuth session found'),
        );

        await expect(
          service.getSessionForUser(tenantId, userUlid),
        ).rejects.toThrow(SessionUnavailableError);

        try {
          await service.getSessionForUser(tenantId, userUlid);
        } catch (error) {
          expect(error).toBeInstanceOf(SessionUnavailableError);
          expect((error as SessionUnavailableError).needsOAuthLink).toBe(true);
          expect((error as SessionUnavailableError).message).toContain('link');
        }
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

      it('should throw SessionUnavailableError with needsOAuthLink=true when OAuth session restoration fails', async () => {
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

        await expect(
          service.getSessionForUser(tenantId, userUlid),
        ).rejects.toThrow(SessionUnavailableError);

        try {
          await service.getSessionForUser(tenantId, userUlid);
        } catch (error) {
          expect(error).toBeInstanceOf(SessionUnavailableError);
          expect((error as SessionUnavailableError).needsOAuthLink).toBe(true);
          expect((error as SessionUnavailableError).message).toContain('link');
        }
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
        // A plain error is not a definitive PDS rejection - no repair
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });
    });

    describe('orphaned take-ownership repair', () => {
      const arrangeCustodialSessionAttempt = () => {
        const custodialIdentity = createMockIdentity();
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );
        mockElastiCacheService.get.mockResolvedValue(null);
        mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);
        return custodialIdentity;
      };

      it('should finish take-ownership on 401 when a reset was confirmed but custody never flipped', async () => {
        const custodialIdentity = arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ takeOwnershipStatus: 'confirmed' }),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError(
            'Invalid identifier or password',
            401,
            'AuthenticationRequired',
          ),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        // Session still fails this cycle...
        expect(result).toBeNull();
        // ...but the recorded handoff is completed
        expect(mockUserAtprotoIdentityService.update).toHaveBeenCalledWith(
          tenantId,
          custodialIdentity.id,
          {
            pdsCredentials: null,
            isCustodial: false,
            takeOwnershipStatus: null,
          },
        );
        // ...and the cached session is invalidated
        expect(mockElastiCacheService.del).toHaveBeenCalled();
      });

      it("should not auto-repair on 401 when the marker is only 'ambiguous'", async () => {
        // Ambiguity includes "the reset request never reached the PDS", so
        // this 401 could still be systemic (wrong PDS URL, incomplete
        // restore). Destroying credentials needs the certainty of
        // 'confirmed'; ambiguous cases are surfaced for reconciliation
        arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ takeOwnershipStatus: 'ambiguous' }),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Invalid identifier or password', 401),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it('should not end custody on 401 without a recorded marker', async () => {
        // The PDS returns the same 401 for unknown accounts (anti-
        // enumeration), so a systemic failure like a wrong PDS URL or an
        // incomplete PDS restore must never convert custodial identities
        arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ takeOwnershipStatus: null }),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Invalid identifier or password', 401),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it("should not end custody on 401 when the marker is only 'pending'", async () => {
        // 'pending' records intent before the PDS submission — a crash in
        // that window leaves it behind without any reset having happened,
        // so it must never satisfy the repair on its own
        arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ takeOwnershipStatus: 'pending' }),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Invalid identifier or password', 401),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it('should not end custody on a non-401 PDS error', async () => {
        arrangeCustodialSessionAttempt();
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Bad gateway', 502),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it('should not end custody on a PDS error with no status (network failure)', async () => {
        arrangeCustodialSessionAttempt();
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('socket hang up'),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it('should skip repair when the identity is already non-custodial at lookup', async () => {
        arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ isCustodial: false, pdsCredentials: null }),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Invalid identifier or password', 401),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
        expect(mockUserAtprotoIdentityService.update).not.toHaveBeenCalled();
      });

      it('should still return null when the repair itself fails', async () => {
        arrangeCustodialSessionAttempt();
        mockUserAtprotoIdentityService.findByDid.mockResolvedValue(
          createMockIdentity({ takeOwnershipStatus: 'confirmed' }),
        );
        mockUserAtprotoIdentityService.update.mockRejectedValue(
          new Error('DB write failed'),
        );
        mockPdsAccountService.createSession.mockRejectedValue(
          new PdsApiError('Invalid identifier or password', 401),
        );

        // Must not throw: repair failure cannot mask the session failure
        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).toBeNull();
      });
    });

    describe('stale marker sweep on successful login', () => {
      const sessionResponse = {
        did: testDid,
        handle: testHandle,
        accessJwt: 'fresh-access-jwt',
        refreshJwt: 'fresh-refresh-jwt',
      };

      const arrangeSuccessfulFreshSession = (
        takeOwnershipStatus: 'pending' | 'ambiguous' | 'confirmed' | null,
      ) => {
        const custodialIdentity = createMockIdentity({ takeOwnershipStatus });
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
          custodialIdentity,
        );
        mockElastiCacheService.get.mockResolvedValue(null);
        mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);
        mockPdsAccountService.createSession.mockResolvedValue(sessionResponse);
        return custodialIdentity;
      };

      it("should clear a 'pending' marker when the stored credentials still authenticate", async () => {
        // A successful login proves no reset committed, so a marker stranded
        // by a crash before the PDS submission is swept instead of lingering
        const custodialIdentity = arrangeSuccessfulFreshSession('pending');

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        // Compare-and-set against exactly the state that was read, so the
        // sweep loses if the marker advanced while the login was in flight
        expect(
          mockUserAtprotoIdentityService.transitionTakeOwnershipStatus,
        ).toHaveBeenCalledWith(
          tenantId,
          custodialIdentity.id,
          ['pending'],
          null,
        );
      });

      it("should clear an 'ambiguous' marker when the stored credentials still authenticate", async () => {
        const custodialIdentity = arrangeSuccessfulFreshSession('ambiguous');

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(
          mockUserAtprotoIdentityService.transitionTakeOwnershipStatus,
        ).toHaveBeenCalledWith(
          tenantId,
          custodialIdentity.id,
          ['ambiguous'],
          null,
        );
      });

      it("should NOT clear a 'confirmed' marker even when the stored credentials authenticate", async () => {
        // 'confirmed' means the PDS acknowledged a reset; old credentials
        // still working is an anomaly (e.g. PDS restore), not refutation
        arrangeSuccessfulFreshSession('confirmed');

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(
          mockUserAtprotoIdentityService.transitionTakeOwnershipStatus,
        ).not.toHaveBeenCalled();
      });

      it('should not touch identities without a marker', async () => {
        arrangeSuccessfulFreshSession(null);

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(
          mockUserAtprotoIdentityService.transitionTakeOwnershipStatus,
        ).not.toHaveBeenCalled();
      });

      it('should still return the session when the sweep loses the compare-and-set race', async () => {
        arrangeSuccessfulFreshSession('pending');
        mockUserAtprotoIdentityService.transitionTakeOwnershipStatus.mockResolvedValue(
          false,
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('fresh');
      });

      it('should still return the session when the sweep write fails', async () => {
        arrangeSuccessfulFreshSession('pending');
        mockUserAtprotoIdentityService.transitionTakeOwnershipStatus.mockRejectedValue(
          new Error('DB write failed'),
        );

        const result = await service.getSessionForUser(tenantId, userUlid);

        expect(result).not.toBeNull();
        expect(result!.source).toBe('fresh');
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

  describe('disconnectSession()', () => {
    it('should throw NotFoundException when no identity found', async () => {
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      await expect(
        service.disconnectSession(tenantId, userUlid),
      ).rejects.toThrow('No AT Protocol identity found');
    });

    it('should revoke OAuth session for non-custodial identity and invalidate cache', async () => {
      const oauthIdentity = createMockIdentity({
        isCustodial: false,
        pdsCredentials: null,
      });
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        oauthIdentity,
      );
      mockBlueskyService.revokeOAuthSession.mockResolvedValue(undefined);

      const result = await service.disconnectSession(tenantId, userUlid);

      expect(mockBlueskyService.revokeOAuthSession).toHaveBeenCalledWith(
        tenantId,
        testDid,
      );
      expect(mockElastiCacheService.del).toHaveBeenCalledWith(
        `pds:session:${tenantId}:${testDid}`,
      );
      expect(result).toEqual({
        success: true,
        message:
          'AT Protocol session disconnected. You can reconnect from Settings.',
      });
    });

    it('should still succeed when OAuth revocation fails', async () => {
      const oauthIdentity = createMockIdentity({
        isCustodial: false,
        pdsCredentials: null,
      });
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        oauthIdentity,
      );
      mockBlueskyService.revokeOAuthSession.mockRejectedValue(
        new Error('OAuth revoke failed'),
      );

      const result = await service.disconnectSession(tenantId, userUlid);

      expect(result.success).toBe(true);
      expect(mockElastiCacheService.del).toHaveBeenCalled();
    });

    it('should create then delete session for custodial identity with credentials', async () => {
      const custodialIdentity = createMockIdentity();
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        custodialIdentity,
      );
      mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);
      mockPdsAccountService.createSession.mockResolvedValue({
        did: testDid,
        handle: testHandle,
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      mockPdsAccountService.deleteSession.mockResolvedValue(undefined);

      const result = await service.disconnectSession(tenantId, userUlid);

      expect(mockPdsCredentialService.decrypt).toHaveBeenCalledWith(
        encryptedCredentials,
      );
      expect(mockPdsAccountService.createSession).toHaveBeenCalledWith(
        testDid,
        decryptedPassword,
      );
      expect(mockPdsAccountService.deleteSession).toHaveBeenCalledWith(
        testPdsUrl,
        'refresh-jwt',
      );
      expect(mockElastiCacheService.del).toHaveBeenCalledWith(
        `pds:session:${tenantId}:${testDid}`,
      );
      expect(result.success).toBe(true);
    });

    it('should still succeed when custodial session deletion fails', async () => {
      const custodialIdentity = createMockIdentity();
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        custodialIdentity,
      );
      mockPdsCredentialService.decrypt.mockReturnValue(decryptedPassword);
      mockPdsAccountService.createSession.mockRejectedValue(
        new Error('PDS login failed'),
      );

      const result = await service.disconnectSession(tenantId, userUlid);

      expect(result.success).toBe(true);
      expect(mockElastiCacheService.del).toHaveBeenCalled();
    });
  });
});
