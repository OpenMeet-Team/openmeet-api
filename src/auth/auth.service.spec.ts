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
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('AuthService', () => {
  let authService: AuthService;

  const mockSessionService = {
    findById: jest.fn(),
    update: jest.fn(),
    getTenantSpecificRepository: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserService = {
    findById: jest.fn(),
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

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
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
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        { provide: REQUEST, useValue: mockRequest },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockSession = {
        id: 1,
        hash: 'oldHash',
        user: { id: 1 },
      };
      const mockUser = {
        id: 1,
        role: { id: 1 },
      };

      mockSessionService.findById.mockResolvedValue(mockSession);
      mockUserService.findById.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('newToken');
      mockConfigService.getOrThrow.mockReturnValue('1h');
      mockGroupService.findById.mockResolvedValue({ id: 1, name: 'Admin' });
      const result = await authService.refreshToken({
        sessionId: 1,
        hash: 'oldHash',
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('tokenExpires');
      expect(mockSessionService.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if session not found', async () => {
      mockSessionService.findById.mockResolvedValue(null);

      await expect(
        authService.refreshToken({ sessionId: 1, hash: 'oldHash' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if hash does not match', async () => {
      const mockSession = {
        id: 1,
        hash: 'correctHash',
        user: { id: 1 },
      };
      mockSessionService.findById.mockResolvedValue(mockSession);

      await expect(
        authService.refreshToken({ sessionId: 1, hash: 'wrongHash' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user role is not found', async () => {
      const mockSession = {
        id: 1,
        hash: 'oldHash',
        user: { id: 1 },
      };
      const mockUser = {
        id: 1,
        role: null,
      };

      mockSessionService.findById.mockResolvedValue(mockSession);
      mockUserService.findById.mockResolvedValue(mockUser);

      await expect(
        authService.refreshToken({ sessionId: 1, hash: 'oldHash' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
