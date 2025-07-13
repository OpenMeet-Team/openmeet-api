import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { MatrixUserService } from './matrix-user.service';
import { MatrixCoreService } from './matrix-core.service';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';

describe('MatrixUserService - Handle-based Provisioning', () => {
  let service: MatrixUserService;
  let mockMatrixCoreService: jest.Mocked<MatrixCoreService>;
  let mockGlobalValidationService: jest.Mocked<GlobalMatrixValidationService>;
  let mockModuleRef: jest.Mocked<ModuleRef>;

  const mockUser = {
    slug: 'john-smith',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
  };

  const mockMatrixConfig = {
    baseUrl: 'http://matrix-test',
    serverName: 'matrix.test.net',
    adminToken: 'admin-token',
  };

  const mockMatrixUserInfo = {
    userId: '@john.smith:matrix.test.net',
    accessToken: 'access-token-123',
    deviceId: 'device-123',
  };

  beforeEach(async () => {
    mockMatrixCoreService = {
      getConfig: jest.fn().mockReturnValue(mockMatrixConfig),
      getAdminClient: jest.fn(),
    } as any;

    mockGlobalValidationService = {
      isMatrixHandleUnique: jest.fn(),
      registerMatrixHandle: jest.fn(),
      suggestAvailableHandles: jest.fn(),
    } as any;

    mockModuleRef = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixUserService,
        {
          provide: MatrixCoreService,
          useValue: mockMatrixCoreService,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalValidationService,
        },
      ],
    }).compile();

    service = module.get<MatrixUserService>(MatrixUserService);

    // Mock the createUser method since it makes HTTP calls
    jest.spyOn(service, 'createUser').mockResolvedValue(mockMatrixUserInfo);
    jest.spyOn(service, 'setUserDisplayName').mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('provisionMatrixUserWithHandle', () => {
    it('should provision user with chosen handle', async () => {
      const chosenHandle = 'john.smith';
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);

      const result = await service.provisionMatrixUserWithHandle(
        mockUser,
        'tenant123',
        456,
        chosenHandle,
      );

      expect(result).toEqual(mockMatrixUserInfo);
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenCalledWith(chosenHandle);
      expect(service.createUser).toHaveBeenCalledWith({
        username: `${chosenHandle}_tenant123`,
        password: expect.any(String),
        displayName: 'John Smith',
      });
      expect(
        mockGlobalValidationService.registerMatrixHandle,
      ).toHaveBeenCalledWith(`${chosenHandle}_tenant123`, 'tenant123', 456);
    });

    it('should throw error if chosen handle is not available', async () => {
      const chosenHandle = 'taken.handle';
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(false);

      await expect(
        service.provisionMatrixUserWithHandle(
          mockUser,
          'tenant123',
          456,
          chosenHandle,
        ),
      ).rejects.toThrow('Matrix handle taken.handle is already taken');

      expect(service.createUser).not.toHaveBeenCalled();
      expect(
        mockGlobalValidationService.registerMatrixHandle,
      ).not.toHaveBeenCalled();
    });

    it('should auto-generate handle when none provided', async () => {
      // Mock the generateUniqueHandle method indirectly by mocking validation calls
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValueOnce(
        true,
      ); // for auto-generated handle

      const result = await service.provisionMatrixUserWithHandle(
        mockUser,
        'tenant123',
        456,
      );

      expect(result).toEqual(mockMatrixUserInfo);
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenCalled();
      expect(service.createUser).toHaveBeenCalled();
      expect(
        mockGlobalValidationService.registerMatrixHandle,
      ).toHaveBeenCalled();
    });

    it('should set display name after user creation', async () => {
      const chosenHandle = 'john.smith';
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);

      await service.provisionMatrixUserWithHandle(
        mockUser,
        'tenant123',
        456,
        chosenHandle,
      );

      expect(service.setUserDisplayName).toHaveBeenCalledWith(
        mockMatrixUserInfo.userId,
        mockMatrixUserInfo.accessToken,
        'John Smith',
        mockMatrixUserInfo.deviceId,
      );
    });

    it('should continue if display name setting fails', async () => {
      const chosenHandle = 'john.smith';
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);
      jest
        .spyOn(service, 'setUserDisplayName')
        .mockRejectedValue(new Error('Display name failed'));

      const result = await service.provisionMatrixUserWithHandle(
        mockUser,
        'tenant123',
        456,
        chosenHandle,
      );

      expect(result).toEqual(mockMatrixUserInfo);
      // Should not throw error despite display name failure
    });
  });

  describe('generateUniqueHandle', () => {
    beforeEach(() => {
      // Access private method for testing
      service['generateUniqueHandle'] = service['generateUniqueHandle'];
    });

    it('should generate handle from first name and last name', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);

      const result = await service['generateUniqueHandle'](mockUser);

      expect(result).toBe('john.smith');
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenCalledWith('john.smith');
    });

    it('should try numbered variants if first choice is taken', async () => {
      mockGlobalValidationService.isMatrixHandleUnique
        .mockResolvedValueOnce(false) // john.smith taken
        .mockResolvedValueOnce(true); // john.smith2 available

      const result = await service['generateUniqueHandle'](mockUser);

      expect(result).toBe('john.smith2');
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenNthCalledWith(1, 'john.smith');
      expect(
        mockGlobalValidationService.isMatrixHandleUnique,
      ).toHaveBeenNthCalledWith(2, 'john.smith2');
    });

    it('should try alternative strategies if firstname.lastname is not available', async () => {
      mockGlobalValidationService.isMatrixHandleUnique
        .mockResolvedValueOnce(false) // john.smith taken
        .mockResolvedValueOnce(false) // john.smith2 taken
        .mockResolvedValueOnce(false) // john.smith3 taken (... up to 999)
        .mockImplementation((handle: string) => {
          // All john.smith variants taken, but johnsmith is available
          if (handle.startsWith('johnsmith') && !handle.includes('.')) {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        });

      const result = await service['generateUniqueHandle'](mockUser);

      expect(result).toBe('johnsmith');
    });

    it('should use email username if name-based handles are not available', async () => {
      const userWithEmail = {
        firstName: null,
        lastName: null,
        email: 'johndoe@example.com',
        slug: 'some-slug',
      };

      mockGlobalValidationService.isMatrixHandleUnique.mockImplementation(
        (handle: string) => {
          return Promise.resolve(handle === 'johndoe');
        },
      );

      const result = await service['generateUniqueHandle'](userWithEmail);

      expect(result).toBe('johndoe');
    });

    it('should use slug as fallback', async () => {
      const userWithSlug = {
        firstName: null,
        lastName: null,
        email: null,
        slug: 'unique-slug',
      };

      mockGlobalValidationService.isMatrixHandleUnique.mockImplementation(
        (handle: string) => {
          return Promise.resolve(handle === 'unique-slug');
        },
      );

      const result = await service['generateUniqueHandle'](userWithSlug);

      expect(result).toBe('unique-slug');
    });

    it('should generate random handle as last resort', async () => {
      const userWithNoInfo = {
        firstName: null,
        lastName: null,
        email: null,
        slug: null,
      };

      mockGlobalValidationService.isMatrixHandleUnique.mockImplementation(
        (handle: string) => {
          return Promise.resolve(
            handle.startsWith('user') && handle.length > 4,
          );
        },
      );

      const result = await service['generateUniqueHandle'](userWithNoInfo);

      expect(result).toMatch(/^user[a-z0-9]+$/);
      expect(result.length).toBeGreaterThan(4);
    });

    it('should throw error if no unique handle can be generated', async () => {
      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(false);

      await expect(service['generateUniqueHandle'](mockUser)).rejects.toThrow(
        'Unable to generate a unique Matrix handle',
      );
    });

    it('should clean invalid characters from names', async () => {
      const userWithSpecialChars = {
        firstName: 'John@#$',
        lastName: 'Smith!%^',
        email: 'john@example.com',
        slug: 'slug',
      };

      mockGlobalValidationService.isMatrixHandleUnique.mockResolvedValue(true);

      const result =
        await service['generateUniqueHandle'](userWithSpecialChars);

      expect(result).toBe('john.smith');
    });
  });

  describe('static methods', () => {
    describe('generateDisplayName', () => {
      it('should generate display name from first and last name', () => {
        const result = MatrixUserService.generateDisplayName({
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        });

        expect(result).toBe('John Smith');
      });

      it('should use email username if no name available', () => {
        const result = MatrixUserService.generateDisplayName({
          firstName: null,
          lastName: null,
          email: 'john.doe@example.com',
        });

        expect(result).toBe('john.doe');
      });

      it('should use slug as fallback', () => {
        const result = MatrixUserService.generateDisplayName({
          firstName: null,
          lastName: null,
          email: null,
          slug: 'user-slug',
        });

        expect(result).toBe('user-slug');
      });

      it('should use default name if nothing available', () => {
        const result = MatrixUserService.generateDisplayName({
          firstName: null,
          lastName: null,
          email: null,
        });

        expect(result).toBe('OpenMeet User');
      });

      it('should handle partial names', () => {
        const result1 = MatrixUserService.generateDisplayName({
          firstName: 'John',
          lastName: null,
          email: 'john@example.com',
        });

        const result2 = MatrixUserService.generateDisplayName({
          firstName: null,
          lastName: 'Smith',
          email: 'john@example.com',
        });

        expect(result1).toBe('John');
        expect(result2).toBe('Smith');
      });
    });

    describe('generateMatrixPassword', () => {
      it('should generate a password', () => {
        const password = MatrixUserService.generateMatrixPassword();

        expect(password).toBeDefined();
        expect(typeof password).toBe('string');
        expect(password.length).toBeGreaterThan(10);
      });

      it('should generate different passwords', () => {
        const password1 = MatrixUserService.generateMatrixPassword();
        const password2 = MatrixUserService.generateMatrixPassword();

        expect(password1).not.toBe(password2);
      });
    });

    describe('generateMatrixUsername (legacy)', () => {
      it('should generate username with tenant ID', () => {
        const result = MatrixUserService.generateMatrixUsername(
          { slug: 'john-smith' },
          'tenant123',
        );

        expect(result).toBe('john-smith_tenant123');
      });

      it('should generate username without tenant ID', () => {
        const result = MatrixUserService.generateMatrixUsername({
          slug: 'john-smith',
        });

        expect(result).toBe('john-smith');
      });
    });
  });
});
