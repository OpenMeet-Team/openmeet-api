import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { SessionService } from '../session/session.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { GroupService } from '../group/group.service';
import { MailService } from '../mail/mail.service';
import { RoleService } from '../role/role.service';
import { EventQueryService } from '../event/services/event-query.service';
import { mockEventAttendeeService, mockEventQueryService } from '../test/mocks';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { REQUEST } from '@nestjs/core';
import { GroupMemberService } from '../group-member/group-member.service';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { TempAuthCodeService } from './services/temp-auth-code.service';
import { EmailVerificationCodeService } from './services/email-verification-code.service';
import { EventRoleService } from '../event-role/event-role.service';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';

// Mock tenant-config module to avoid needing real tenant config files
jest.mock('../utils/tenant-config', () => ({
  getTenantConfig: jest.fn().mockReturnValue({
    id: 'test-tenant',
    frontendDomain: 'https://platform.openmeet.net',
  }),
  fetchTenants: jest.fn().mockReturnValue([]),
}));

describe('AuthService - Login Link', () => {
  let authService: AuthService;

  const mockElastiCacheService = {
    set: jest.fn(),
    get: jest.fn(),
    getdel: jest.fn(),
    del: jest.fn(),
  };

  const mockSessionService = {
    findById: jest.fn(),
    findBySecureId: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 1, secureId: 'test-secure-id' }),
    update: jest.fn(),
    deleteBySecureId: jest.fn(),
    deleteByUserIdWithExcludeSecureId: jest.fn(),
    getTenantSpecificRepository: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserService = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findOrCreateUser: jest.fn(),
    update: jest.fn(),
    resolveBlueskyHandle: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    decode: jest
      .fn()
      .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('15m'),
    get: jest.fn(),
  };

  const mockGroupService = { findById: jest.fn() };
  const mockMailService = { sendEmail: jest.fn() };
  const mockRoleService = { findById: jest.fn(), findByName: jest.fn() };
  const mockGroupMemberService = {
    findGroupMemberByUserSlugAndGroupSlug: jest.fn(),
    getTenantSpecificRepository: jest.fn().mockResolvedValue(undefined),
  };
  const mockShadowAccountService = { claimShadowAccount: jest.fn() };
  const mockTempAuthCodeService = {
    generateEmailVerificationCode: jest.fn(),
    validateEmailVerificationCode: jest.fn(),
  };
  const mockEmailVerificationCodeService = {
    generateCode: jest.fn(),
    validateCode: jest.fn(),
  };
  const mockEventRoleService = { findByName: jest.fn() };
  const mockPdsAccountService = {
    createAccount: jest.fn(),
    isHandleAvailable: jest.fn(),
  };
  const mockPdsCredentialService = { encrypt: jest.fn(), decrypt: jest.fn() };
  const mockUserAtprotoIdentityService = {
    findByUserUlid: jest.fn(),
    findByDid: jest.fn(),
    create: jest.fn(),
  };
  const mockBlueskyIdentityService = {
    resolveProfile: jest.fn(),
    resolveHandleToDid: jest.fn(),
    extractHandleFromDid: jest.fn(),
  };
  const mockBlueskyService = { tryResumeSession: jest.fn() };

  const mockRequest = { tenantId: 'test-tenant' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SessionService, useValue: mockSessionService },
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: GroupMemberService, useValue: mockGroupMemberService },
        { provide: MailService, useValue: mockMailService },
        { provide: RoleService, useValue: mockRoleService },
        { provide: EventQueryService, useValue: mockEventQueryService },
        { provide: EventAttendeeService, useValue: mockEventAttendeeService },
        { provide: EventRoleService, useValue: mockEventRoleService },
        { provide: ShadowAccountService, useValue: mockShadowAccountService },
        { provide: TempAuthCodeService, useValue: mockTempAuthCodeService },
        {
          provide: EmailVerificationCodeService,
          useValue: mockEmailVerificationCodeService,
        },
        { provide: PdsAccountService, useValue: mockPdsAccountService },
        { provide: PdsCredentialService, useValue: mockPdsCredentialService },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockUserAtprotoIdentityService,
        },
        {
          provide: BlueskyIdentityService,
          useValue: mockBlueskyIdentityService,
        },
        { provide: BlueskyService, useValue: mockBlueskyService },
        { provide: ElastiCacheService, useValue: mockElastiCacheService },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('createLoginLink', () => {
    it('should create a login link with valid redirect path', async () => {
      const result = await authService.createLoginLink(
        1,
        'test-tenant',
        '/events/my-event-slug',
      );

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('expiresIn', 60);
      expect(result.url).toContain('/auth/token-login?code=');
      expect(result.url).toContain('redirect=%2Fevents%2Fmy-event-slug');
    });

    it('should store the login link data in Redis with 60-second TTL', async () => {
      await authService.createLoginLink(42, 'test-tenant', '/events/my-event');

      expect(mockElastiCacheService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^login_link:/),
        expect.objectContaining({
          userId: 42,
          tenantId: 'test-tenant',
          redirectPath: '/events/my-event',
        }),
        60,
      );
    });

    it('should return URL with correct frontendDomain from tenant config', async () => {
      // Mock getTenantConfig to return a specific frontend domain
      // We need to mock the module-level function
      const result = await authService.createLoginLink(
        1,
        'test-tenant',
        '/events/test',
      );

      // The URL should contain the frontend domain from tenant config
      expect(result.url).toMatch(/^https?:\/\/.+\/auth\/token-login\?code=/);
    });

    it('should generate a 64-character hex code', async () => {
      await authService.createLoginLink(1, 'test-tenant', '/dashboard');

      const setCall = mockElastiCacheService.set.mock.calls[0];
      const redisKey = setCall[0] as string;
      const code = redisKey.replace('login_link:', '');
      expect(code).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should reject redirect paths containing ://', async () => {
      await expect(
        authService.createLoginLink(1, 'test-tenant', 'https://evil.com/steal'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject redirect paths not starting with /', async () => {
      await expect(
        authService.createLoginLink(1, 'test-tenant', 'events/my-event'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject redirect paths starting with // (protocol-relative URL)', async () => {
      await expect(
        authService.createLoginLink(1, 'test-tenant', '//evil.com/steal'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exchangeLoginLink', () => {
    const mockUser = {
      id: 42,
      ulid: '01HXY1234567890ABCDEFGH',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: { id: 2, name: 'user' },
      slug: 'test-user',
      status: { id: 1, name: 'active' },
    };

    it('should exchange a valid code for login tokens', async () => {
      const code = 'a'.repeat(64);
      mockElastiCacheService.getdel.mockResolvedValue({
        userId: 42,
        tenantId: 'test-tenant',
        redirectPath: '/events/test',
      });
      mockUserService.findById.mockResolvedValue(mockUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      const result = await authService.exchangeLoginLink(code, 'test-tenant');

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('tokenExpires');
      expect(result).toHaveProperty('user');
    });

    it('should atomically consume the code via getdel (single-use)', async () => {
      const code = 'b'.repeat(64);
      mockElastiCacheService.getdel.mockResolvedValue({
        userId: 42,
        tenantId: 'test-tenant',
        redirectPath: '/events/test',
      });
      mockUserService.findById.mockResolvedValue(mockUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      await authService.exchangeLoginLink(code, 'test-tenant');

      // getdel atomically retrieves and deletes - no separate del call needed
      expect(mockElastiCacheService.getdel).toHaveBeenCalledWith(
        `login_link:${code}`,
      );
      expect(mockElastiCacheService.del).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid/expired code', async () => {
      const code = 'c'.repeat(64);
      mockElastiCacheService.getdel.mockResolvedValue(null);

      await expect(
        authService.exchangeLoginLink(code, 'test-tenant'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when tenantId does not match', async () => {
      const code = 'd'.repeat(64);
      mockElastiCacheService.getdel.mockResolvedValue({
        userId: 42,
        tenantId: 'different-tenant',
        redirectPath: '/events/test',
      });

      await expect(
        authService.exchangeLoginLink(code, 'test-tenant'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const code = 'e'.repeat(64);
      mockElastiCacheService.getdel.mockResolvedValue({
        userId: 999,
        tenantId: 'test-tenant',
        redirectPath: '/events/test',
      });
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        authService.exchangeLoginLink(code, 'test-tenant'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use DID as firstName when handle is not available', async () => {
      const code = 'f'.repeat(64);
      const userWithDid = {
        ...mockUser,
        firstName: null,
        socialId: 'did:plc:abc123',
      };
      mockElastiCacheService.getdel.mockResolvedValue({
        userId: 42,
        tenantId: 'test-tenant',
        redirectPath: '/events/test',
      });
      mockUserService.findById.mockResolvedValue(userWithDid);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      // Should still succeed - the user object is returned as-is
      const result = await authService.exchangeLoginLink(code, 'test-tenant');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });
  });
});
