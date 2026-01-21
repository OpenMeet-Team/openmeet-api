import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { SessionService } from '../session/session.service';
import { UnauthorizedException } from '@nestjs/common';
import { GroupService } from '../group/group.service';
import { MailService } from '../mail/mail.service';
import { RoleService } from '../role/role.service';
import { EventQueryService } from '../event/services/event-query.service';
import { mockEventAttendeeService, mockEventQueryService } from '../test/mocks';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { GroupMemberService } from '../group-member/group-member.service';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { AuthProvidersEnum } from './auth-providers.enum';
import { TempAuthCodeService } from './services/temp-auth-code.service';
import { EmailVerificationCodeService } from './services/email-verification-code.service';
import { EventRoleService } from '../event-role/event-role.service';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { PdsApiError } from '../pds/pds.errors';

// Mock bcryptjs for password validation tests
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;

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
    signAsync: jest.fn(),
    decode: jest
      .fn()
      .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  const mockConfigService = {
    getOrThrow: jest.fn(),
    get: jest.fn(),
  };

  const mockGroupService = {
    findById: jest.fn(),
  };

  const mockMailService = {
    sendEmail: jest.fn(),
  };

  const mockRoleService = {
    findById: jest.fn(),
    findByName: jest.fn(),
  };

  const mockTenantConnectionService = {
    getTenantConnection: jest.fn(),
  };

  const mockRequest = {
    tenantId: 'test-tenant',
  };

  const mockGroupMemberService = {
    findGroupMemberByUserSlugAndGroupSlug: jest.fn(),
    getTenantSpecificRepository: jest.fn().mockResolvedValue(undefined),
  };

  const mockShadowAccountService = {
    claimShadowAccount: jest.fn(),
  };

  const mockTempAuthCodeService = {
    generateEmailVerificationCode: jest.fn(),
    validateEmailVerificationCode: jest.fn(),
  };

  const mockEmailVerificationCodeService = {
    generateCode: jest.fn(),
    validateCode: jest.fn(),
  };

  const mockEventRoleService = {
    findByName: jest.fn(),
  };

  const mockPdsAccountService = {
    createAccount: jest.fn(),
    isHandleAvailable: jest.fn(),
  };

  const mockPdsCredentialService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };

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
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
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
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockSession = {
        id: 1,
        secureId: 'test-secure-id-uuid',
        hash: 'oldHash',
        user: { id: 1, slug: 'test-user' },
      };
      const mockUser = {
        id: 1,
        role: { id: 1 },
        slug: 'test-user',
      };

      mockSessionService.findBySecureId.mockResolvedValue(mockSession);
      mockUserService.findById.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('newToken');
      mockConfigService.getOrThrow.mockReturnValue('1h');
      mockGroupService.findById.mockResolvedValue({ id: 1, name: 'Admin' });
      const result = await authService.refreshToken(
        {
          sessionId: 'test-secure-id-uuid',
          hash: 'oldHash',
        },
        'test-tenant-id',
      );

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('tokenExpires');
      expect(mockSessionService.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if session not found', async () => {
      mockSessionService.findBySecureId.mockResolvedValue(null);

      await expect(
        authService.refreshToken(
          { sessionId: 'test-secure-id-uuid', hash: 'oldHash' },
          'test-tenant-id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if hash does not match', async () => {
      const mockSession = {
        id: 1,
        secureId: 'test-secure-id-uuid',
        hash: 'correctHash',
        user: { id: 1 },
      };
      mockSessionService.findBySecureId.mockResolvedValue(mockSession);

      await expect(
        authService.refreshToken(
          { sessionId: 'test-secure-id-uuid', hash: 'wrongHash' },
          'test-tenant-id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user role is not found', async () => {
      const mockSession = {
        id: 1,
        secureId: 'test-secure-id-uuid',
        hash: 'oldHash',
        user: { id: 1 },
      };
      const mockUser = {
        id: 1,
        role: null,
      };

      mockSessionService.findBySecureId.mockResolvedValue(mockSession);
      mockUserService.findById.mockResolvedValue(mockUser);

      await expect(
        authService.refreshToken(
          { sessionId: 'test-secure-id-uuid', hash: 'oldHash' },
          'test-tenant-id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateSocialLogin - Auto-Claim Shadow Account', () => {
    const mockRealUser = {
      id: 22,
      email: 'tom@openmeet.net',
      firstName: 'Tom',
      lastName: 'from OpenMeet',
      socialId: 'did:plc:tldaoujl376zu5wezaznxfev',
      provider: AuthProvidersEnum.bluesky,
      isShadowAccount: false,
      role: { id: 2, name: 'admin' },
      slug: 'tom-from-openmeet',
    };

    const mockSocialData = {
      id: 'did:plc:tldaoujl376zu5wezaznxfev',
      email: 'tom@openmeet.net',
      firstName: 'Tom',
      lastName: 'from OpenMeet',
    };

    beforeEach(() => {
      // Setup common mocks
      mockUserService.findById = jest.fn().mockResolvedValue(mockRealUser);
      mockUserService.findOrCreateUser = jest
        .fn()
        .mockResolvedValue(mockRealUser);
      mockJwtService.signAsync = jest.fn().mockResolvedValue('mock-jwt-token');
      mockConfigService.getOrThrow = jest.fn().mockReturnValue('15m');
    });

    describe('Bluesky Provider - Happy Path', () => {
      it('should claim shadow account when real user logs in and shadow exists', async () => {
        // Arrange
        mockShadowAccountService.claimShadowAccount.mockResolvedValue(
          mockRealUser,
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).toHaveBeenCalledWith(
          mockRealUser.id,
          mockSocialData.id,
          AuthProvidersEnum.bluesky,
          'test-tenant',
        );
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
      });

      it('should not claim when no shadow account exists (returns null)', async () => {
        // Arrange
        mockShadowAccountService.claimShadowAccount.mockResolvedValue(null);

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).toHaveBeenCalledWith(
          mockRealUser.id,
          mockSocialData.id,
          AuthProvidersEnum.bluesky,
          'test-tenant',
        );
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
      });

      it('should continue login successfully even if claim fails', async () => {
        // Arrange
        mockShadowAccountService.claimShadowAccount.mockRejectedValue(
          new Error('Database connection failed'),
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Login should still succeed
        expect(mockShadowAccountService.claimShadowAccount).toHaveBeenCalled();
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
      });
    });

    describe('Bluesky Provider - Edge Cases', () => {
      it('should convert shadow account to real account when they log in', async () => {
        // Arrange - User being logged in is a shadow account without a role
        const shadowLoginUser = {
          ...mockRealUser,
          isShadowAccount: true,
          role: null,
        };
        const convertedUser = {
          ...shadowLoginUser,
          isShadowAccount: false,
          role: { id: 1, name: 'user' },
        };
        const mockUserRole = { id: 1, name: 'user' };

        mockUserService.findOrCreateUser = jest
          .fn()
          .mockResolvedValue(shadowLoginUser);
        mockUserService.update = jest.fn().mockResolvedValue(convertedUser);
        mockRoleService.findByName = jest.fn().mockResolvedValue(mockUserRole);

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Should convert shadow account to real account
        expect(mockRoleService.findByName).toHaveBeenCalledWith(
          'user',
          'test-tenant',
        );
        expect(mockUserService.update).toHaveBeenCalledWith(
          shadowLoginUser.id,
          {
            isShadowAccount: false,
            role: mockUserRole,
          },
          'test-tenant',
        );
        // Should not attempt to claim since this IS the shadow account logging in
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });

      it('should convert shadow account with existing role to real account', async () => {
        // Arrange - Shadow account that already has a role (edge case)
        const shadowLoginUser = {
          ...mockRealUser,
          isShadowAccount: true,
          role: { id: 1, name: 'user' },
        };
        const convertedUser = {
          ...shadowLoginUser,
          isShadowAccount: false,
        };

        mockUserService.findOrCreateUser = jest
          .fn()
          .mockResolvedValue(shadowLoginUser);
        mockUserService.update = jest.fn().mockResolvedValue(convertedUser);

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Should only update isShadowAccount, not role
        expect(mockUserService.update).toHaveBeenCalledWith(
          shadowLoginUser.id,
          {
            isShadowAccount: false,
          },
          'test-tenant',
        );
        expect(mockRoleService.findByName).not.toHaveBeenCalled();
      });

      it('should not attempt claim when socialData.id is missing', async () => {
        // Arrange
        const socialDataWithoutId = {
          email: 'tom@openmeet.net',
          firstName: 'Tom',
          lastName: 'from OpenMeet',
        };

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          socialDataWithoutId,
          'test-tenant',
        );

        // Assert - Should not attempt to claim
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });

      it('should not attempt claim when socialData.id is null', async () => {
        // Arrange
        const socialDataWithNullId = {
          ...mockSocialData,
          id: null,
        };

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          socialDataWithNullId,
          'test-tenant',
        );

        // Assert - Should not attempt to claim
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });

      it('should not attempt claim when socialData.id is empty string', async () => {
        // Arrange
        const socialDataWithEmptyId = {
          ...mockSocialData,
          id: '',
        };

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          socialDataWithEmptyId,
          'test-tenant',
        );

        // Assert - Should not attempt to claim
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });
    });

    describe('Non-Bluesky Providers', () => {
      it('should not attempt claim for Google provider', async () => {
        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });

      it('should not attempt claim for GitHub provider', async () => {
        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.github,
          mockSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });

      it('should not attempt claim for Matrix provider', async () => {
        // Act
        await authService.validateSocialLogin(
          'matrix' as AuthProvidersEnum,
          mockSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should log warning when claim fails with unique constraint error', async () => {
        // Arrange
        const uniqueConstraintError = new Error(
          'duplicate key value violates unique constraint',
        );
        mockShadowAccountService.claimShadowAccount.mockRejectedValue(
          uniqueConstraintError,
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Should log error but not throw
        expect(result).toHaveProperty('token');
      });

      it('should log warning when claim fails with transaction error', async () => {
        // Arrange
        const transactionError = new Error('Transaction rollback');
        mockShadowAccountService.claimShadowAccount.mockRejectedValue(
          transactionError,
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Should log error but not throw
        expect(result).toHaveProperty('token');
      });
    });
  });

  describe('me - Bluesky Handle Resolution', () => {
    it('should resolve Bluesky handle for authenticated user', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        slug: 'test-user',
        role: { id: 1 },
        preferences: {
          bluesky: {
            did: 'did:plc:test123',
            handle: 'old-handle.bsky.social',
            connected: true,
          },
        },
      };
      const jwtPayload = {
        id: 1,
        sessionId: 'test-session',
        role: { id: 1 },
        slug: 'test-user',
        tenantId: 'test-tenant',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockUserService.findById.mockResolvedValue(mockUser);
      mockUserService.resolveBlueskyHandle.mockResolvedValue(
        'new-handle.bsky.social',
      );

      // Act
      await authService.me(jwtPayload);

      // Assert
      expect(mockUserService.resolveBlueskyHandle).toHaveBeenCalledWith(
        mockUser,
      );
    });

    it('should return user with resolved Bluesky handle', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        slug: 'test-user',
        role: { id: 1 },
        preferences: {
          bluesky: {
            did: 'did:plc:test123',
            handle: 'old-handle.bsky.social',
            connected: true,
          },
        },
      };
      const jwtPayload = {
        id: 1,
        sessionId: 'test-session',
        role: { id: 1 },
        slug: 'test-user',
        tenantId: 'test-tenant',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockUserService.findById.mockResolvedValue(mockUser);
      // resolveBlueskyHandle modifies user.preferences.bluesky.handle in-place
      mockUserService.resolveBlueskyHandle.mockImplementation((user) => {
        user.preferences.bluesky.handle = 'resolved-handle.bsky.social';
        return Promise.resolve('resolved-handle.bsky.social');
      });

      // Act
      const result = await authService.me(jwtPayload);

      // Assert
      expect(result?.preferences?.bluesky?.handle).toBe(
        'resolved-handle.bsky.social',
      );
    });

    it('should handle non-Bluesky users gracefully', async () => {
      // Arrange
      const mockUser = {
        id: 1,
        slug: 'test-user',
        role: { id: 1 },
        preferences: null,
      };
      const jwtPayload = {
        id: 1,
        sessionId: 'test-session',
        role: { id: 1 },
        slug: 'test-user',
        tenantId: 'test-tenant',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockUserService.findById.mockResolvedValue(mockUser);
      mockUserService.resolveBlueskyHandle.mockResolvedValue(undefined);

      // Act
      const result = await authService.me(jwtPayload);

      // Assert
      expect(mockUserService.resolveBlueskyHandle).toHaveBeenCalledWith(
        mockUser,
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      // Arrange
      const jwtPayload = {
        id: 999,
        sessionId: 'test-session',
        role: { id: 1 },
        slug: 'test-user',
        tenantId: 'test-tenant',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      mockUserService.findById.mockResolvedValue(null);

      // Act
      const result = await authService.me(jwtPayload);

      // Assert
      expect(result).toBeNull();
      // Should not call resolveBlueskyHandle when user is null
      expect(mockUserService.resolveBlueskyHandle).not.toHaveBeenCalled();
    });
  });

  describe('validateSocialLogin - PDS Account Auto-Creation', () => {
    const mockGoogleUser = {
      id: 42,
      ulid: '01HXY1234567890ABCDEFGH',
      email: 'test@gmail.com',
      firstName: 'Test',
      lastName: 'User',
      socialId: 'google-social-id-123',
      provider: AuthProvidersEnum.google,
      isShadowAccount: false,
      role: { id: 2, name: 'user' },
      slug: 'test-user',
    };

    const mockGitHubUser = {
      ...mockGoogleUser,
      id: 43,
      email: 'test@github.com',
      socialId: 'github-social-id-456',
      provider: AuthProvidersEnum.github,
      slug: 'github-user',
    };

    const mockBlueskyUser = {
      id: 44,
      ulid: '01HXY1234567890ABCDEFGJ',
      email: 'test@bsky.app',
      firstName: 'Bsky',
      lastName: 'User',
      socialId: 'did:plc:bsky123',
      provider: AuthProvidersEnum.bluesky,
      isShadowAccount: false,
      role: { id: 2, name: 'user' },
      slug: 'bsky-user',
    };

    const mockGoogleSocialData = {
      id: 'google-social-id-123',
      email: 'test@gmail.com',
      firstName: 'Test',
      lastName: 'User',
    };

    const mockGitHubSocialData = {
      id: 'github-social-id-456',
      email: 'test@github.com',
      firstName: 'Test',
      lastName: 'User',
    };

    const mockBlueskyData = {
      id: 'did:plc:bsky123',
      email: 'test@bsky.app',
      firstName: 'Bsky',
      lastName: 'User',
    };

    beforeEach(() => {
      // Default setup for successful login
      mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
      mockConfigService.getOrThrow.mockReturnValue('15m');
      // Mock PDS config values
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds.openmeet.net';
        if (key === 'pds.serviceHandleDomains') return '.opnmt.me';
        return undefined;
      });
      mockUserService.findById.mockResolvedValue(mockGoogleUser);
    });

    describe('Google OAuth Login - PDS Account Creation', () => {
      it('should create custodial PDS account when Google user has no AT identity', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        mockPdsAccountService.createAccount.mockResolvedValue({
          did: 'did:plc:newdid123',
          handle: 'test-user.opnmt.me',
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 1,
          userUlid: mockGoogleUser.ulid,
          did: 'did:plc:newdid123',
          handle: 'test-user.opnmt.me',
          pdsUrl: 'https://pds.openmeet.net',
          pdsCredentials: 'encrypted-password',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockUserAtprotoIdentityService.findByUserUlid,
        ).toHaveBeenCalledWith('test-tenant', mockGoogleUser.ulid);
        expect(mockPdsAccountService.createAccount).toHaveBeenCalled();
        expect(mockPdsCredentialService.encrypt).toHaveBeenCalled();
        expect(mockUserAtprotoIdentityService.create).toHaveBeenCalledWith(
          'test-tenant',
          expect.objectContaining({
            userUlid: mockGoogleUser.ulid,
            did: 'did:plc:newdid123',
            handle: 'test-user.opnmt.me',
            isCustodial: true,
          }),
        );
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
      });

      it('should skip PDS creation if Google user already has AT identity', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue({
          id: 1,
          userUlid: mockGoogleUser.ulid,
          did: 'did:plc:existingdid',
          handle: 'existing.opnmt.me',
          pdsUrl: 'https://pds.openmeet.net',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert
        expect(
          mockUserAtprotoIdentityService.findByUserUlid,
        ).toHaveBeenCalled();
        expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
        expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
        expect(result).toHaveProperty('token');
      });
    });

    describe('GitHub OAuth Login - PDS Account Creation', () => {
      it('should create custodial PDS account when GitHub user has no AT identity', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGitHubUser);
        mockUserService.findById.mockResolvedValue(mockGitHubUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        mockPdsAccountService.createAccount.mockResolvedValue({
          did: 'did:plc:githubdid',
          handle: 'github-user.opnmt.me',
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 2,
          userUlid: mockGitHubUser.ulid,
          did: 'did:plc:githubdid',
          handle: 'github-user.opnmt.me',
          pdsUrl: 'https://pds.openmeet.net',
          pdsCredentials: 'encrypted-password',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.github,
          mockGitHubSocialData,
          'test-tenant',
        );

        // Assert
        expect(mockPdsAccountService.createAccount).toHaveBeenCalled();
        expect(mockUserAtprotoIdentityService.create).toHaveBeenCalledWith(
          'test-tenant',
          expect.objectContaining({
            isCustodial: true,
          }),
        );
        expect(result).toHaveProperty('token');
      });
    });

    describe('Bluesky OAuth Login - Link Existing DID', () => {
      it('should link existing DID when Bluesky user logs in without custodial account', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockBlueskyUser);
        mockUserService.findById.mockResolvedValue(mockBlueskyUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        // Mock profile resolution to return handle
        mockBlueskyIdentityService.resolveProfile.mockResolvedValue({
          did: 'did:plc:bsky123',
          handle: 'bsky-user.bsky.social',
          displayName: 'Bsky User',
        });
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 3,
          userUlid: mockBlueskyUser.ulid,
          did: 'did:plc:bsky123',
          handle: 'bsky-user.bsky.social',
          pdsUrl: null,
          pdsCredentials: null,
          isCustodial: false,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockBlueskyData,
          'test-tenant',
        );

        // Assert
        expect(
          mockUserAtprotoIdentityService.findByUserUlid,
        ).toHaveBeenCalled();
        // Should resolve the profile to get the handle
        expect(mockBlueskyIdentityService.resolveProfile).toHaveBeenCalledWith(
          'did:plc:bsky123',
        );
        // Should NOT create a custodial PDS account for Bluesky users
        expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
        // Should link their existing DID with isCustodial: false and resolved handle
        expect(mockUserAtprotoIdentityService.create).toHaveBeenCalledWith(
          'test-tenant',
          expect.objectContaining({
            did: 'did:plc:bsky123',
            handle: 'bsky-user.bsky.social',
            isCustodial: false,
          }),
        );
        expect(result).toHaveProperty('token');
      });

      it('should skip identity creation if Bluesky user already has AT identity', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockBlueskyUser);
        mockUserService.findById.mockResolvedValue(mockBlueskyUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue({
          id: 3,
          userUlid: mockBlueskyUser.ulid,
          did: 'did:plc:bsky123',
          isCustodial: false,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockBlueskyData,
          'test-tenant',
        );

        // Assert
        expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
        expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
        expect(result).toHaveProperty('token');
      });
    });

    describe('Handle Collision Avoidance', () => {
      it('should append number to handle when initial handle is taken', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        // First handle check returns false (taken), second returns true (available)
        mockPdsAccountService.isHandleAvailable
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true);
        mockPdsAccountService.createAccount.mockResolvedValue({
          did: 'did:plc:newdid123',
          handle: 'test-user1.opnmt.me',
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 1,
          userUlid: mockGoogleUser.ulid,
          did: 'did:plc:newdid123',
          handle: 'test-user1.opnmt.me',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert
        expect(mockPdsAccountService.isHandleAvailable).toHaveBeenCalledTimes(
          2,
        );
        expect(result).toHaveProperty('token');
      });
    });

    describe('Handle Length Truncation', () => {
      it('should truncate long slugs to fit PDS handle length limit', async () => {
        // Arrange - Create user with a long slug
        const userWithLongSlug = {
          ...mockGoogleUser,
          slug: 'very-long-username-that-exceeds-limit', // 38 chars, way over limit
        };
        mockUserService.findOrCreateUser.mockResolvedValue(userWithLongSlug);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        // With domain '.opnmt.me' (9 chars) and max 27 chars total, max slug is 16 chars
        // 'very-long-username-that-exceeds-limit' truncated to 16 chars = 'very-long-userna'
        // After removing trailing hyphen = 'very-long-userna'
        mockPdsAccountService.createAccount.mockResolvedValue({
          did: 'did:plc:truncated123',
          handle: 'very-long-userna.opnmt.me',
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 1,
          userUlid: userWithLongSlug.ulid,
          did: 'did:plc:truncated123',
          handle: 'very-long-userna.opnmt.me',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Handle should be truncated
        expect(mockPdsAccountService.isHandleAvailable).toHaveBeenCalledWith(
          expect.stringMatching(/^very-long-userna\.opnmt\.me$/),
        );
        expect(result).toHaveProperty('token');
      });

      it('should remove trailing hyphens after truncation', async () => {
        // Arrange - Create user with slug that ends with hyphen after truncation
        const userWithHyphenSlug = {
          ...mockGoogleUser,
          slug: 'my-super-long---username', // After 16 char truncation: 'my-super-long---'
        };
        mockUserService.findOrCreateUser.mockResolvedValue(userWithHyphenSlug);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        mockPdsAccountService.createAccount.mockResolvedValue({
          did: 'did:plc:nohyphen123',
          handle: 'my-super-long.opnmt.me', // Trailing hyphens removed
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 1,
          userUlid: userWithHyphenSlug.ulid,
          did: 'did:plc:nohyphen123',
          handle: 'my-super-long.opnmt.me',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Trailing hyphens should be removed
        expect(mockPdsAccountService.isHandleAvailable).toHaveBeenCalledWith(
          expect.stringMatching(/^my-super-long\.opnmt\.me$/),
        );
        expect(result).toHaveProperty('token');
      });
    });

    describe('PDS Not Configured', () => {
      it('should skip PDS account creation when PDS_URL is not configured', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'pds.url') return undefined; // PDS not configured
          if (key === 'pds.serviceHandleDomains') return '.opnmt.me';
          return undefined;
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Login should succeed but no PDS account created
        expect(result).toHaveProperty('token');
        expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
        expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
      });
    });

    describe('PDS Unavailable - Graceful Degradation', () => {
      it('should succeed login even if PDS is unavailable', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        // PDS account creation fails
        mockPdsAccountService.createAccount.mockRejectedValue(
          new Error('PDS connection failed'),
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Login should still succeed
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
        // AT identity should NOT be created since PDS account creation failed
        expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
      });

      it('should log warning when PDS creation fails but continue with login', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        mockPdsAccountService.isHandleAvailable.mockRejectedValue(
          new Error('Network error'),
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Login should still succeed
        expect(result).toHaveProperty('token');
        expect(result).toHaveProperty('user');
      });
    });

    describe('Bluesky Profile Resolution - Graceful Degradation', () => {
      it('should skip identity creation when profile resolution fails but login still succeeds', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockBlueskyUser);
        mockUserService.findById.mockResolvedValue(mockBlueskyUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        // Mock profile resolution to fail
        mockBlueskyIdentityService.resolveProfile.mockRejectedValue(
          new Error('Network timeout'),
        );

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockBlueskyData,
          'test-tenant',
        );

        // Assert - Login should still succeed, but identity creation is skipped
        // (can't create valid AT Protocol identity without PDS URL from profile resolution)
        expect(result).toHaveProperty('token');
        expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
      });
    });

    describe('Race Condition Retry', () => {
      it('should retry when handle is taken between check and create', async () => {
        // Arrange
        mockUserService.findOrCreateUser.mockResolvedValue(mockGoogleUser);
        mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
        // First handle check returns available
        mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
        // First create fails with handle taken error, second succeeds
        mockPdsAccountService.createAccount
          .mockRejectedValueOnce(
            new PdsApiError('Handle not available', 400, 'HandleNotAvailable'),
          )
          .mockResolvedValueOnce({
            did: 'did:plc:newdid123',
            handle: 'test-user1.opnmt.me',
            accessJwt: 'access-jwt',
            refreshJwt: 'refresh-jwt',
          });
        mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
        mockUserAtprotoIdentityService.create.mockResolvedValue({
          id: 1,
          userUlid: mockGoogleUser.ulid,
          did: 'did:plc:newdid123',
          handle: 'test-user1.opnmt.me',
          isCustodial: true,
        });

        // Act
        const result = await authService.validateSocialLogin(
          AuthProvidersEnum.google,
          mockGoogleSocialData,
          'test-tenant',
        );

        // Assert - Should have retried and succeeded
        expect(mockPdsAccountService.createAccount).toHaveBeenCalledTimes(2);
        expect(result).toHaveProperty('token');
        expect(mockUserAtprotoIdentityService.create).toHaveBeenCalled();
      });
    });
  });

  describe('validateLogin - Email Login PDS Account Creation', () => {
    const mockEmailUser = {
      id: 50,
      ulid: '01HXY1234567890EMAILUSER',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: '$2b$10$hashedpassword',
      provider: AuthProvidersEnum.email,
      isShadowAccount: false,
      role: { id: 2, name: 'user' },
      slug: 'test-email-user',
      status: { id: 1, name: 'active' }, // StatusEnum.active = 1
    };

    beforeEach(() => {
      // Default setup for successful email login
      mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
      mockConfigService.getOrThrow.mockReturnValue('15m');
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds.openmeet.net';
        if (key === 'pds.serviceHandleDomains') return '.opnmt.me';
        return undefined;
      });
      mockUserService.findById.mockResolvedValue(mockEmailUser);
    });

    it('should create custodial PDS account when email user logs in without AT identity', async () => {
      // Arrange
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      mockUserService.findByEmail.mockResolvedValue(mockEmailUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
      mockPdsAccountService.createAccount.mockResolvedValue({
        did: 'did:plc:emaildid123',
        handle: 'test-email-user.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
      mockUserAtprotoIdentityService.create.mockResolvedValue({
        id: 1,
        userUlid: mockEmailUser.ulid,
        did: 'did:plc:emaildid123',
        handle: 'test-email-user.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        pdsCredentials: 'encrypted-password',
        isCustodial: true,
      });

      // Act
      const result = await authService.validateLogin(
        { email: 'test@example.com', password: 'password123' },
        'test-tenant',
      );

      // Assert
      expect(
        mockUserAtprotoIdentityService.findByUserUlid,
      ).toHaveBeenCalledWith('test-tenant', mockEmailUser.ulid);
      expect(mockPdsAccountService.createAccount).toHaveBeenCalled();
      expect(mockPdsCredentialService.encrypt).toHaveBeenCalled();
      expect(mockUserAtprotoIdentityService.create).toHaveBeenCalledWith(
        'test-tenant',
        expect.objectContaining({
          userUlid: mockEmailUser.ulid,
          did: 'did:plc:emaildid123',
          handle: 'test-email-user.opnmt.me',
          isCustodial: true,
        }),
      );
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });

    it('should skip PDS creation if email user already has AT identity', async () => {
      // Arrange
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      mockUserService.findByEmail.mockResolvedValue(mockEmailUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue({
        id: 1,
        userUlid: mockEmailUser.ulid,
        did: 'did:plc:existingemailid',
        handle: 'existing-email.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        isCustodial: true,
      });

      // Act
      const result = await authService.validateLogin(
        { email: 'test@example.com', password: 'password123' },
        'test-tenant',
      );

      // Assert
      expect(mockUserAtprotoIdentityService.findByUserUlid).toHaveBeenCalled();
      expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
      expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('token');
    });
  });

  describe('verifyEmailCode - Email Verification PDS Account Creation', () => {
    const mockEmailUser = {
      id: 51,
      ulid: '01HXY1234567890VERIFYUSR',
      email: 'verify@example.com',
      firstName: 'Verify',
      lastName: 'User',
      provider: AuthProvidersEnum.email,
      isShadowAccount: false,
      role: { id: 2, name: 'user' },
      slug: 'verify-user',
      status: { id: 1, name: 'inactive' }, // StatusEnum.inactive
    };

    const activatedUser = {
      ...mockEmailUser,
      status: { id: 2, name: 'active' },
    };

    beforeEach(() => {
      // Default setup for successful email verification
      mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
      mockConfigService.getOrThrow.mockReturnValue('15m');
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds.openmeet.net';
        if (key === 'pds.serviceHandleDomains') return '.opnmt.me';
        return undefined;
      });
    });

    it('should create custodial PDS account when verifying email code', async () => {
      // Arrange
      mockEmailVerificationCodeService.validateCode.mockResolvedValue({
        userId: mockEmailUser.id,
        email: 'verify@example.com',
      });
      mockUserService.findById.mockResolvedValue(mockEmailUser);
      mockUserService.update.mockResolvedValue(activatedUser);
      mockUserService.findByEmail.mockResolvedValue(activatedUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
      mockPdsAccountService.createAccount.mockResolvedValue({
        did: 'did:plc:verifydid123',
        handle: 'verify-user.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      mockPdsCredentialService.encrypt.mockReturnValue('encrypted-password');
      mockUserAtprotoIdentityService.create.mockResolvedValue({
        id: 1,
        userUlid: activatedUser.ulid,
        did: 'did:plc:verifydid123',
        handle: 'verify-user.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        pdsCredentials: 'encrypted-password',
        isCustodial: true,
      });

      // Act
      const result = await authService.verifyEmailCode(
        { code: '123456', email: 'verify@example.com' },
        'test-tenant',
      );

      // Assert
      expect(
        mockUserAtprotoIdentityService.findByUserUlid,
      ).toHaveBeenCalledWith('test-tenant', activatedUser.ulid);
      expect(mockPdsAccountService.createAccount).toHaveBeenCalled();
      expect(mockPdsCredentialService.encrypt).toHaveBeenCalled();
      expect(mockUserAtprotoIdentityService.create).toHaveBeenCalledWith(
        'test-tenant',
        expect.objectContaining({
          userUlid: activatedUser.ulid,
          did: 'did:plc:verifydid123',
          handle: 'verify-user.opnmt.me',
          isCustodial: true,
        }),
      );
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });

    it('should skip PDS creation if user already has AT identity after email verification', async () => {
      // Arrange
      const alreadyActiveUser = {
        ...mockEmailUser,
        status: { id: 2, name: 'active' },
      };
      mockEmailVerificationCodeService.validateCode.mockResolvedValue({
        userId: alreadyActiveUser.id,
        email: 'verify@example.com',
      });
      mockUserService.findById.mockResolvedValue(alreadyActiveUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue({
        id: 1,
        userUlid: alreadyActiveUser.ulid,
        did: 'did:plc:existingverifydid',
        handle: 'existing-verify.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        isCustodial: true,
      });

      // Act
      const result = await authService.verifyEmailCode(
        { code: '123456', email: 'verify@example.com' },
        'test-tenant',
      );

      // Assert
      expect(mockUserAtprotoIdentityService.findByUserUlid).toHaveBeenCalled();
      expect(mockPdsAccountService.createAccount).not.toHaveBeenCalled();
      expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
      expect(result).toHaveProperty('token');
    });

    it('should continue login even if PDS creation fails during email verification', async () => {
      // Arrange
      mockEmailVerificationCodeService.validateCode.mockResolvedValue({
        userId: mockEmailUser.id,
        email: 'verify@example.com',
      });
      mockUserService.findById.mockResolvedValue(mockEmailUser);
      mockUserService.update.mockResolvedValue(activatedUser);
      mockUserService.findByEmail.mockResolvedValue(activatedUser);
      mockUserAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      mockPdsAccountService.isHandleAvailable.mockResolvedValue(true);
      mockPdsAccountService.createAccount.mockRejectedValue(
        new Error('PDS connection failed'),
      );

      // Act
      const result = await authService.verifyEmailCode(
        { code: '123456', email: 'verify@example.com' },
        'test-tenant',
      );

      // Assert - Login should still succeed even if PDS creation failed
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(mockUserAtprotoIdentityService.create).not.toHaveBeenCalled();
    });
  });
});
