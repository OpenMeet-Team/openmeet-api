import { Test, TestingModule } from '@nestjs/testing';
import { MatrixHandleMigrationService } from './matrix-handle-migration.service';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';
import { MatrixUserService } from './matrix-user.service';
import { UserService } from '../../user/user.service';

describe('MatrixHandleMigrationService', () => {
  let service: MatrixHandleMigrationService;
  let mockGlobalValidationService: jest.Mocked<GlobalMatrixValidationService>;
  let mockMatrixUserService: jest.Mocked<MatrixUserService>;
  let mockUserService: jest.Mocked<UserService>;

  const mockUser = {
    id: 123,
    slug: 'john-smith',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    matrixUserId: '@old.handle:matrix.openmeet.net',
    matrixAccessToken: 'old-token',
    matrixDeviceId: 'old-device',
  };

  const mockNewMatrixUserInfo = {
    userId: '@new.handle:matrix.openmeet.net',
    accessToken: 'new-token',
    deviceId: 'new-device',
  };

  beforeEach(async () => {
    mockGlobalValidationService = {
      isMatrixHandleUnique: jest.fn(),
      registerMatrixHandle: jest.fn(),
      unregisterMatrixHandle: jest.fn(),
    } as any;

    mockMatrixUserService = {
      provisionMatrixUser: jest.fn(),
    } as any;

    mockUserService = {
      findById: jest.fn(),
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixHandleMigrationService,
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalValidationService,
        },
        {
          provide: MatrixUserService,
          useValue: mockMatrixUserService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<MatrixHandleMigrationService>(
      MatrixHandleMigrationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('migrateUserHandle', () => {
    beforeEach(() => {
      mockUserService.findById.mockResolvedValue(mockUser);
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);
      mockMatrixUserService.provisionMatrixUser.mockResolvedValue(
        mockNewMatrixUserInfo,
      );
    });

    it('should successfully migrate user to new handle', async () => {
      const newHandle = 'new.handle';

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        newHandle,
      );

      expect(result.success).toBe(true);
      expect(result.oldMatrixId).toBe('@old.handle:matrix.openmeet.net');
      expect(result.newMatrixId).toBe('@new.handle:matrix.openmeet.net');
      expect(result.migrationSteps).toContain(
        'Found existing Matrix ID: @old.handle:matrix.openmeet.net',
      );
      expect(result.migrationSteps).toContain(
        'Validated new handle availability: new.handle',
      );
      expect(result.migrationSteps).toContain(
        'Created new Matrix account: @new.handle:matrix.openmeet.net',
      );
      expect(result.migrationSteps).toContain(
        'Updated user record with new Matrix credentials',
      );
      expect(result.migrationSteps).toContain(
        'Removed old handle from global registry',
      );
      expect(result.migrationSteps).toContain(
        'Registered new handle: new.handle',
      );

      expect(result.warnings).toContain(
        'Your old Matrix account still exists but is no longer linked to OpenMeet',
      );
      expect(result.warnings).toContain(
        'You will need to rejoin Matrix rooms with your new account',
      );
      expect(result.warnings).toContain(
        'Chat history from your old account will not be transferred',
      );
    });

    it('should call all required services in correct order', async () => {
      const newHandle = 'new.handle';

      await service.migrateUserHandle(123, 'tenant123', newHandle);

      expect(mockUserService.findById).toHaveBeenCalledWith(123, 'tenant123');
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenCalledWith(newHandle);
      expect(mockMatrixUserService.provisionMatrixUser).toHaveBeenCalledWith(
        { ...mockUser, slug: newHandle },
        'tenant123',
      );
      expect(mockUserService.update).toHaveBeenCalledWith(
        123,
        {
          matrixUserId: '@new.handle:matrix.openmeet.net',
          matrixAccessToken: 'new-token',
          matrixDeviceId: 'new-device',
        },
        'tenant123',
      );
      expect(
        mockGlobalValidationService.unregisterMatrixHandle,
      ).toHaveBeenCalledWith('tenant123', 123);
      expect(
        mockGlobalValidationService.registerMatrixHandle,
      ).toHaveBeenCalledWith(newHandle, 'tenant123', 123);
    });

    it('should fail if user not found', async () => {
      mockUserService.findById.mockResolvedValue(null);

      const result = await service.migrateUserHandle(
        999,
        'tenant123',
        'new.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain(
        'User 999 not found in tenant tenant123',
      );
      expect(mockMatrixUserService.provisionMatrixUser).not.toHaveBeenCalled();
    });

    it('should fail if user has no existing Matrix account', async () => {
      const userWithoutMatrix = { ...mockUser, matrixUserId: null };
      mockUserService.findById.mockResolvedValue(userWithoutMatrix);

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'new.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain(
        'User does not have an existing Matrix account',
      );
      expect(mockMatrixUserService.provisionMatrixUser).not.toHaveBeenCalled();
    });

    it('should fail if new handle is already taken', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(false);

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'taken.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Handle taken.handle is already taken');
      expect(mockMatrixUserService.provisionMatrixUser).not.toHaveBeenCalled();
    });

    it('should handle Matrix user creation failure', async () => {
      mockMatrixUserService.provisionMatrixUser.mockRejectedValue(
        new Error('Matrix server error'),
      );

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'new.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Matrix server error');
      expect(mockUserService.update).not.toHaveBeenCalled();
    });

    it('should handle user update failure', async () => {
      mockUserService.update.mockRejectedValue(new Error('Database error'));

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'new.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Database error');
    });

    it('should handle registry operations failure gracefully', async () => {
      mockGlobalValidationService.unregisterMatrixHandle.mockRejectedValue(
        new Error('Registry error'),
      );

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'new.handle',
      );

      expect(result.success).toBe(false);
      expect(result.warnings).toContain('Registry error');
    });

    it('should track migration steps even on failure', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(false);

      const result = await service.migrateUserHandle(
        123,
        'tenant123',
        'taken.handle',
      );

      expect(result.migrationSteps).toContain(
        'Found existing Matrix ID: @old.handle:matrix.openmeet.net',
      );
      expect(result.migrationSteps.length).toBeGreaterThan(0);
    });

    it('should use correct oldMatrixId in result even on early failure', async () => {
      mockUserService.findById.mockResolvedValue(null);

      const result = await service.migrateUserHandle(
        999,
        'tenant123',
        'new.handle',
      );

      expect(result.oldMatrixId).toBe('unknown');
      expect(result.newMatrixId).toBe('');
    });
  });

  describe('canMigrateHandle', () => {
    it('should return true for user with Matrix account', async () => {
      mockUserService.findById.mockResolvedValue(mockUser);

      const result = await service.canMigrateHandle(123, 'tenant123');

      expect(result.canMigrate).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return false for user not found', async () => {
      mockUserService.findById.mockResolvedValue(null);

      const result = await service.canMigrateHandle(999, 'tenant123');

      expect(result.canMigrate).toBe(false);
      expect(result.reason).toBe('User not found');
    });

    it('should return false for user without Matrix account', async () => {
      const userWithoutMatrix = { ...mockUser, matrixUserId: null };
      mockUserService.findById.mockResolvedValue(userWithoutMatrix);

      const result = await service.canMigrateHandle(123, 'tenant123');

      expect(result.canMigrate).toBe(false);
      expect(result.reason).toBe('User does not have a Matrix account');
    });

    it('should handle service errors', async () => {
      mockUserService.findById.mockRejectedValue(new Error('Service error'));

      const result = await service.canMigrateHandle(123, 'tenant123');

      expect(result.canMigrate).toBe(false);
      expect(result.reason).toBe('Service error');
    });
  });

  describe('getMigrationImpact', () => {
    it('should return migration impact for user with Matrix account', async () => {
      mockUserService.findById.mockResolvedValue(mockUser);

      const result = await service.getMigrationImpact(123, 'tenant123');

      expect(result.currentMatrixId).toBe('@old.handle:matrix.openmeet.net');
      expect(result.roomCount).toBe(0); // TODO: implement when Matrix server querying is added
      expect(result.lastActivity).toBeNull(); // TODO: implement when activity tracking is added
      expect(result.impactSummary).toContain(
        'You will get a new Matrix ID that others can use to contact you',
      );
      expect(result.impactSummary).toContain(
        'Your current Matrix account will remain but be disconnected from OpenMeet',
      );
      expect(result.impactSummary).toContain(
        'This change cannot be undone - Matrix IDs are permanent',
      );
    });

    it('should throw error for user without Matrix account', async () => {
      const userWithoutMatrix = { ...mockUser, matrixUserId: null };
      mockUserService.findById.mockResolvedValue(userWithoutMatrix);

      await expect(
        service.getMigrationImpact(123, 'tenant123'),
      ).rejects.toThrow('User does not have a Matrix account');
    });

    it('should throw error for user not found', async () => {
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        service.getMigrationImpact(999, 'tenant123'),
      ).rejects.toThrow('User does not have a Matrix account');
    });
  });
});
