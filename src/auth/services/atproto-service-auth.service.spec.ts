import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AtprotoServiceAuthService } from './atproto-service-auth.service';
import { UserAtprotoIdentityService } from '../../user-atproto-identity/user-atproto-identity.service';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import { IdResolver } from '@atproto/identity';
import { verifySignature } from '@atproto/crypto';

// Mock @atproto/identity
jest.mock('@atproto/identity', () => ({
  IdResolver: jest.fn().mockImplementation(() => ({
    did: {
      resolveAtprotoData: jest.fn(),
    },
  })),
}));

// Mock @atproto/crypto
jest.mock('@atproto/crypto', () => ({
  verifySignature: jest.fn(),
}));

const MockedIdResolver = IdResolver as jest.MockedClass<typeof IdResolver>;
const mockedVerifySignature = verifySignature as jest.MockedFunction<
  typeof verifySignature
>;

describe('AtprotoServiceAuthService', () => {
  let service: AtprotoServiceAuthService;
  let mockConfigService: { get: jest.Mock };
  let mockIdentityService: { findByDid: jest.Mock; create: jest.Mock };
  let mockAuthService: {
    createLoginSession: jest.Mock;
    validateSocialLogin: jest.Mock;
  };
  let mockUserService: { findByUlid: jest.Mock };
  let mockElastiCacheService: { get: jest.Mock; set: jest.Mock };

  // Helper: create a JWT with given claims
  function makeJwt(
    header: object,
    payload: object,
    signature = 'fakesig',
  ): string {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = Buffer.from(signature).toString('base64url');
    return `${h}.${p}.${s}`;
  }

  const validHeader = { alg: 'ES256K', typ: 'JWT' };
  const validPayload = {
    iss: 'did:plc:testuser123',
    aud: 'did:web:api.openmeet.net',
    lxm: 'net.openmeet.auth',
    exp: Math.floor(Date.now() / 1000) + 300, // 5 min in future
    jti: 'unique-token-id-123',
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
        if (key === 'DID_PLC_URL') return undefined;
        return undefined;
      }),
    };

    mockIdentityService = {
      findByDid: jest.fn(),
      create: jest.fn(),
    };

    mockAuthService = {
      createLoginSession: jest.fn(),
      validateSocialLogin: jest.fn(),
    };

    mockUserService = {
      findByUlid: jest.fn(),
    };

    mockElastiCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoServiceAuthService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockIdentityService,
        },
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
        { provide: ElastiCacheService, useValue: mockElastiCacheService },
      ],
    }).compile();

    service = module.get<AtprotoServiceAuthService>(AtprotoServiceAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyAndExchange', () => {
    it('should reject a malformed JWT (not 3 parts)', async () => {
      await expect(
        service.verifyAndExchange('not-a-jwt', 'tenant1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a JWT with invalid base64 payload', async () => {
      await expect(
        service.verifyAndExchange('a.!!!.c', 'tenant1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a JWT with wrong audience', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        aud: 'did:web:wrong-service.com',
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a JWT with wrong lxm', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        lxm: 'com.atproto.wrong.method',
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an expired JWT', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        exp: Math.floor(Date.now() / 1000) - 60, // 1 min in past
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a JWT missing iss claim', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { iss: _iss, ...noIss } = validPayload;
      const token = makeJwt(validHeader, noIss);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a JWT missing jti claim', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { jti: _jti, ...noJti } = validPayload;
      const token = makeJwt(validHeader, noJti);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a JWT with empty string jti claim', async () => {
      const token = makeJwt(validHeader, { ...validPayload, jti: '' });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when DID resolution fails', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest
            .fn()
            .mockRejectedValue(new Error('DID not found')),
        },
      }));

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject when signature verification fails', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(false);

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should auto-create user when no identity exists for DID', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue(null);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { ulid: 'new-user-ulid' },
      };
      mockAuthService.validateSocialLogin.mockResolvedValue(
        expectedLoginResponse,
      );
      mockIdentityService.create.mockResolvedValue({});

      const token = makeJwt(validHeader, validPayload);
      const result = await service.verifyAndExchange(token, 'tenant1');

      expect(result).toEqual(expectedLoginResponse);
      expect(mockAuthService.validateSocialLogin).toHaveBeenCalledWith(
        'atproto-service',
        {
          id: 'did:plc:testuser123',
          email: '',
          firstName: 'test.bsky.social',
          lastName: '',
        },
        'tenant1',
      );
      expect(mockIdentityService.create).toHaveBeenCalledWith('tenant1', {
        userUlid: 'new-user-ulid',
        did: 'did:plc:testuser123',
        handle: 'test.bsky.social',
        pdsUrl: 'https://pds.example.com',
        isCustodial: false,
        pdsCredentials: null,
      });
    });

    it('should use DID as firstName when handle is not available', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue(null);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { ulid: 'new-user-ulid' },
      };
      mockAuthService.validateSocialLogin.mockResolvedValue(
        expectedLoginResponse,
      );
      mockIdentityService.create.mockResolvedValue({});

      const token = makeJwt(validHeader, validPayload);
      const result = await service.verifyAndExchange(token, 'tenant1');

      expect(result).toEqual(expectedLoginResponse);
      expect(mockAuthService.validateSocialLogin).toHaveBeenCalledWith(
        'atproto-service',
        {
          id: 'did:plc:testuser123',
          email: '',
          firstName: 'did:plc:testuser123',
          lastName: '',
        },
        'tenant1',
      );
      expect(mockIdentityService.create).toHaveBeenCalledWith('tenant1', {
        userUlid: 'new-user-ulid',
        did: 'did:plc:testuser123',
        handle: null,
        pdsUrl: 'https://pds.example.com',
        isCustodial: false,
        pdsCredentials: null,
      });
    });

    it('should handle race condition when two concurrent requests create identity for same DID', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { ulid: 'new-user-ulid' },
      };

      // First findByDid returns null (no identity yet)
      mockIdentityService.findByDid.mockResolvedValueOnce(null);
      mockAuthService.validateSocialLogin.mockResolvedValue(
        expectedLoginResponse,
      );
      // create throws unique constraint violation (another request won the race)
      mockIdentityService.create.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );
      // Second findByDid finds the record the other request created
      mockIdentityService.findByDid.mockResolvedValueOnce({
        did: 'did:plc:testuser123',
        userUlid: 'new-user-ulid',
      });

      const token = makeJwt(validHeader, validPayload);
      const result = await service.verifyAndExchange(token, 'tenant1');

      // Should succeed despite the race — returns the login response
      expect(result).toEqual(expectedLoginResponse);
    });

    it('should throw when identity creation fails and no existing record found', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { ulid: 'new-user-ulid' },
      };

      mockIdentityService.findByDid.mockResolvedValueOnce(null);
      mockAuthService.validateSocialLogin.mockResolvedValue(
        expectedLoginResponse,
      );
      // create fails with a genuine error
      mockIdentityService.create.mockRejectedValue(
        new Error('connection refused'),
      );
      // Re-lookup also finds nothing — this is a real failure
      mockIdentityService.findByDid.mockResolvedValueOnce(null);

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        'connection refused',
      );
    });

    it('should use DID as pdsUrl fallback when resolvedPdsUrl is undefined', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            // pds intentionally omitted
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue(null);
      mockIdentityService.create.mockResolvedValue({});

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { ulid: 'new-user-ulid' },
      };
      mockAuthService.validateSocialLogin.mockResolvedValue(
        expectedLoginResponse,
      );

      const token = makeJwt(validHeader, validPayload);
      await service.verifyAndExchange(token, 'tenant1');

      // pdsUrl should fall back to DID, not 'https://bsky.social'
      expect(mockIdentityService.create).toHaveBeenCalledWith(
        'tenant1',
        expect.objectContaining({
          pdsUrl: 'did:plc:testuser123',
        }),
      );
    });

    it('should pass DID_PLC_URL to IdResolver when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
        if (key === 'DID_PLC_URL') return 'https://plc.private.example.com';
        return undefined;
      });

      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue({
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      });

      mockUserService.findByUlid.mockResolvedValue({
        id: 1,
        ulid: 'user-ulid-123',
        slug: 'testuser',
        role: { id: 2 },
      });

      mockAuthService.createLoginSession.mockResolvedValue({
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: {},
      });

      const token = makeJwt(validHeader, validPayload);
      await service.verifyAndExchange(token, 'tenant1');

      expect(MockedIdResolver).toHaveBeenCalledWith({
        plcUrl: 'https://plc.private.example.com',
      });
    });

    describe('PLC fallback', () => {
      it('should fall back to public PLC when private PLC fails and DID_PLC_URL is configured', async () => {
        // Configure DID_PLC_URL so private PLC is used first
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
          if (key === 'DID_PLC_URL') return 'http://plc:2582';
          return undefined;
        });

        const resolvedAtprotoData = {
          did: 'did:plc:testuser123',
          signingKey: 'did:key:z1234mockkey',
          handle: 'test.bsky.social',
          pds: 'https://pds.example.com',
        };

        let callCount = 0;
        MockedIdResolver.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call: private PLC resolver - fails
            return {
              did: {
                resolveAtprotoData: jest
                  .fn()
                  .mockRejectedValue(new Error('DID not found on private PLC')),
              },
            };
          }
          // Second call: public PLC resolver - succeeds
          return {
            did: {
              resolveAtprotoData: jest
                .fn()
                .mockResolvedValue(resolvedAtprotoData),
            },
          };
        });

        mockedVerifySignature.mockResolvedValue(true);

        const mockUser = {
          id: 1,
          ulid: 'user-ulid-123',
          slug: 'testuser',
          role: { id: 2 },
        };

        mockIdentityService.findByDid.mockResolvedValue({
          userUlid: 'user-ulid-123',
          did: 'did:plc:testuser123',
        });

        mockUserService.findByUlid.mockResolvedValue(mockUser);

        const expectedLoginResponse = {
          token: 'jwt-token',
          refreshToken: 'refresh-token',
          tokenExpires: 12345,
          user: mockUser,
        };
        mockAuthService.createLoginSession.mockResolvedValue(
          expectedLoginResponse,
        );

        const token = makeJwt(validHeader, validPayload);
        const result = await service.verifyAndExchange(token, 'tenant1');

        expect(result).toEqual(expectedLoginResponse);
        // Verify IdResolver was called twice: once with private PLC, once with no args (public)
        expect(MockedIdResolver).toHaveBeenCalledTimes(2);
        expect(MockedIdResolver).toHaveBeenNthCalledWith(1, {
          plcUrl: 'http://plc:2582',
        });
        expect(MockedIdResolver).toHaveBeenNthCalledWith(2);
      });

      it('should throw when DID resolution fails on both private and public PLC', async () => {
        // Configure DID_PLC_URL so private PLC is used first
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
          if (key === 'DID_PLC_URL') return 'http://plc:2582';
          return undefined;
        });

        MockedIdResolver.mockImplementation(() => ({
          did: {
            resolveAtprotoData: jest
              .fn()
              .mockRejectedValue(new Error('DID not found')),
          },
        }));

        const token = makeJwt(validHeader, validPayload);

        await expect(
          service.verifyAndExchange(token, 'tenant1'),
        ).rejects.toThrow(UnauthorizedException);

        // Verify IdResolver was called twice (private then public)
        expect(MockedIdResolver).toHaveBeenCalledTimes(2);
      });

      it('should not fall back to public PLC when DID_PLC_URL is not configured', async () => {
        // DID_PLC_URL is undefined (default in beforeEach)
        MockedIdResolver.mockImplementation(() => ({
          did: {
            resolveAtprotoData: jest
              .fn()
              .mockRejectedValue(new Error('DID not found')),
          },
        }));

        const token = makeJwt(validHeader, validPayload);

        await expect(
          service.verifyAndExchange(token, 'tenant1'),
        ).rejects.toThrow(UnauthorizedException);

        // Verify IdResolver was called only once (no fallback without private PLC)
        expect(MockedIdResolver).toHaveBeenCalledTimes(1);
      });
    });

    describe('replay protection', () => {
      // Helper to set up mocks for a successful verification pipeline
      function setupSuccessfulVerification() {
        MockedIdResolver.mockImplementation(() => ({
          did: {
            resolveAtprotoData: jest.fn().mockResolvedValue({
              did: 'did:plc:testuser123',
              signingKey: 'did:key:z1234mockkey',
              handle: 'test.bsky.social',
              pds: 'https://pds.example.com',
            }),
          },
        }));

        mockedVerifySignature.mockResolvedValue(true);

        mockIdentityService.findByDid.mockResolvedValue({
          userUlid: 'user-ulid-123',
          did: 'did:plc:testuser123',
        });

        mockUserService.findByUlid.mockResolvedValue({
          id: 1,
          ulid: 'user-ulid-123',
          slug: 'testuser',
          role: { id: 2 },
        });

        mockAuthService.createLoginSession.mockResolvedValue({
          token: 'jwt-token',
          refreshToken: 'refresh-token',
          tokenExpires: 12345,
          user: {},
        });
      }

      it('should reject a replayed token', async () => {
        setupSuccessfulVerification();

        const token = makeJwt(validHeader, validPayload);

        // First call succeeds
        await service.verifyAndExchange(token, 'tenant1');

        // Simulate Redis returning the stored hash on second call
        mockElastiCacheService.get.mockResolvedValueOnce('1');

        // Second call with same token should be rejected
        await expect(
          service.verifyAndExchange(token, 'tenant1'),
        ).rejects.toThrow(new UnauthorizedException('Token already used'));
      });

      it('should allow different tokens for the same user', async () => {
        setupSuccessfulVerification();

        const token1 = makeJwt(validHeader, {
          ...validPayload,
          jti: 'token-1',
          exp: Math.floor(Date.now() / 1000) + 120,
        });
        const token2 = makeJwt(validHeader, {
          ...validPayload,
          jti: 'token-2',
          exp: Math.floor(Date.now() / 1000) + 180,
        });

        // Both calls should succeed (Redis returns null for both = not seen before)
        const result1 = await service.verifyAndExchange(token1, 'tenant1');
        const result2 = await service.verifyAndExchange(token2, 'tenant1');

        expect(result1).toBeDefined();
        expect(result2).toBeDefined();
        // set should have been called twice (once per token)
        expect(mockElastiCacheService.set).toHaveBeenCalledTimes(2);
      });

      it('should reject when Redis is unavailable (fail-closed)', async () => {
        setupSuccessfulVerification();

        // Simulate Redis being down
        mockElastiCacheService.isConnected.mockReturnValue(false);

        const token = makeJwt(validHeader, validPayload);

        await expect(
          service.verifyAndExchange(token, 'tenant1'),
        ).rejects.toThrow(
          new UnauthorizedException('Service temporarily unavailable'),
        );
      });

      it('should include tenantId in the replay key', async () => {
        setupSuccessfulVerification();

        const token = makeJwt(validHeader, validPayload);
        await service.verifyAndExchange(token, 'my-tenant');

        expect(mockElastiCacheService.set).toHaveBeenCalledWith(
          expect.stringContaining('service-auth:used:my-tenant:'),
          '1',
          300,
        );
      });
    });

    it('should return login tokens when JWT is valid and user exists', async () => {
      MockedIdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      mockedVerifySignature.mockResolvedValue(true);

      const mockUser = {
        id: 1,
        ulid: 'user-ulid-123',
        slug: 'testuser',
        role: { id: 2 },
      };

      mockIdentityService.findByDid.mockResolvedValue({
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      });

      mockUserService.findByUlid.mockResolvedValue(mockUser);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: mockUser,
      };
      mockAuthService.createLoginSession.mockResolvedValue(
        expectedLoginResponse,
      );

      const token = makeJwt(validHeader, validPayload);
      const result = await service.verifyAndExchange(token, 'tenant1');

      expect(result).toEqual(expectedLoginResponse);
      expect(mockIdentityService.findByDid).toHaveBeenCalledWith(
        'tenant1',
        'did:plc:testuser123',
      );
      expect(mockUserService.findByUlid).toHaveBeenCalledWith(
        'user-ulid-123',
        'tenant1',
      );
      expect(mockAuthService.createLoginSession).toHaveBeenCalledWith(
        mockUser,
        'atproto-service',
        null,
        'tenant1',
      );
    });
  });
});
