import { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { UserService } from './user.service';
import {
  mockFilesS3PresignedService,
  mockMailService,
  mockRepository,
  mockRole,
  mockRoleService,
  mockSubCategory,
  mockSubCategoryService,
  mockUser,
} from '../test/mocks';
import { MailService } from '../mail/mail.service';
import { mockTenantConnectionService } from '../test/mocks';
import { TenantConnectionService } from '../tenant/tenant.service';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { RoleService } from '../role/role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { GlobalMatrixValidationService } from '../matrix/services/global-matrix-validation.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { StatusEnum } from '../status/status.enum';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';

describe('UserService', () => {
  let userService: UserService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: SubCategoryService,
          useValue: mockSubCategoryService,
        },
        {
          provide: RoleService,
          useValue: mockRoleService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            getMatrixHandleForUser: jest.fn(),
            getUserByMatrixHandle: jest.fn(),
            isMatrixHandleUnique: jest.fn(),
            registerMatrixHandle: jest.fn(),
            unregisterMatrixHandle: jest.fn(),
            suggestAvailableHandles: jest.fn(),
          },
        },
        {
          provide: BlueskyIdentityService,
          useValue: {
            resolveProfile: jest.fn().mockResolvedValue({
              handle: 'vlad.sitalo.org',
              did: 'did:plc:tbhegjbdy7fabqewbby5nbf3',
            }),
            extractHandleFromDid: jest
              .fn()
              .mockResolvedValue('vlad.sitalo.org'),
            resolveHandleToDid: jest.fn(),
          },
        },
        {
          provide: AtprotoHandleCacheService,
          useValue: {
            resolveHandle: jest.fn().mockResolvedValue('vlad.sitalo.org'),
            resolveHandles: jest.fn(),
            invalidate: jest.fn(),
          },
        },
        {
          provide: UserAtprotoIdentityService,
          useValue: {
            findByUserUlid: jest.fn().mockResolvedValue(null),
            findByDid: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            deleteByUserUlid: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    userService = await module.resolve<UserService>(UserService);
  });

  describe('create', () => {
    it('should create a user', async () => {
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);
      const user = await userService.create({
        email: 'test@test.com',
        firstName: 'test',
        lastName: 'test',
        role: mockRole.id,
        subCategories: [mockSubCategory.id],
      });
      expect(user).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should find all users', async () => {
      jest.spyOn(userService, 'findAll').mockResolvedValue([mockUser]);
      const users = await userService.findAll();
      expect(users).toBeDefined();
    });
  });

  describe('findManyWithPagination', () => {
    it('should find many users with pagination', async () => {
      const users = await userService.findManyWithPagination({
        paginationOptions: {
          page: 1,
          limit: 10,
        },
      });
      expect(users).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find a user by id', async () => {
      jest.spyOn(userService, 'findById').mockResolvedValue(mockUser);
      const user = await userService.findById(mockUser.id);
      expect(user).toBeDefined();
    });
  });

  describe('findByUlid', () => {
    it('should find a user by ulid', async () => {
      jest.spyOn(userService, 'findByUlid').mockResolvedValue(mockUser);
      const user = await userService.findByUlid('test');
      expect(user).toBeDefined();
    });
  });

  describe('findBySocialIdAndProvider', () => {
    it('should find a user by social id and provider', async () => {
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUser);
      const user = await userService.findBySocialIdAndProvider({
        socialId: 'test',
        provider: 'test',
      });
      expect(user).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      jest.spyOn(userService, 'update').mockResolvedValue(mockUser);
      const user = await userService.update(mockUser.id, {
        firstName: 'John',
      });
      expect(user).toBeDefined();
    });
  });

  describe('remove', () => {
    let mockGlobalMatrixService: jest.Mocked<GlobalMatrixValidationService>;
    let mockUsersRepository: any;

    beforeEach(() => {
      // Get the mocked services from the test module
      mockGlobalMatrixService = module.get(GlobalMatrixValidationService);
      mockUsersRepository = module.get(Repository);
    });

    it('should remove a user and clean up Matrix handle', async () => {
      // Mock the repository methods for hard delete
      mockUsersRepository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      // Mock group repository (no groups owned)
      const mockGroupRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      // Mock event repository
      const mockEventRepository = {
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      // Create mock transactional entity manager
      const mockTransactionalEntityManager = {
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity.name === 'GroupEntity') return mockGroupRepository;
          if (entity.name === 'EventEntity') return mockEventRepository;
          if (entity.name === 'UserEntity') return mockUsersRepository;
          return mockUsersRepository;
        }),
        query: jest.fn().mockResolvedValue([]),
      };

      // Mock data source with transaction support
      const mockDataSource = {
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(mockTransactionalEntityManager);
        }),
      };

      // Override getTenantSpecificRepository to set up our mocks
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockImplementation(async () => {
          (userService as any).usersRepository = mockUsersRepository;
          (userService as any).groupRepository = mockGroupRepository;
          (userService as any).eventRepository = mockEventRepository;
          (userService as any).dataSource = mockDataSource;
        });

      // Mock Matrix cleanup
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      // Call remove
      await userService.remove(mockUser.id);

      // Verify Matrix cleanup was called with correct parameters
      expect(
        mockGlobalMatrixService.unregisterMatrixHandle,
      ).toHaveBeenCalledWith(TESTING_TENANT_ID, mockUser.id);

      // Verify user was hard deleted
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should still remove user even if Matrix cleanup fails', async () => {
      // Mock the repository methods for hard delete
      mockUsersRepository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      // Mock group repository (no groups owned)
      const mockGroupRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      // Mock event repository
      const mockEventRepository = {
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      // Create mock transactional entity manager
      const mockTransactionalEntityManager = {
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity.name === 'GroupEntity') return mockGroupRepository;
          if (entity.name === 'EventEntity') return mockEventRepository;
          if (entity.name === 'UserEntity') return mockUsersRepository;
          return mockUsersRepository;
        }),
        query: jest.fn().mockResolvedValue([]),
      };

      // Mock data source with transaction support
      const mockDataSource = {
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(mockTransactionalEntityManager);
        }),
      };

      // Override getTenantSpecificRepository to set up our mocks
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockImplementation(async () => {
          (userService as any).usersRepository = mockUsersRepository;
          (userService as any).groupRepository = mockGroupRepository;
          (userService as any).eventRepository = mockEventRepository;
          (userService as any).dataSource = mockDataSource;
        });

      // Mock Matrix cleanup to fail
      mockGlobalMatrixService.unregisterMatrixHandle.mockRejectedValue(
        new Error('Matrix service unavailable'),
      );

      // Call remove - should not throw
      await expect(userService.remove(mockUser.id)).resolves.toBeUndefined();

      // Verify user was still hard deleted despite Matrix failure
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('getMailServiceUserById', () => {
    it('should return a user by id', async () => {
      jest
        .spyOn(userService, 'getMailServiceUserById')
        .mockResolvedValue(mockUser);
      const user = await userService.getMailServiceUserById(mockUser.id);
      expect(user).toBeDefined();
    });

    it('should throw an error if the user is not found', async () => {
      await expect(
        userService.getMailServiceUserById(mockUser.id),
      ).rejects.toThrow();
    });
  });

  describe('getUserBySlug', () => {
    it('should return a user by slug', async () => {
      jest.spyOn(userService, 'getUserBySlug').mockResolvedValue(mockUser);
      const user = await userService.getUserBySlug(mockUser.slug);
      expect(user).toBeDefined();
    });

    it('should throw an error if the user is not found', async () => {
      await expect(userService.getUserBySlug(mockUser.slug)).rejects.toThrow();
    });
  });

  describe('getUserById', () => {
    it('should return a user by id', async () => {
      jest.spyOn(userService, 'getUserById').mockResolvedValue(mockUser);
      const user = await userService.getUserById(mockUser.id);
      expect(user).toBeDefined();
    });

    it('should throw an error if the user is not found', async () => {
      await expect(userService.getUserById(mockUser.id)).rejects.toThrow();
    });
  });

  describe('findOrCreateUser - Bluesky DID Storage', () => {
    it('should store only the DID, not the handle (handle is resolved from DID)', async () => {
      // Arrange: Profile data from Bluesky auth
      const blueskyProfile = {
        id: 'did:plc:tbhegjbdy7fabqewbby5nbf3',
        firstName: 'Vlad Sitalo', // This is the display name
        lastName: '',
        email: 'vlad@sitalo.org',
        handle: 'vlad.sitalo.org', // This is the actual Bluesky handle
      };

      const expectedUser = {
        ...mockUser,
        id: 262,
        socialId: 'did:plc:tbhegjbdy7fabqewbby5nbf3',
        provider: 'bluesky',
        firstName: 'Vlad Sitalo',
        email: 'vlad@sitalo.org',
        preferences: {
          bluesky: {
            did: 'did:plc:tbhegjbdy7fabqewbby5nbf3',
            // No handle stored - it's resolved from DID when needed
            connected: true,
            autoPost: false,
            connectedAt: expect.any(Date),
          },
        },
      };

      // Mock findBySocialIdAndProvider to return null (new user)
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Spy on create to capture what data is passed
      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(expectedUser as any);

      // Act
      await userService.findOrCreateUser(
        blueskyProfile,
        'bluesky',
        TESTING_TENANT_ID,
      );

      // Assert - verify create was called with correct Bluesky preferences
      expect(createSpy).toHaveBeenCalled();
      const createCallArgs = createSpy.mock.calls[0][0];

      // Verify DID is stored
      expect(createCallArgs.preferences.bluesky.did).toBe(
        'did:plc:tbhegjbdy7fabqewbby5nbf3',
      );

      // Verify handle is NOT stored (should be undefined)
      expect(createCallArgs.preferences.bluesky.handle).toBeUndefined();
    });
  });

  describe('findOrCreateUser - Quick RSVP Account Merge', () => {
    it('should merge Quick RSVP account when Google user logs in with matching email', async () => {
      const email = 'john@example.com';

      // Arrange: Existing Quick RSVP user (passwordless, INACTIVE)
      const existingQuickRsvpUser = {
        id: 123,
        email,
        firstName: 'John',
        lastName: 'Doe',
        provider: AuthProvidersEnum.email,
        socialId: null,
        password: null, // No password = Quick RSVP account
        status: { id: StatusEnum.inactive },
        role: mockRole,
        preferences: {},
      };

      // Arrange: Google OAuth profile with same email
      const googleProfile = {
        id: 'google-oauth-id-123',
        email,
        firstName: 'John',
        lastName: 'Doe',
      };

      // Mock: findBySocialIdAndProvider returns null (no Google account yet)
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Mock: findByEmail returns existing Quick RSVP account
      jest
        .spyOn(userService, 'findByEmail')
        .mockResolvedValue(existingQuickRsvpUser as any);

      // Mock: update method to simulate the merge
      const mergedUser = {
        ...existingQuickRsvpUser,
        provider: AuthProvidersEnum.google,
        socialId: 'google-oauth-id-123',
        status: { id: StatusEnum.active }, // Activated during merge
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(mergedUser as any);

      // Mock: getTenantSpecificRepository (required by the method)
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act: User logs in with Google OAuth
      const result = await userService.findOrCreateUser(
        googleProfile,
        AuthProvidersEnum.google,
        TESTING_TENANT_ID,
      );

      // Assert: Account was merged (updated, not created)
      expect(updateSpy).toHaveBeenCalledWith(
        123, // Quick RSVP user ID
        expect.objectContaining({
          provider: AuthProvidersEnum.google,
          socialId: 'google-oauth-id-123',
        }),
        TESTING_TENANT_ID,
      );

      // Assert: User is now a Google account
      expect(result.provider).toBe(AuthProvidersEnum.google);
      expect(result.socialId).toBe('google-oauth-id-123');

      // Assert: Original user ID preserved (RSVPs intact)
      expect(result.id).toBe(123);
    });

    it('should merge Quick RSVP account when Bluesky user logs in with matching email', async () => {
      const email = 'jane@example.com';

      // Arrange: Existing Quick RSVP user (passwordless, INACTIVE)
      const existingQuickRsvpUser = {
        id: 456,
        email,
        firstName: 'Jane',
        lastName: 'Smith',
        provider: AuthProvidersEnum.email,
        socialId: null,
        password: null, // No password = Quick RSVP account
        status: { id: StatusEnum.inactive },
        role: mockRole,
        preferences: {},
      };

      // Arrange: Bluesky OAuth profile with same email
      const blueskyProfile = {
        id: 'did:plc:abc123def456',
        email,
        firstName: 'Jane',
        lastName: 'Smith',
      };

      // Mock: findBySocialIdAndProvider returns null (no Bluesky account yet)
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Mock: findByEmail returns existing Quick RSVP account
      jest
        .spyOn(userService, 'findByEmail')
        .mockResolvedValue(existingQuickRsvpUser as any);

      // Mock: update method to simulate the merge with Bluesky preferences
      const mergedUser = {
        ...existingQuickRsvpUser,
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:abc123def456',
        status: { id: StatusEnum.active },
        preferences: {
          bluesky: {
            did: 'did:plc:abc123def456',
            connected: true,
            autoPost: false,
            connectedAt: expect.any(Date),
          },
        },
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(mergedUser as any);

      // Mock: getTenantSpecificRepository
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act: User logs in with Bluesky OAuth
      const result = await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: Account was merged with Bluesky preferences
      expect(updateSpy).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          provider: AuthProvidersEnum.bluesky,
          socialId: 'did:plc:abc123def456',
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              did: 'did:plc:abc123def456',
              connected: true,
              autoPost: false,
            }),
          }),
        }),
        TESTING_TENANT_ID,
      );

      // Assert: User is now a Bluesky account
      expect(result.provider).toBe(AuthProvidersEnum.bluesky);
      expect(result.socialId).toBe('did:plc:abc123def456');
    });

    it('should NOT merge Quick RSVP account that has a password', async () => {
      const email = 'user@example.com';

      // Arrange: Existing user with PASSWORD (regular registration, not Quick RSVP)
      const existingPasswordUser = {
        id: 789,
        email,
        firstName: 'User',
        lastName: 'WithPassword',
        provider: AuthProvidersEnum.email,
        socialId: null,
        password: 'hashed-password-here', // HAS password = NOT Quick RSVP
        status: { id: StatusEnum.active },
        role: mockRole,
      };

      const googleProfile = {
        id: 'google-oauth-id-789',
        email,
        firstName: 'User',
        lastName: 'WithPassword',
      };

      // Mock: findBySocialIdAndProvider returns null
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Mock: findByEmail returns existing user WITH password
      jest
        .spyOn(userService, 'findByEmail')
        .mockResolvedValue(existingPasswordUser as any);

      const updateSpy = jest.spyOn(userService, 'update');

      // Mock: getTenantSpecificRepository
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act & Assert: Should throw error (email already exists with password)
      await expect(
        userService.findOrCreateUser(
          googleProfile,
          AuthProvidersEnum.google,
          TESTING_TENANT_ID,
        ),
      ).rejects.toThrow();

      // Assert: No merge attempted (user has password, so it's a regular account)
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should create new social account if no Quick RSVP account exists', async () => {
      const email = 'newuser@example.com';

      const googleProfile = {
        id: 'google-oauth-new-123',
        email,
        firstName: 'New',
        lastName: 'User',
      };

      // Mock: No existing user found
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      // Mock: create method
      const newUser = {
        id: 999,
        email,
        firstName: 'New',
        lastName: 'User',
        provider: AuthProvidersEnum.google,
        socialId: 'google-oauth-new-123',
        status: { id: StatusEnum.active },
        role: mockRole,
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      // Mock: getTenantSpecificRepository
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act: New user logs in with Google
      const result = await userService.findOrCreateUser(
        googleProfile,
        AuthProvidersEnum.google,
        TESTING_TENANT_ID,
      );

      // Assert: New account created (not merged)
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: AuthProvidersEnum.google,
          socialId: 'google-oauth-new-123',
          email,
          status: expect.objectContaining({
            id: StatusEnum.active,
          }),
        }),
        TESTING_TENANT_ID,
      );

      expect(result.provider).toBe(AuthProvidersEnum.google);
    });
  });

  describe('findOrCreateUser - Email Handling from OAuth', () => {
    it('should update existing Bluesky user email when OAuth provides email but user has none', async () => {
      const did = 'did:plc:test123';
      const email = 'newlyretrieved@example.com';

      // Arrange: Existing Bluesky user WITHOUT email
      const existingUserNoEmail = {
        id: 111,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: null, // No email previously
        firstName: 'Test',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      // Arrange: Bluesky OAuth profile WITH email
      const blueskyProfileWithEmail = {
        id: did,
        email, // Email now provided by OAuth
        firstName: 'Test',
        lastName: 'User',
      };

      // Mock: findBySocialIdAndProvider returns existing user without email
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserNoEmail as any);

      // Mock: update method to simulate email update
      const updatedUser = {
        ...existingUserNoEmail,
        email,
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      // Mock: getTenantSpecificRepository
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act: User logs in with Bluesky OAuth that now provides email
      const result = await userService.findOrCreateUser(
        blueskyProfileWithEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: Email was updated
      expect(updateSpy).toHaveBeenCalledWith(111, { email }, TESTING_TENANT_ID);

      // Assert: User now has email
      expect(result.email).toBe(email);
    });

    it('should update existing Bluesky user when they had empty string email', async () => {
      const did = 'did:plc:test456';
      const email = 'fresh@example.com';

      // Arrange: Existing user with EMPTY STRING email
      const existingUserEmptyEmail = {
        id: 222,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: '', // Empty string (common for old Bluesky users)
        firstName: 'Another',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileWithEmail = {
        id: did,
        email,
        firstName: 'Another',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserEmptyEmail as any);

      const updatedUser = {
        ...existingUserEmptyEmail,
        email,
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileWithEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: Email was updated
      expect(updateSpy).toHaveBeenCalledWith(222, { email }, TESTING_TENANT_ID);
      expect(result.email).toBe(email);
    });

    it('should update existing Bluesky user when they had "null" string email', async () => {
      const did = 'did:plc:test789';
      const email = 'reallyreal@example.com';

      // Arrange: Existing user with "null" STRING (literal string "null")
      const existingUserNullString = {
        id: 333,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: 'null', // String "null" (possible from API serialization)
        firstName: 'Third',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileWithEmail = {
        id: did,
        email,
        firstName: 'Third',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserNullString as any);

      const updatedUser = {
        ...existingUserNullString,
        email,
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileWithEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: Email was updated
      expect(updateSpy).toHaveBeenCalledWith(333, { email }, TESTING_TENANT_ID);
      expect(result.email).toBe(email);
    });

    it('should NOT update email when existing user already has valid email', async () => {
      const did = 'did:plc:test999';
      const existingEmail = 'already@example.com';
      const newEmail = 'different@example.com';

      // Arrange: User with EXISTING valid email
      const existingUserWithEmail = {
        id: 444,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: existingEmail, // Already has email
        firstName: 'Existing',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileWithDifferentEmail = {
        id: did,
        email: newEmail, // Different email from OAuth
        firstName: 'Existing',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileWithDifferentEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: Email was NOT updated (existing email preserved)
      expect(updateSpy).not.toHaveBeenCalled();
      expect(result.email).toBe(existingEmail);
    });

    it('should handle case when OAuth does not provide email for existing user', async () => {
      const did = 'did:plc:test000';
      const existingEmail = 'existing@example.com';

      // Arrange: User with existing email
      const existingUserWithEmail = {
        id: 555,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: existingEmail,
        firstName: 'User',
        lastName: 'Five',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      // Arrange: OAuth profile WITHOUT email (permissions not granted)
      const blueskyProfileNoEmail = {
        id: did,
        email: undefined, // No email from OAuth
        firstName: 'User',
        lastName: 'Five',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileNoEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: No update attempted
      expect(updateSpy).not.toHaveBeenCalled();

      // Assert: Existing email preserved
      expect(result.email).toBe(existingEmail);
    });

    it('should create new user without email when OAuth does not provide email', async () => {
      const did = 'did:plc:newuser123';

      // Arrange: OAuth profile WITHOUT email
      const blueskyProfileNoEmail = {
        id: did,
        email: undefined, // No email permission granted
        firstName: 'New',
        lastName: 'NoEmail',
      };

      // Mock: No existing user
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      // Mock: create method
      const newUser = {
        id: 666,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: null, // Created without email
        firstName: 'New',
        lastName: 'NoEmail',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileNoEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: User created with null email
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: null,
          socialId: did,
          provider: AuthProvidersEnum.bluesky,
        }),
        TESTING_TENANT_ID,
      );

      expect(result.email).toBeNull();
    });

    it('should create new user with email when OAuth provides email', async () => {
      const did = 'did:plc:newuser456';
      const email = 'brandnew@example.com';

      // Arrange: OAuth profile WITH email
      const blueskyProfileWithEmail = {
        id: did,
        email,
        firstName: 'Brand',
        lastName: 'New',
      };

      // Mock: No existing user
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      // Mock: create method
      const newUser = {
        id: 777,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email,
        firstName: 'Brand',
        lastName: 'New',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      // Act
      const result = await userService.findOrCreateUser(
        blueskyProfileWithEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: User created with email
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          socialId: did,
          provider: AuthProvidersEnum.bluesky,
        }),
        TESTING_TENANT_ID,
      );

      expect(result.email).toBe(email);
    });
  });

  describe('findOrCreateUser - Email Verification Status (emailConfirmed)', () => {
    it('should create new user as INACTIVE when email is unverified (emailConfirmed=false)', async () => {
      const did = 'did:plc:newuser-unverified';
      const email = 'unverified@example.com';

      const blueskyProfile = {
        id: did,
        email,
        emailConfirmed: false, // Email not verified by Bluesky
        firstName: 'New',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      const newUser = {
        id: 888,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email,
        firstName: 'New',
        lastName: 'User',
        role: mockRole,
        status: { id: StatusEnum.inactive }, // INACTIVE due to unverified email
        preferences: {
          bluesky: {
            did,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          status: { id: StatusEnum.inactive },
        }),
        TESTING_TENANT_ID,
      );

      expect(result.status.id).toBe(StatusEnum.inactive);
    });

    it('should create new user as ACTIVE when email is verified (emailConfirmed=true)', async () => {
      const did = 'did:plc:newuser-verified';
      const email = 'verified@example.com';

      const blueskyProfile = {
        id: did,
        email,
        emailConfirmed: true, // Email verified by Bluesky
        firstName: 'Verified',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      const newUser = {
        id: 999,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email,
        firstName: 'Verified',
        lastName: 'User',
        role: mockRole,
        status: { id: StatusEnum.active }, // ACTIVE due to verified email
        preferences: {
          bluesky: {
            did,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          status: { id: StatusEnum.active },
        }),
        TESTING_TENANT_ID,
      );

      expect(result.status.id).toBe(StatusEnum.active);
    });

    it('should create user as INACTIVE when no email provided', async () => {
      const did = 'did:plc:no-email';

      const blueskyProfileNoEmail = {
        id: did,
        email: undefined, // No email
        emailConfirmed: undefined, // No email confirmation status
        firstName: 'No',
        lastName: 'Email',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      const newUser = {
        id: 111,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: null,
        firstName: 'No',
        lastName: 'Email',
        role: mockRole,
        status: { id: StatusEnum.inactive }, // INACTIVE (no email for notifications)
        preferences: {
          bluesky: {
            did,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileNoEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: null,
          status: { id: StatusEnum.inactive },
        }),
        TESTING_TENANT_ID,
      );

      expect(result.status.id).toBe(StatusEnum.inactive);
    });

    it('should set existing ACTIVE user to INACTIVE when updating with unverified email', async () => {
      const did = 'did:plc:existing-active';
      const email = 'unverified-new@example.com';

      const existingActiveUser = {
        id: 123,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: null, // No email initially
        firstName: 'Existing',
        lastName: 'User',
        role: mockRole,
        status: { id: StatusEnum.active }, // Currently ACTIVE
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileUnverified = {
        id: did,
        email,
        emailConfirmed: false, // Unverified email
        firstName: 'Existing',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingActiveUser as any);

      const updatedUser = {
        ...existingActiveUser,
        email,
        status: { id: StatusEnum.inactive }, // Now INACTIVE
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileUnverified,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(updateSpy).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          email,
          status: { id: StatusEnum.inactive },
        }),
        TESTING_TENANT_ID,
      );

      expect(result.status.id).toBe(StatusEnum.inactive);
    });

    it('should set existing INACTIVE user to ACTIVE when updating with verified email', async () => {
      const did = 'did:plc:inactive-to-active';
      const email = 'now-verified@example.com';

      const existingInactiveUser = {
        id: 789,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: null,
        firstName: 'Upgrading',
        lastName: 'User',
        role: mockRole,
        status: { id: StatusEnum.inactive }, // Currently INACTIVE
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileVerified = {
        id: did,
        email,
        emailConfirmed: true, // Verified email
        firstName: 'Upgrading',
        lastName: 'User',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingInactiveUser as any);

      const updatedUser = {
        ...existingInactiveUser,
        email,
        status: { id: StatusEnum.active }, // Now ACTIVE
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileVerified,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(updateSpy).toHaveBeenCalledWith(
        789,
        expect.objectContaining({
          email,
          status: { id: StatusEnum.active },
        }),
        TESTING_TENANT_ID,
      );

      expect(result.status.id).toBe(StatusEnum.active);
    });

    it('should replace existing email with new verified email from OAuth', async () => {
      const did = 'did:plc:email-change';
      const oldEmail = 'old@example.com';
      const newEmail = 'new-verified@example.com';

      const existingUserWithEmail = {
        id: 555,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: oldEmail, // Has existing email
        firstName: 'User',
        lastName: 'WithEmail',
        role: mockRole,
        status: { id: StatusEnum.active },
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileNewVerifiedEmail = {
        id: did,
        email: newEmail, // Different verified email from OAuth
        emailConfirmed: true,
        firstName: 'User',
        lastName: 'WithEmail',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      // Mock findByEmail to return null (no conflict with new email)
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      const updatedUser = {
        ...existingUserWithEmail,
        email: newEmail, // Email replaced
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileNewVerifiedEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      expect(updateSpy).toHaveBeenCalledWith(
        555,
        { email: newEmail },
        TESTING_TENANT_ID,
      );

      expect(result.email).toBe(newEmail);
    });

    it('should NOT replace email when new email conflicts with another account', async () => {
      const did = 'did:plc:email-conflict';
      const oldEmail = 'old@example.com';
      const conflictingEmail = 'conflict@example.com';

      const existingUserWithEmail = {
        id: 777,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: oldEmail,
        firstName: 'User',
        lastName: 'Conflict',
        role: mockRole,
        status: { id: StatusEnum.active },
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileConflictingEmail = {
        id: did,
        email: conflictingEmail, // This email belongs to another account
        emailConfirmed: true,
        firstName: 'User',
        lastName: 'Conflict',
      };

      const conflictingUser = {
        id: 888, // Different user
        email: conflictingEmail,
        provider: AuthProvidersEnum.email,
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      // Mock findByEmail to return conflicting user
      jest
        .spyOn(userService, 'findByEmail')
        .mockResolvedValue(conflictingUser as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileConflictingEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Should NOT call update when email conflicts
      expect(updateSpy).not.toHaveBeenCalled();

      // Should return existing user with old email (not blocked)
      expect(result.email).toBe(oldEmail);
      expect(result.id).toBe(777);
    });

    it('should NOT replace existing email with unverified email from OAuth', async () => {
      const did = 'did:plc:keep-old-email';
      const oldEmail = 'old@example.com';
      const newUnverifiedEmail = 'new-unverified@example.com';

      const existingUserWithEmail = {
        id: 666,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: oldEmail, // Has existing email
        firstName: 'User',
        lastName: 'KeepEmail',
        role: mockRole,
        status: { id: StatusEnum.active },
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileUnverifiedEmail = {
        id: did,
        email: newUnverifiedEmail, // Different but unverified email
        emailConfirmed: false,
        firstName: 'User',
        lastName: 'KeepEmail',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileUnverifiedEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Should NOT update email (unverified)
      expect(updateSpy).not.toHaveBeenCalled();

      // Old email preserved
      expect(result.email).toBe(oldEmail);
    });

    it('should not update when OAuth provides same email', async () => {
      const did = 'did:plc:same-email';
      const email = 'same@example.com';

      const existingUserWithEmail = {
        id: 777,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email, // Same email
        firstName: 'User',
        lastName: 'SameEmail',
        role: mockRole,
        status: { id: StatusEnum.active },
        preferences: {
          bluesky: {
            did,
            connected: true,
          },
        },
      };

      const blueskyProfileSameEmail = {
        id: did,
        email, // Same email
        emailConfirmed: true,
        firstName: 'User',
        lastName: 'SameEmail',
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUserWithEmail as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      const result = await userService.findOrCreateUser(
        blueskyProfileSameEmail,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Should NOT update (email is the same)
      expect(updateSpy).not.toHaveBeenCalled();
      expect(result.email).toBe(email);
    });
  });

  describe('findOrCreateUser - Bluesky Avatar in Preferences', () => {
    it('should store avatar in preferences.bluesky.avatar when creating new Bluesky user', async () => {
      const did = 'did:plc:avatar-test-new';
      const avatarUrl = 'https://cdn.bsky.app/img/avatar/abc123.jpg';

      const blueskyProfile = {
        id: did,
        email: 'avatar@example.com',
        emailConfirmed: true,
        firstName: 'Avatar',
        lastName: 'User',
        avatar: avatarUrl,
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      const newUser = {
        id: 1001,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: 'avatar@example.com',
        firstName: 'Avatar',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            avatar: avatarUrl,
            connected: true,
            autoPost: false,
          },
        },
      };

      const createSpy = jest
        .spyOn(userService, 'create')
        .mockResolvedValue(newUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: avatar should be stored in preferences.bluesky.avatar
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              avatar: avatarUrl,
            }),
          }),
        }),
        TESTING_TENANT_ID,
      );
    });

    it('should update preferences.bluesky.avatar when existing user has different avatar', async () => {
      const did = 'did:plc:existing-user';
      const oldAvatar = 'https://cdn.bsky.app/img/avatar/old.jpg';
      const newAvatar = 'https://cdn.bsky.app/img/avatar/new.jpg';

      const existingUser = {
        id: 1003,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: 'existing@example.com',
        firstName: 'Existing',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            avatar: oldAvatar,
            connected: true,
          },
        },
      };

      const blueskyProfile = {
        id: did,
        email: 'existing@example.com',
        emailConfirmed: true,
        firstName: 'Existing',
        lastName: 'User',
        avatar: newAvatar,
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUser as any);

      const updatedUser = {
        ...existingUser,
        preferences: {
          bluesky: {
            ...existingUser.preferences.bluesky,
            avatar: newAvatar,
          },
        },
      };

      const updateSpy = jest
        .spyOn(userService, 'update')
        .mockResolvedValue(updatedUser as any);

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: preferences should be updated with new avatar
      expect(updateSpy).toHaveBeenCalledWith(
        1003,
        expect.objectContaining({
          preferences: expect.objectContaining({
            bluesky: expect.objectContaining({
              avatar: newAvatar,
            }),
          }),
        }),
        TESTING_TENANT_ID,
      );
    });

    it('should NOT update when existing user has same avatar', async () => {
      const did = 'did:plc:same-avatar';
      const avatarUrl = 'https://cdn.bsky.app/img/avatar/same.jpg';

      const existingUser = {
        id: 1004,
        socialId: did,
        provider: AuthProvidersEnum.bluesky,
        email: 'same@example.com',
        firstName: 'Same',
        lastName: 'User',
        role: mockRole,
        preferences: {
          bluesky: {
            did,
            avatar: avatarUrl, // Same avatar
            connected: true,
          },
        },
      };

      const blueskyProfile = {
        id: did,
        email: 'same@example.com',
        emailConfirmed: true,
        firstName: 'Same',
        lastName: 'User',
        avatar: avatarUrl, // Same avatar
      };

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(existingUser as any);

      const updateSpy = jest.spyOn(userService, 'update');

      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockResolvedValue(undefined);

      await userService.findOrCreateUser(
        blueskyProfile,
        AuthProvidersEnum.bluesky,
        TESTING_TENANT_ID,
      );

      // Assert: update should NOT be called (avatar unchanged)
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('showProfile - Bluesky Handle Resolution', () => {
    // Design: Handles are resolved dynamically for display via AtprotoHandleCacheService.
    // DID is the permanent identifier; handles can change on Bluesky at any time.
    // The cache service provides 15-min Redis caching and handles all fallback logic.
    // See commit c3e042f for rationale.
    let mockUsersRepository: any;
    let mockAtprotoHandleCacheService: jest.Mocked<AtprotoHandleCacheService>;

    beforeEach(() => {
      mockUsersRepository = module.get(Repository);
      mockAtprotoHandleCacheService = module.get(AtprotoHandleCacheService);
    });

    it('should resolve and return updated handle in-memory when Bluesky handle has changed', async () => {
      const did = 'did:plc:tbhegjbdy7fabqewbby5nbf3';
      const oldHandle = 'openmeet.bsky.social';
      const newHandle = 'openmeet.net';

      // Arrange: User with old handle (stale data that would be in database)
      const userWithOldHandle = {
        id: 1,
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle: oldHandle, // Old handle
            connected: true,
          },
        },
        photo: null,
        interests: [],
      };

      // Mock repository findOne to return user with old handle
      mockUsersRepository.findOne = jest
        .fn()
        .mockResolvedValue(userWithOldHandle);

      // Mock manager for the related queries (events, groups, etc.)
      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      // Mock AtprotoHandleCacheService to return NEW handle (current on Bluesky)
      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(newHandle);

      // Mock save method to ensure it's NOT called (we don't persist handles)
      mockUsersRepository.save = jest.fn();

      // Act: Call showProfile
      const result = await userService.showProfile('openmeet-abc123');

      // Assert: Cache service should be called with the DID
      expect(mockAtprotoHandleCacheService.resolveHandle).toHaveBeenCalledWith(
        did,
      );

      // Assert: save should NOT be called (handles are resolved dynamically, not persisted)
      expect(mockUsersRepository.save).not.toHaveBeenCalled();

      // Assert: The returned user should have the new handle for display
      expect(result?.preferences?.bluesky?.handle).toBe(newHandle);
    });

    it('should NOT save to database when handle has not changed', async () => {
      const did = 'did:plc:tbhegjbdy7fabqewbby5nbf3';
      const handle = 'openmeet.net';

      // Arrange: User with same handle in database
      const userWithSameHandle = {
        id: 1,
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle, // Same handle
            connected: true,
          },
        },
        photo: null,
        interests: [],
      };

      mockUsersRepository.findOne = jest
        .fn()
        .mockResolvedValue(userWithSameHandle);

      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      // Mock AtprotoHandleCacheService to return SAME handle
      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(handle);

      mockUsersRepository.save = jest.fn();

      // Act
      await userService.showProfile('openmeet-abc123');

      // Assert: save should NOT be called (no change)
      expect(mockUsersRepository.save).not.toHaveBeenCalled();
    });

    it('should use DID as fallback when handle resolution fails (cache service returns DID)', async () => {
      const did = 'did:plc:tbhegjbdy7fabqewbby5nbf3';
      const oldHandle = 'openmeet.bsky.social';

      // Arrange: User with handle in database
      const userWithHandle = {
        id: 1,
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle: oldHandle,
            connected: true,
          },
        },
        photo: null,
        interests: [],
      };

      mockUsersRepository.findOne = jest.fn().mockResolvedValue(userWithHandle);

      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      // Mock AtprotoHandleCacheService to return DID as fallback (this is what it does on error)
      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(did);

      mockUsersRepository.save = jest.fn();

      // Act
      const result = await userService.showProfile('openmeet-abc123');

      // Assert: save should NOT be called (resolution failed, using DID as fallback)
      expect(mockUsersRepository.save).not.toHaveBeenCalled();

      // Assert: The handle should fall back to DID
      expect(result?.preferences?.bluesky?.handle).toBe(did);
    });

    it('should call cache service only once per showProfile call', async () => {
      const did = 'did:plc:tbhegjbdy7fabqewbby5nbf3';
      const handle = 'openmeet.net';

      // Arrange: User with Bluesky preferences
      const userWithBluesky = {
        id: 1,
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle: 'old.handle.social',
            connected: true,
          },
        },
        photo: null,
        interests: [],
      };

      mockUsersRepository.findOne = jest
        .fn()
        .mockResolvedValue(userWithBluesky);

      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(handle);
      mockUsersRepository.save = jest.fn();

      // Act
      const result = await userService.showProfile('openmeet-abc123');

      // Assert: Cache service called exactly once with the DID
      expect(mockAtprotoHandleCacheService.resolveHandle).toHaveBeenCalledTimes(
        1,
      );
      expect(mockAtprotoHandleCacheService.resolveHandle).toHaveBeenCalledWith(
        did,
      );

      // Assert: Handle is updated in-memory
      expect(result?.preferences?.bluesky?.handle).toBe(handle);
    });
  });

  describe('showProfile - AT Protocol identity-based connected status', () => {
    let mockUsersRepository: any;
    let mockAtprotoHandleCacheService: jest.Mocked<AtprotoHandleCacheService>;
    let mockUserAtprotoIdentityServiceRef: jest.Mocked<UserAtprotoIdentityService>;

    beforeEach(() => {
      mockUsersRepository = module.get(Repository);
      mockAtprotoHandleCacheService = module.get(AtprotoHandleCacheService);
      mockUserAtprotoIdentityServiceRef = module.get(
        UserAtprotoIdentityService,
      );
    });

    it('should set connected=true in socialProfiles when identity exists in identity table', async () => {
      const did = 'did:plc:test-identity-exists';

      // Arrange: User with bluesky preferences (connected=false in preferences, but identity exists)
      const userWithIdentity = {
        id: 1,
        ulid: 'test-ulid-identity',
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle: 'test.user',
            connected: false, // Preferences say false
          },
        },
        photo: null,
        interests: [],
      };

      mockUsersRepository.findOne = jest
        .fn()
        .mockResolvedValue(userWithIdentity);

      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(
        'test.user',
      );
      mockUsersRepository.save = jest.fn();

      // Identity table returns a record
      mockUserAtprotoIdentityServiceRef.findByUserUlid.mockResolvedValue({
        id: 1,
        userUlid: 'test-ulid-identity',
        did,
        handle: 'test.user',
        pdsUrl: 'https://pds.example.com',
      } as any);

      // Act
      const result = await userService.showProfile('openmeet-abc123');

      // Assert: socialProfiles.atprotocol.connected should be true from identity table
      expect(result?.['socialProfiles']?.atprotocol?.connected).toBe(true);
      expect(
        mockUserAtprotoIdentityServiceRef.findByUserUlid,
      ).toHaveBeenCalledWith(TESTING_TENANT_ID, 'test-ulid-identity');
    });

    it('should set connected=false in socialProfiles when no identity exists in identity table', async () => {
      const did = 'did:plc:test-no-identity';

      // Arrange: User with bluesky preferences (connected=true in preferences, but no identity)
      const userWithoutIdentity = {
        id: 1,
        ulid: 'test-ulid-no-identity',
        slug: 'openmeet-abc123',
        firstName: 'OpenMeet',
        isShadowAccount: false,
        preferences: {
          bluesky: {
            did,
            handle: 'test.user',
            connected: true, // Preferences say true, but identity table is authoritative
          },
        },
        photo: null,
        interests: [],
      };

      mockUsersRepository.findOne = jest
        .fn()
        .mockResolvedValue(userWithoutIdentity);

      mockUsersRepository.manager = {
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      };

      mockAtprotoHandleCacheService.resolveHandle.mockResolvedValue(
        'test.user',
      );
      mockUsersRepository.save = jest.fn();

      // Identity table returns null (no identity)
      mockUserAtprotoIdentityServiceRef.findByUserUlid.mockResolvedValue(null);

      // Act
      const result = await userService.showProfile('openmeet-abc123');

      // Assert: socialProfiles.atprotocol.connected should be false from identity table
      expect(result?.['socialProfiles']?.atprotocol?.connected).toBe(false);
    });
  });

  describe('remove - Hard Delete User', () => {
    let mockGlobalMatrixService: jest.Mocked<GlobalMatrixValidationService>;
    let mockUsersRepository: any;
    let mockGroupRepository: any;
    let mockEventRepository: any;
    let mockGroupRoleRepository: any;
    let mockGroupMemberRepository: any;
    let mockDataSource: any;
    let mockTransactionalEntityManager: any;

    beforeEach(() => {
      mockGlobalMatrixService = module.get(GlobalMatrixValidationService);
      mockUsersRepository = module.get(Repository);

      // Create mock repositories for groups and events
      mockGroupRepository = {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
        remove: jest.fn(),
      };

      mockEventRepository = {
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      // Create mock repository for group roles
      mockGroupRoleRepository = {
        findOne: jest.fn().mockResolvedValue({ id: 1, name: 'owner' }),
      };

      // Create mock repository for group members
      mockGroupMemberRepository = {
        save: jest.fn(),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      // Set up the user repository delete mock
      mockUsersRepository.delete = jest.fn().mockResolvedValue({ affected: 1 });

      // Create mock transactional entity manager that returns our mock repos
      mockTransactionalEntityManager = {
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity.name === 'GroupEntity') return mockGroupRepository;
          if (entity.name === 'EventEntity') return mockEventRepository;
          if (entity.name === 'UserEntity') return mockUsersRepository;
          if (entity.name === 'GroupRoleEntity') return mockGroupRoleRepository;
          if (entity.name === 'GroupMemberEntity')
            return mockGroupMemberRepository;
          return mockUsersRepository;
        }),
        query: jest.fn().mockResolvedValue([]),
      };

      mockDataSource = {
        query: jest.fn().mockResolvedValue([]),
        // Mock transaction to execute the callback with our mock entity manager
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(mockTransactionalEntityManager);
        }),
      };
    });

    const setupMockRepositories = () => {
      // Directly set the private properties on the service
      (userService as any).usersRepository = mockUsersRepository;
      (userService as any).groupRepository = mockGroupRepository;
      (userService as any).eventRepository = mockEventRepository;
      (userService as any).dataSource = mockDataSource;

      // Override getTenantSpecificRepository to not overwrite our mocks
      jest
        .spyOn(userService as any, 'getTenantSpecificRepository')
        .mockImplementation(async () => {
          // Set all our mocks
          (userService as any).usersRepository = mockUsersRepository;
          (userService as any).groupRepository = mockGroupRepository;
          (userService as any).eventRepository = mockEventRepository;
          (userService as any).dataSource = mockDataSource;
        });
    };

    it('should hard delete user and transfer group ownership to eligible member', async () => {
      const userId = 123;
      const successorUserId = 456;

      // Mock an owned group with an eligible successor (admin)
      const mockOwnedGroup = {
        id: 1,
        name: 'Test Group',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
          {
            id: 2,
            user: { id: successorUserId },
            groupRole: { name: 'admin' },
          },
        ],
      };

      setupMockRepositories();

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.save.mockResolvedValue(mockOwnedGroup);
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify group ownership was transferred
      expect(mockGroupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: expect.objectContaining({ id: successorUserId }),
        }),
      );

      // Verify user was hard deleted (not soft deleted)
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should delete group when no eligible successor exists', async () => {
      const userId = 123;

      // Mock an owned group with no other members
      const mockOwnedGroup = {
        id: 1,
        name: 'Empty Group',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
        ],
      };

      setupMockRepositories();

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.remove.mockResolvedValue(mockOwnedGroup);
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify group was deleted
      expect(mockGroupRepository.remove).toHaveBeenCalledWith(mockOwnedGroup);

      // Verify user was hard deleted
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should delete standalone events (events not in a group)', async () => {
      const userId = 123;

      setupMockRepositories();

      mockEventRepository.delete.mockResolvedValue({ affected: 2 });
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify standalone events were deleted (events with null groupId)
      expect(mockEventRepository.delete).toHaveBeenCalledWith({
        user: { id: userId },
        group: expect.anything(), // IsNull() matcher
      });

      // Verify user was hard deleted
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should clean up Matrix handle registry', async () => {
      const userId = 123;

      setupMockRepositories();

      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify Matrix handle was unregistered
      expect(
        mockGlobalMatrixService.unregisterMatrixHandle,
      ).toHaveBeenCalledWith(TESTING_TENANT_ID, userId);

      // Verify Matrix handle registry entry was deleted (inside transaction)
      expect(mockTransactionalEntityManager.query).toHaveBeenCalledWith(
        'DELETE FROM "matrixHandleRegistry" WHERE "userId" = $1',
        [userId],
      );
    });

    it('should continue deletion even if Matrix cleanup fails', async () => {
      const userId = 123;

      setupMockRepositories();

      // Matrix cleanup fails
      mockGlobalMatrixService.unregisterMatrixHandle.mockRejectedValue(
        new Error('Matrix service unavailable'),
      );

      // Should not throw
      await expect(userService.remove(userId)).resolves.toBeUndefined();

      // User should still be deleted
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should handle string ID by converting to number', async () => {
      // Cast to any to test runtime behavior when ID comes as string from controller
      const userId = '123' as any;

      setupMockRepositories();

      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Should convert string to number
      expect(mockUsersRepository.delete).toHaveBeenCalledWith(123);
    });

    it('should prefer moderator over regular member for group ownership transfer', async () => {
      const userId = 123;
      const moderatorUserId = 456;
      const memberUserId = 789;

      const mockModeratorMember = {
        id: 3,
        user: { id: moderatorUserId },
        groupRole: { name: 'moderator' },
      };

      const mockOwnedGroup = {
        id: 1,
        name: 'Test Group',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
          {
            id: 2,
            user: { id: memberUserId },
            groupRole: { name: 'member' },
          },
          mockModeratorMember,
        ],
      };

      setupMockRepositories();

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.save.mockResolvedValue(mockOwnedGroup);
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify ownership transferred to moderator, not regular member
      expect(mockGroupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: expect.objectContaining({ id: moderatorUserId }),
        }),
      );

      // Verify the successor's role was elevated to owner
      expect(mockGroupMemberRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          groupRole: expect.objectContaining({ name: 'owner' }),
        }),
      );
    });

    it('should handle null user in groupMembers when filtering for successors', async () => {
      const userId = 123;
      const adminUserId = 456;

      // Mock an owned group with an orphaned groupMember (null user) and a valid admin
      const mockOwnedGroup = {
        id: 1,
        name: 'Group With Orphan Member',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
          {
            id: 2,
            user: null, // Orphaned record - null user
            groupRole: { name: 'admin' },
          },
          {
            id: 3,
            user: { id: adminUserId },
            groupRole: { name: 'admin' },
          },
        ],
      };

      setupMockRepositories();

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.save.mockResolvedValue(mockOwnedGroup);
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      // Should not crash - should skip null user and transfer to valid admin
      await userService.remove(userId);

      // Verify ownership transferred to the valid admin, skipping null user member
      expect(mockGroupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: expect.objectContaining({ id: adminUserId }),
        }),
      );

      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should delete chatRooms before deleting group with no successor', async () => {
      const userId = 123;

      // Mock an owned group with only the owner (no successor)
      const mockOwnedGroup = {
        id: 10,
        name: 'Group With Chat Rooms',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
        ],
      };

      // Track the order of calls to verify chatRooms deleted before group
      const callOrder: string[] = [];

      setupMockRepositories();

      // Override query to track chatRoom deletion calls
      mockTransactionalEntityManager.query.mockImplementation(
        (sql: string) => {
          if (sql.includes('"chatRooms"')) {
            callOrder.push('chatRoom.delete');
          }
          return Promise.resolve([]);
        },
      );

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.remove.mockImplementation((group: any) => {
        callOrder.push('group.remove');
        return Promise.resolve(group);
      });
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify chatRooms were deleted via raw SQL for this group
      expect(mockTransactionalEntityManager.query).toHaveBeenCalledWith(
        'DELETE FROM "chatRooms" WHERE "groupId" = $1',
        [10],
      );

      // Verify chatRooms deleted before group removal
      expect(callOrder.indexOf('chatRoom.delete')).toBeLessThan(
        callOrder.indexOf('group.remove'),
      );

      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should delete groupUserPermissions before deleting group with no successor', async () => {
      const userId = 123;

      // Mock an owned group with only the owner (no successor)
      const mockOwnedGroup = {
        id: 20,
        name: 'Group With Permissions',
        createdBy: { id: userId },
        groupMembers: [
          {
            id: 1,
            user: { id: userId },
            groupRole: { name: 'owner' },
          },
        ],
      };

      // Track the order of repository calls
      const callOrder: string[] = [];

      const mockGroupUserPermissionRepository = {
        delete: jest.fn().mockImplementation(() => {
          callOrder.push('groupUserPermission.delete');
          return Promise.resolve({ affected: 3 });
        }),
      };

      setupMockRepositories();

      // Override getRepository to also handle GroupUserPermissionEntity
      mockTransactionalEntityManager.getRepository.mockImplementation(
        (entity: any) => {
          if (entity.name === 'GroupEntity') return mockGroupRepository;
          if (entity.name === 'EventEntity') return mockEventRepository;
          if (entity.name === 'UserEntity') return mockUsersRepository;
          if (entity.name === 'GroupRoleEntity') return mockGroupRoleRepository;
          if (entity.name === 'GroupMemberEntity')
            return mockGroupMemberRepository;
          if (entity.name === 'GroupUserPermissionEntity')
            return mockGroupUserPermissionRepository;
          return mockUsersRepository;
        },
      );

      mockGroupRepository.find.mockResolvedValue([mockOwnedGroup]);
      mockGroupRepository.remove.mockImplementation((group: any) => {
        callOrder.push('group.remove');
        return Promise.resolve(group);
      });
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      await userService.remove(userId);

      // Verify groupUserPermissions were deleted for this group
      expect(mockGroupUserPermissionRepository.delete).toHaveBeenCalledWith({
        group: { id: 20 },
      });

      // Verify permissions deleted before group removal
      expect(callOrder.indexOf('groupUserPermission.delete')).toBeLessThan(
        callOrder.indexOf('group.remove'),
      );

      expect(mockUsersRepository.delete).toHaveBeenCalledWith(userId);
    });
  });
});
