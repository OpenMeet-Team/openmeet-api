import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { MatrixController } from './matrix.controller';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { MatrixGateway } from './matrix.gateway';
import { UserService } from '../user/user.service';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';

describe('MatrixController - Handle Endpoints', () => {
  let controller: MatrixController;
  let mockGlobalValidationService: jest.Mocked<GlobalMatrixValidationService>;
  let mockMatrixUserService: jest.Mocked<MatrixUserService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockRequest: any;

  const mockUser = {
    id: 123,
    slug: 'john-smith',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    matrixUserId: null,
    matrixAccessToken: null,
    matrixDeviceId: null,
    preferences: {},
  };

  const mockMatrixUserInfo = {
    userId: '@john.smith:matrix.openmeet.net',
    accessToken: 'access-token-123',
    deviceId: 'device-123',
  };

  beforeEach(async () => {
    mockGlobalValidationService = {
      isMatrixHandleUnique: jest.fn(),
      suggestAvailableHandles: jest.fn(),
      registerMatrixHandle: jest.fn(),
    } as any;

    mockMatrixUserService = {
      provisionMatrixUserWithHandle: jest.fn(),
    } as any;

    mockUserService = {
      findById: jest.fn(),
      update: jest.fn(),
    } as any;

    mockRequest = {
      tenantId: 'tenant123',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatrixController],
      providers: [
        {
          provide: MatrixUserService,
          useValue: mockMatrixUserService,
        },
        {
          provide: MatrixRoomService,
          useValue: {},
        },
        {
          provide: MatrixMessageService,
          useValue: {},
        },
        {
          provide: MatrixGateway,
          useValue: {},
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalValidationService,
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
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    controller = module.get<MatrixController>(MatrixController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkMatrixHandle', () => {
    it('should return available for unique handle', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);

      const result = await controller.checkMatrixHandle('john.smith');

      expect(result).toEqual({
        available: true,
        handle: 'john.smith',
      });
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenCalledWith('john.smith');
    });

    it('should return not available with suggestions for taken handle', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(false);
      mockGlobalValidationService.suggestAvailableHandles.mockResolvedValue([
        'john.smith2',
        'john.smith3',
        'johnsmith',
      ]);

      const result = await controller.checkMatrixHandle('john.smith');

      expect(result).toEqual({
        available: false,
        handle: 'john.smith',
        suggestions: ['john.smith2', 'john.smith3', 'johnsmith'],
      });
      expect(
        mockGlobalValidationService.suggestAvailableHandles,
      ).toHaveBeenCalledWith('john.smith');
    });

    it('should throw BadRequestException for empty handle', async () => {
      await expect(controller.checkMatrixHandle('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.checkMatrixHandle(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for non-string handle', async () => {
      await expect(controller.checkMatrixHandle(123 as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('suggestMatrixHandles', () => {
    it('should return handle suggestions', async () => {
      mockGlobalValidationService.suggestAvailableHandles.mockResolvedValue([
        'john.smith',
        'johnsmith',
        'j.smith',
      ]);

      const result = await controller.suggestMatrixHandles('john smith');

      expect(result).toEqual({
        suggestions: ['john.smith', 'johnsmith', 'j.smith'],
        desiredHandle: 'john smith',
      });
      expect(
        mockGlobalValidationService.suggestAvailableHandles,
      ).toHaveBeenCalledWith('john smith', 5);
    });

    it('should respect custom limit', async () => {
      mockGlobalValidationService.suggestAvailableHandles.mockResolvedValue([
        'john.smith',
        'johnsmith',
      ]);

      const result = await controller.suggestMatrixHandles('john smith', '2');

      expect(result).toEqual({
        suggestions: ['john.smith', 'johnsmith'],
        desiredHandle: 'john smith',
      });
      expect(
        mockGlobalValidationService.suggestAvailableHandles,
      ).toHaveBeenCalledWith('john smith', 2);
    });

    it('should throw BadRequestException for invalid limit', async () => {
      await expect(
        controller.suggestMatrixHandles('john', '0'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.suggestMatrixHandles('john', '25'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty handle', async () => {
      await expect(controller.suggestMatrixHandles('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('provisionMatrixUserWithHandle', () => {
    beforeEach(() => {
      mockUserService.findById.mockResolvedValue(mockUser);
    });

    it('should provision new Matrix user with chosen handle', async () => {
      mockMatrixUserService.provisionMatrixUserWithHandle.mockResolvedValue(
        mockMatrixUserInfo,
      );

      const result = await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        { handle: 'john.smith' },
      );

      expect(result).toEqual({
        matrixUserId: '@john.smith:matrix.openmeet.net',
        handle: 'john.smith',
        provisioned: true,
        success: true,
      });

      expect(
        mockMatrixUserService.provisionMatrixUserWithHandle,
      ).toHaveBeenCalledWith(mockUser, 'tenant123', 123, 'john.smith');

      expect(mockUserService.update).toHaveBeenCalledWith(
        123,
        {
          matrixUserId: '@john.smith:matrix.openmeet.net',
          matrixAccessToken: 'access-token-123',
          matrixDeviceId: 'device-123',
          preferences: {
            matrix: {
              connected: true,
              connectedAt: expect.any(Date),
            },
          },
        },
        'tenant123',
      );
    });

    it('should provision new Matrix user with auto-generated handle', async () => {
      mockMatrixUserService.provisionMatrixUserWithHandle.mockResolvedValue(
        mockMatrixUserInfo,
      );

      const result = await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        {},
      );

      expect(result).toEqual({
        matrixUserId: '@john.smith:matrix.openmeet.net',
        handle: 'john.smith',
        provisioned: true,
        success: true,
      });

      expect(
        mockMatrixUserService.provisionMatrixUserWithHandle,
      ).toHaveBeenCalledWith(mockUser, 'tenant123', 123, undefined);
    });

    it('should return existing Matrix credentials if user already has them', async () => {
      const existingUser = {
        ...mockUser,
        matrixUserId: '@existing.handle:matrix.openmeet.net',
        matrixAccessToken: 'existing-token',
        matrixDeviceId: 'existing-device',
      };
      mockUserService.findById.mockResolvedValue(existingUser);

      const result = await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        { handle: 'john.smith' },
      );

      expect(result).toEqual({
        matrixUserId: '@existing.handle:matrix.openmeet.net',
        handle: 'existing.handle',
        provisioned: false,
        success: true,
      });

      expect(
        mockMatrixUserService.provisionMatrixUserWithHandle,
      ).not.toHaveBeenCalled();
      expect(mockUserService.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if no tenant ID', async () => {
      mockRequest.tenantId = null;

      await expect(
        controller.provisionMatrixUserWithHandle(
          { id: 123 },
          { handle: 'john.smith' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if user not found', async () => {
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        controller.provisionMatrixUserWithHandle(
          { id: 999 },
          { handle: 'john.smith' },
        ),
      ).rejects.toThrow('User with ID 999 not found');
    });

    it('should preserve existing user preferences when updating', async () => {
      const userWithPreferences = {
        ...mockUser,
        preferences: {
          notifications: { email: true },
          theme: 'dark',
        },
      };
      mockUserService.findById.mockResolvedValue(userWithPreferences);
      mockMatrixUserService.provisionMatrixUserWithHandle.mockResolvedValue(
        mockMatrixUserInfo,
      );

      await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        { handle: 'john.smith' },
      );

      expect(mockUserService.update).toHaveBeenCalledWith(
        123,
        {
          matrixUserId: '@john.smith:matrix.openmeet.net',
          matrixAccessToken: 'access-token-123',
          matrixDeviceId: 'device-123',
          preferences: {
            notifications: { email: true },
            theme: 'dark',
            matrix: {
              connected: true,
              connectedAt: expect.any(Date),
            },
          },
        },
        'tenant123',
      );
    });

    it('should handle Matrix provisioning errors', async () => {
      mockMatrixUserService.provisionMatrixUserWithHandle.mockRejectedValue(
        new Error('Matrix handle john.smith is already taken'),
      );

      await expect(
        controller.provisionMatrixUserWithHandle(
          { id: 123 },
          { handle: 'john.smith' },
        ),
      ).rejects.toThrow('Matrix handle john.smith is already taken');

      expect(mockUserService.update).not.toHaveBeenCalled();
    });

    it('should extract handle from complex Matrix user ID', async () => {
      const complexMatrixUserInfo = {
        userId: '@complex.handle.with.dots:matrix.openmeet.net',
        accessToken: 'access-token-123',
        deviceId: 'device-123',
      };
      mockMatrixUserService.provisionMatrixUserWithHandle.mockResolvedValue(
        complexMatrixUserInfo,
      );

      const result = await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        { handle: 'complex.handle.with.dots' },
      );

      expect(result.handle).toBe('complex.handle.with.dots');
    });

    it('should handle Matrix user ID without proper format', async () => {
      const malformedMatrixUserInfo = {
        userId: 'malformed-user-id',
        accessToken: 'access-token-123',
        deviceId: 'device-123',
      };
      mockMatrixUserService.provisionMatrixUserWithHandle.mockResolvedValue(
        malformedMatrixUserInfo,
      );

      const result = await controller.provisionMatrixUserWithHandle(
        { id: 123 },
        { handle: 'john.smith' },
      );

      expect(result.handle).toBe('unknown');
    });
  });
});
