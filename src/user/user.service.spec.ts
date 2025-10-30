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
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { StatusEnum } from '../status/status.enum';

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
      // Mock the repository methods
      mockUsersRepository.softDelete = jest
        .fn()
        .mockResolvedValue({ affected: 1 });

      // Mock Matrix cleanup
      mockGlobalMatrixService.unregisterMatrixHandle.mockResolvedValue();

      // Call remove
      await userService.remove(mockUser.id);

      // Verify Matrix cleanup was called with correct parameters
      expect(
        mockGlobalMatrixService.unregisterMatrixHandle,
      ).toHaveBeenCalledWith(TESTING_TENANT_ID, mockUser.id);

      // Verify user was soft deleted
      expect(mockUsersRepository.softDelete).toHaveBeenCalledWith(mockUser.id);
    });

    it('should still remove user even if Matrix cleanup fails', async () => {
      // Mock the repository methods
      mockUsersRepository.softDelete = jest
        .fn()
        .mockResolvedValue({ affected: 1 });

      // Mock Matrix cleanup to fail
      mockGlobalMatrixService.unregisterMatrixHandle.mockRejectedValue(
        new Error('Matrix service unavailable'),
      );

      // Call remove - should not throw
      await expect(userService.remove(mockUser.id)).resolves.toBeUndefined();

      // Verify user was still soft deleted despite Matrix failure
      expect(mockUsersRepository.softDelete).toHaveBeenCalledWith(mockUser.id);
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
});
