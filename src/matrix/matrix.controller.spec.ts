import { Test, TestingModule } from '@nestjs/testing';
import { MatrixController } from './matrix.controller';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { UserService } from '../user/user.service';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { MatrixEventListener } from './matrix-event.listener';

describe('MatrixController', () => {
  let controller: MatrixController;
  let matrixUserService: MatrixUserService;
  let userService: UserService;
  let globalMatrixValidationService: GlobalMatrixValidationService;

  // Mock data
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    tenantId: 'test-tenant',
  };

  // Create a partial user entity that satisfies the required properties
  const mockFullUser = {
    id: 1,
    email: 'test@example.com',
    ulid: 'test123',
    firstName: 'Test',
    lastName: 'User',
    preferences: {},
    slug: 'test-user',
    provider: 'email',
    createdAt: new Date(),
    updatedAt: new Date(),
    loadPreviousPassword: jest.fn(),
  } as unknown as UserEntity;

  const mockMatrixUserInfo = {
    userId: '@om_test123:matrix.example.org',
    accessToken: 'mock_access_token',
    deviceId: 'mock_device_id',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatrixController],
      providers: [
        {
          provide: MatrixUserService,
          useValue: {
            createUser: jest.fn().mockResolvedValue(mockMatrixUserInfo),
            setUserDisplayName: jest.fn().mockResolvedValue(undefined),
            getClientForUser: jest.fn().mockResolvedValue({
              sendTyping: jest.fn().mockResolvedValue(undefined),
            }),
            provisionMatrixUser: jest
              .fn()
              .mockResolvedValue(mockMatrixUserInfo),
          },
        },
        {
          provide: MatrixRoomService,
          useValue: {
            createRoom: jest.fn(),
            inviteUser: jest.fn(),
            joinRoom: jest.fn(),
          },
        },
        {
          provide: MatrixMessageService,
          useValue: {
            sendMessage: jest.fn(),
            getRoomMessages: jest.fn(),
            sendTypingNotification: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockFullUser),
            update: jest.fn().mockResolvedValue({
              ...mockFullUser,
              matrixUserId: mockMatrixUserInfo.userId,
              matrixAccessToken: mockMatrixUserInfo.accessToken,
              matrixDeviceId: mockMatrixUserInfo.deviceId,
            }),
            request: {
              tenantId: 'test-tenant',
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'matrix') {
                return {
                  baseUrl: 'https://matrix.example.org',
                  serverName: 'matrix.example.org',
                  adminUser: 'admin',
                  adminAccessToken: 'admin_token',
                  defaultDeviceId: 'default_device',
                  defaultInitialDeviceDisplayName: 'OpenMeet Matrix',
                };
              }
              return null;
            }),
          },
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            isMatrixHandleUnique: jest.fn().mockResolvedValue(true),
            registerMatrixHandle: jest.fn().mockResolvedValue(undefined),
            suggestAvailableHandles: jest.fn().mockResolvedValue([]),
            unregisterMatrixHandle: jest.fn().mockResolvedValue(undefined),
            getMatrixHandleRegistration: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: TempAuthCodeService,
          useValue: {
            generateAuthCode: jest.fn().mockResolvedValue('mock-auth-code'),
            validateAndConsumeAuthCode: jest.fn().mockResolvedValue(null),
            getActiveCodeCount: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: MatrixEventListener,
          useValue: {
            // Mock methods that might be called by the controller
          },
        },
        {
          provide: REQUEST,
          useValue: {
            tenantId: 'test-tenant',
          },
        },
      ],
    }).compile();

    controller = module.get<MatrixController>(MatrixController);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    userService = module.get<UserService>(UserService);
    globalMatrixValidationService = module.get<GlobalMatrixValidationService>(
      GlobalMatrixValidationService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('provisionMatrixUser', () => {
    it('should return existing Matrix credentials if user already has them', async () => {
      // Mock user with existing Matrix credentials
      const mockUserWithMatrix = {
        ...mockFullUser,
        matrixUserId: '@existing:matrix.org',
        matrixAccessToken: 'existing_token',
        matrixDeviceId: 'existing_device',
      } as UserEntity;

      jest
        .spyOn(userService, 'findById')
        .mockResolvedValueOnce(mockUserWithMatrix);

      const result = await controller.provisionMatrixUser(mockUser as any);

      expect(result).toEqual({
        matrixUserId: mockUserWithMatrix.matrixUserId,
        success: true,
        provisioned: false,
      });

      // Should not create a new Matrix user
      expect(matrixUserService.createUser).not.toHaveBeenCalled();
    });

    it('should provision a new Matrix user if user does not have Matrix credentials', async () => {
      const result = await controller.provisionMatrixUser(mockUser as any);

      expect(matrixUserService.provisionMatrixUser).toHaveBeenCalledWith(
        mockFullUser,
        'test-tenant',
      );

      expect(
        globalMatrixValidationService.registerMatrixHandle,
      ).toHaveBeenCalledWith(
        'om_test123', // handle extracted from Matrix user ID
        'test-tenant',
        mockUser.id,
      );

      expect(userService.update).toHaveBeenCalledWith(
        mockUser.id,
        {
          preferences: {
            matrix: {
              connected: true,
              connectedAt: expect.any(Date),
            },
          },
        },
        'test-tenant',
      );

      expect(result).toEqual({
        matrixUserId: mockMatrixUserInfo.userId,
        success: true,
        provisioned: true,
      });
    });

    it('should propagate errors from Matrix service', async () => {
      const error = new Error('Failed to create Matrix user');
      jest
        .spyOn(matrixUserService, 'provisionMatrixUser')
        .mockRejectedValueOnce(error);

      await expect(
        controller.provisionMatrixUser(mockUser as any),
      ).rejects.toThrow(error);
    });
  });
});
