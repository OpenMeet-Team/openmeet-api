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
    findOrCreateUser: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    decode: jest
      .fn()
      .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  const mockConfigService = {
    getOrThrow: jest.fn(),
  };

  const mockGroupService = {
    findById: jest.fn(),
  };

  const mockMailService = {
    sendEmail: jest.fn(),
  };

  const mockRoleService = {
    findById: jest.fn(),
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
      it('should not attempt claim when user is a shadow account', async () => {
        // Arrange - User being logged in is a shadow account
        const shadowLoginUser = {
          ...mockRealUser,
          isShadowAccount: true,
        };
        mockUserService.findOrCreateUser = jest
          .fn()
          .mockResolvedValue(shadowLoginUser);

        // Act
        await authService.validateSocialLogin(
          AuthProvidersEnum.bluesky,
          mockSocialData,
          'test-tenant',
        );

        // Assert - Should not attempt to claim
        expect(
          mockShadowAccountService.claimShadowAccount,
        ).not.toHaveBeenCalled();
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
});
