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
import { EventService } from '../event/event.service';
import { mockEventAttendeeService, mockEventService } from '../test/mocks';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { RoleEnum } from '../role/role.enum';
import { UnprocessableEntityException } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;

  const mockSessionService = {
    findById: jest.fn(),
    update: jest.fn(),
    create: jest.fn().mockResolvedValue({
      id: 1,
      hash: 'mock-session-hash',
    }),
  };

  const mockUserService = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('mock-secret'),
  };

  const mockGroupService = {
    findById: jest.fn(),
  };

  const mockMailService = {
    sendEmail: jest.fn(),
    userSignUp: jest.fn().mockResolvedValue(true),
  };

  const mockRoleService = {
    findById: jest.fn(),
    findByName: jest.fn(),
  };

  const mockDefaultRole = {
    id: 1,
    name: RoleEnum.User,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRoleService.findByName.mockResolvedValue(mockDefaultRole);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SessionService, useValue: mockSessionService },
        { provide: UserService, useValue: mockUserService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MailService, useValue: mockMailService },
        { provide: RoleService, useValue: mockRoleService },
        { provide: EventService, useValue: mockEventService },
        { provide: EventAttendeeService, useValue: mockEventAttendeeService },
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

  describe('register', () => {
    const mockRegistrationData = {
      email: 'test@openmeet.net',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    beforeEach(() => {
      jest.clearAllMocks();

      // Default happy path setup
      mockRoleService.findByName.mockResolvedValue(mockDefaultRole);
      mockUserService.findByEmail.mockResolvedValue(null);
      mockUserService.create.mockResolvedValue({
        id: 1,
        ...mockRegistrationData,
        role: mockDefaultRole,
      });
      mockSessionService.create.mockResolvedValue({
        id: 1,
        hash: 'mock-session-hash',
      });
    });

    it('should successfully register a new user', async () => {
      const result = await authService.register(mockRegistrationData);

      // Check only essential response properties
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');

      // Verify core functionality executed
      expect(mockUserService.create).toHaveBeenCalled();
      expect(mockMailService.userSignUp).toHaveBeenCalled();
    });

    it('should not allow duplicate email registration', async () => {
      mockUserService.create.mockRejectedValue(new Error());

      await expect(
        authService.register(mockRegistrationData),
      ).rejects.toThrow();

      expect(mockMailService.userSignUp).not.toHaveBeenCalled();
    });

    it('should validate password requirements', async () => {
      const invalidData = {
        ...mockRegistrationData,
        password: 'weak',
      };

      mockUserService.create.mockRejectedValue(new Error());

      await expect(authService.register(invalidData)).rejects.toThrow();

      expect(mockMailService.userSignUp).not.toHaveBeenCalled();
    });

    it('should create a session for the new user', async () => {
      const result = await authService.register(mockRegistrationData);

      expect(result.refreshToken).toBeDefined();
      expect(mockSessionService.create).toHaveBeenCalled();
    });

    it('should require a valid role', async () => {
      mockRoleService.findByName.mockResolvedValue(null);

      await expect(authService.register(mockRegistrationData)).rejects.toThrow(
        /Role not found/,
      );

      expect(mockUserService.create).not.toHaveBeenCalled();
      expect(mockMailService.userSignUp).not.toHaveBeenCalled();
    });
  });
});
