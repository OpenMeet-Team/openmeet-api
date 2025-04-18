import { Test, TestingModule } from '@nestjs/testing';
import { ShadowAccountService } from './shadow-account.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { Repository } from 'typeorm';

describe('ShadowAccountService', () => {
  let service: ShadowAccountService;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let userRepository: jest.Mocked<Repository<UserEntity>>;

  const mockTenantConnection = {
    getRepository: jest.fn(),
    createQueryRunner: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      query: jest.fn(),
      remove: jest.fn(),
    },
  };

  const mockUser = {
    id: 1,
    ulid: 'user123',
    firstName: 'testuser',
    socialId: 'did:plc:1234',
    provider: AuthProvidersEnum.bluesky,
    isShadowAccount: true,
    slug: 'testuser-abc123',
    preferences: {
      bluesky: {
        did: 'did:plc:1234',
        handle: 'testuser',
        connected: false,
      },
    },
  } as UserEntity;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup mocks
    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    } as any;

    tenantService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockTenantConnection),
    } as any;

    mockTenantConnection.getRepository.mockReturnValue(userRepository);
    mockTenantConnection.createQueryRunner.mockReturnValue(mockQueryRunner);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShadowAccountService,
        {
          provide: TenantConnectionService,
          useValue: tenantService,
        },
      ],
    }).compile();

    service = module.get<ShadowAccountService>(ShadowAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateShadowAccount', () => {
    it('should return existing shadow account if found', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:1234',
        'testuser',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: {
          socialId: 'did:plc:1234',
          provider: AuthProvidersEnum.bluesky,
          isShadowAccount: true,
        },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    it('should create a new shadow account if not found', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );

      // Mock Date.now() to have consistent values for testing
      jest.spyOn(Date, 'now').mockImplementation(() => 1625097600000); // 2021-07-01

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:1234',
        'testuser',
        AuthProvidersEnum.bluesky,
        'tenant1',
        {
          bluesky: {
            did: 'did:plc:1234',
            handle: 'testuser',
            connected: false,
          },
        },
      );

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: {
          socialId: 'did:plc:1234',
          provider: AuthProvidersEnum.bluesky,
          isShadowAccount: true,
        },
      });
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.socialId).toEqual('did:plc:1234');
      expect(result.firstName).toEqual('testuser');
      expect(result.provider).toEqual(AuthProvidersEnum.bluesky);
      expect(result.isShadowAccount).toBe(true);
      expect(result.preferences).toEqual({
        bluesky: {
          did: 'did:plc:1234',
          handle: 'testuser',
          connected: false,
        },
      });
    });
  });

  describe('claimShadowAccount', () => {
    const mockRealUser = {
      id: 2,
      email: 'real@user.com',
    } as UserEntity;

    it('should return null if shadow account is not found', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValueOnce(null);

      // Act
      const result = await service.claimShadowAccount(
        2,
        'did:plc:1234',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(result).toBeNull();
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should successfully claim a shadow account', async () => {
      // Arrange
      userRepository.findOne
        .mockResolvedValueOnce(mockUser) // First call for shadow user
        .mockResolvedValueOnce(mockRealUser); // Second call for real user

      // Act
      const result = await service.claimShadowAccount(
        2,
        'did:plc:1234',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.query).toHaveBeenCalledWith(
        `UPDATE events SET "userId" = $1 WHERE "userId" = $2`,
        [2, 1],
      );
      expect(mockQueryRunner.manager.remove).toHaveBeenCalledWith(mockUser);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toEqual(mockRealUser);
    });

    it('should roll back transaction if error occurs during claiming', async () => {
      // Arrange
      userRepository.findOne
        .mockResolvedValueOnce(mockUser) // First call for shadow user
        .mockResolvedValueOnce(mockRealUser); // Second call for real user

      // Mock an error during ownership transfer
      mockQueryRunner.manager.query.mockRejectedValue(
        new Error('Database error'),
      );

      // Act & Assert
      await expect(
        service.claimShadowAccount(
          2,
          'did:plc:1234',
          AuthProvidersEnum.bluesky,
          'tenant1',
        ),
      ).rejects.toThrow('Database error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('findAllShadowAccounts', () => {
    it('should return all shadow accounts for a tenant', async () => {
      // Arrange
      userRepository.find.mockResolvedValue([mockUser]);

      // Act
      const result = await service.findAllShadowAccounts('tenant1');

      // Assert
      expect(userRepository.find).toHaveBeenCalledWith({
        where: {
          isShadowAccount: true,
        },
        order: {
          createdAt: 'DESC',
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
    });
  });

  describe('findShadowAccountsByProvider', () => {
    it('should return shadow accounts filtered by provider', async () => {
      // Arrange
      const provider = AuthProvidersEnum.bluesky;
      userRepository.find.mockResolvedValue([mockUser]);

      // Act
      const result = await service.findShadowAccountsByProvider(
        provider,
        'tenant1',
      );

      // Assert
      expect(userRepository.find).toHaveBeenCalledWith({
        where: {
          isShadowAccount: true,
          provider: provider,
        },
        order: {
          createdAt: 'DESC',
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe(AuthProvidersEnum.bluesky);
    });
  });

  describe('findShadowAccountByExternalId', () => {
    it('should return a shadow account by external ID if found', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findShadowAccountByExternalId(
        'did:plc:1234',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: {
          socialId: 'did:plc:1234',
          provider: AuthProvidersEnum.bluesky,
          isShadowAccount: true,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null if shadow account is not found', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findShadowAccountByExternalId(
        'did:plc:nonexistent',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(result).toBeNull();
    });
  });
});
