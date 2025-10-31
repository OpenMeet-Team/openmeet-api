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
});
