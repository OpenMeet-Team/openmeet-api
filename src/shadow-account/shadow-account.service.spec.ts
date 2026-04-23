import { Test, TestingModule } from '@nestjs/testing';
import { ShadowAccountService } from './shadow-account.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { Repository } from 'typeorm';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';

describe('ShadowAccountService', () => {
  let service: ShadowAccountService;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let userRepository: jest.Mocked<Repository<UserEntity>>;
  let atprotoIdentityRepository: jest.Mocked<
    Repository<UserAtprotoIdentityEntity>
  >;
  let blueskyIdentityService: jest.Mocked<BlueskyIdentityService>;

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

    atprotoIdentityRepository = {
      findOne: jest.fn(),
    } as any;

    tenantService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockTenantConnection),
    } as any;

    blueskyIdentityService = {
      extractHandleFromDid: jest.fn(),
      resolveProfile: jest.fn(),
    } as any;

    mockTenantConnection.getRepository.mockImplementation((entity: any) => {
      if (entity === UserAtprotoIdentityEntity) {
        return atprotoIdentityRepository;
      }
      return userRepository;
    });
    mockTenantConnection.createQueryRunner.mockReturnValue(mockQueryRunner);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShadowAccountService,
        {
          provide: TenantConnectionService,
          useValue: tenantService,
        },
        {
          provide: BlueskyIdentityService,
          useValue: blueskyIdentityService,
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
        },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    it('should return existing real user instead of creating shadow account', async () => {
      // Arrange
      const mockRealUser = {
        ...mockUser,
        id: 2,
        email: 'real@user.com',
        isShadowAccount: false,
      } as UserEntity;
      userRepository.findOne.mockResolvedValue(mockRealUser);

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
        },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(result).toEqual(mockRealUser);
      expect(result.isShadowAccount).toBe(false);
    });

    it('should return real user found via userAtprotoIdentities when socialId does not match', async () => {
      // Arrange: socialId lookup returns nothing
      userRepository.findOne.mockResolvedValue(null);

      // But the DID exists in userAtprotoIdentities, linked to a real user
      const mockRealUser = {
        id: 5,
        ulid: 'user456',
        email: 'realuser@example.com',
        firstName: 'Real',
        isShadowAccount: false,
        provider: AuthProvidersEnum.google,
      } as UserEntity;

      atprotoIdentityRepository.findOne.mockResolvedValue({
        id: 1,
        did: 'did:plc:realuser123',
        userUlid: 'user456',
        handle: 'realuser.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        pdsCredentials: null,
        isCustodial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: mockRealUser,
      } as UserAtprotoIdentityEntity);

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:realuser123',
        'realuser.opnmt.me',
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert: should return the real user, NOT create a shadow account
      expect(result).toEqual(mockRealUser);
      expect(result.isShadowAccount).toBe(false);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(atprotoIdentityRepository.findOne).toHaveBeenCalledWith({
        where: { did: 'did:plc:realuser123' },
        relations: ['user'],
      });
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

    it('should resolve DID to handle when creating Bluesky shadow account with DID as displayName', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );
      blueskyIdentityService.extractHandleFromDid.mockResolvedValue(
        'alice.bsky.social',
      );

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:abc123xyz',
        'did:plc:abc123xyz', // displayName is also a DID (needs resolution)
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(blueskyIdentityService.extractHandleFromDid).toHaveBeenCalledWith(
        'did:plc:abc123xyz',
      );
      expect(result.firstName).toEqual('alice.bsky.social'); // ✅ Should be handle, not DID
      expect(result.socialId).toEqual('did:plc:abc123xyz'); // ✅ DID stored in socialId
      expect(result.provider).toEqual(AuthProvidersEnum.bluesky);
      expect(result.isShadowAccount).toBe(true);
    });

    it('should update preferences.bluesky.handle with resolved handle when DID was passed in preferences', async () => {
      // This test catches the bug where preferences.bluesky.handle contained the DID
      // instead of the resolved handle, while firstName was correctly set to the handle.
      // Simulates the flow from rsvp-integration.service.ts when userHandle is a DID.
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );
      blueskyIdentityService.extractHandleFromDid.mockResolvedValue(
        'schuman.de',
      );

      // This is what rsvp-integration.service.ts passes when userHandle is a DID
      const preferencesWithDidAsHandle = {
        bluesky: {
          did: 'did:plc:xo7zswqvg5vhhicuj5faubvi',
          handle: 'did:plc:xo7zswqvg5vhhicuj5faubvi', // Bug: DID passed as handle
        },
      };

      const result = await service.findOrCreateShadowAccount(
        'did:plc:xo7zswqvg5vhhicuj5faubvi',
        'did:plc:xo7zswqvg5vhhicuj5faubvi', // DID passed as displayName
        AuthProvidersEnum.bluesky,
        'tenant1',
        preferencesWithDidAsHandle,
      );

      // Assert: Both firstName AND preferences.bluesky.handle should have the resolved handle
      expect(result.firstName).toEqual('schuman.de'); // firstName is correctly resolved
      expect(result.preferences?.bluesky?.handle).toEqual('schuman.de'); // preferences.bluesky.handle should ALSO be resolved
      expect(result.preferences?.bluesky?.handle).not.toEqual(
        'did:plc:xo7zswqvg5vhhicuj5faubvi',
      ); // Should NOT contain DID
      expect(result.preferences?.bluesky?.did).toEqual(
        'did:plc:xo7zswqvg5vhhicuj5faubvi',
      ); // DID should stay in did field
    });

    it('should ensure preferences.bluesky.handle matches firstName when handle is provided', async () => {
      // Test consistency: when a handle is provided, both firstName and preferences.bluesky.handle
      // should contain the same value
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );

      // Handle provided correctly in both displayName and preferences
      const result = await service.findOrCreateShadowAccount(
        'did:plc:abc123xyz',
        'alice.bsky.social', // Handle provided
        AuthProvidersEnum.bluesky,
        'tenant1',
        {
          bluesky: {
            did: 'did:plc:abc123xyz',
            handle: 'alice.bsky.social', // Handle provided correctly
          },
        },
      );

      // Assert: firstName and preferences.bluesky.handle should be consistent
      expect(result.firstName).toEqual('alice.bsky.social');
      expect(result.preferences?.bluesky?.handle).toEqual('alice.bsky.social');
      expect(result.preferences?.bluesky?.handle).toEqual(result.firstName); // Consistency check
    });

    it('should use displayName if it is already a handle (not a DID)', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:abc123xyz',
        'alice.bsky.social', // displayName is already a handle
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(
        blueskyIdentityService.extractHandleFromDid,
      ).not.toHaveBeenCalled(); // ✅ No need to resolve
      expect(result.firstName).toEqual('alice.bsky.social');
      expect(result.socialId).toEqual('did:plc:abc123xyz');
    });

    it('should fallback to DID if handle resolution fails', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );
      blueskyIdentityService.extractHandleFromDid.mockRejectedValue(
        new Error('Network timeout'),
      );

      // Act
      const result = await service.findOrCreateShadowAccount(
        'did:plc:abc123xyz',
        'did:plc:abc123xyz', // displayName is a DID
        AuthProvidersEnum.bluesky,
        'tenant1',
      );

      // Assert
      expect(blueskyIdentityService.extractHandleFromDid).toHaveBeenCalledWith(
        'did:plc:abc123xyz',
      );
      expect(result.firstName).toEqual('did:plc:abc123xyz'); // ✅ Fallback to DID
      expect(result.socialId).toEqual('did:plc:abc123xyz');
      expect(result.isShadowAccount).toBe(true);
    });

    it('should not attempt handle resolution for non-Bluesky providers', async () => {
      // Arrange
      userRepository.findOne.mockResolvedValue(null);
      userRepository.save.mockImplementation((entity) =>
        Promise.resolve({
          ...entity,
          id: 1,
        } as UserEntity),
      );

      // Act
      const result = await service.findOrCreateShadowAccount(
        'matrix-user-id-123',
        'matrixuser',
        AuthProvidersEnum.email, // Non-Bluesky provider
        'tenant1',
      );

      // Assert
      expect(
        blueskyIdentityService.extractHandleFromDid,
      ).not.toHaveBeenCalled(); // ✅ No resolution for non-Bluesky
      expect(result.firstName).toEqual('matrixuser');
      expect(result.socialId).toEqual('matrix-user-id-123');
      expect(result.provider).toEqual(AuthProvidersEnum.email);
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
