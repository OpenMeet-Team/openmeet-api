import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import {
  mockTenantConnectionService,
  mockRepository,
  mockRoleService,
  mockSubCategoryService,
  mockFilesS3PresignedService,
  mockUser,
} from '../test/mocks';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { RoleService } from '../role/role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { GlobalMatrixValidationService } from '../matrix/services/global-matrix-validation.service';

describe('UserService.findByIdentifier - Multi-Identifier Profile Lookup', () => {
  let userService: UserService;
  let blueskyIdentityService: jest.Mocked<BlueskyIdentityService>;
  let atprotoHandleCache: jest.Mocked<AtprotoHandleCacheService>;
  let module: TestingModule;

  const mockBlueskyUser = {
    ...mockUser,
    id: 999,
    slug: 'alice-abc123',
    socialId: 'did:plc:abc123',
    provider: AuthProvidersEnum.bluesky,
    firstName: 'Alice',
    preferences: {
      bluesky: {
        did: 'did:plc:abc123',
        connected: true,
      },
    },
  };

  beforeEach(async () => {
    blueskyIdentityService = {
      resolveProfile: jest.fn(),
      resolveHandleToDid: jest.fn(),
      extractHandleFromDid: jest.fn(),
    } as unknown as jest.Mocked<BlueskyIdentityService>;

    atprotoHandleCache = {
      resolveHandle: jest.fn(),
      resolveHandles: jest.fn(),
      invalidate: jest.fn(),
    } as unknown as jest.Mocked<AtprotoHandleCacheService>;

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
          useValue: blueskyIdentityService,
        },
        {
          provide: AtprotoHandleCacheService,
          useValue: atprotoHandleCache,
        },
      ],
    }).compile();

    userService = await module.resolve<UserService>(UserService);
  });

  describe('Slug Lookup', () => {
    it('should find user by slug (most common case)', async () => {
      // Arrange
      const slug = 'alice-abc123';
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      const result = await userService.findByIdentifier(slug);

      // Assert
      expect(result).toEqual(mockBlueskyUser);
      expect(userService.showProfile).toHaveBeenCalledWith(slug);
    });

    it('should return null when slug not found', async () => {
      // Arrange
      jest.spyOn(userService, 'showProfile').mockResolvedValue(null);

      // Act
      const result = await userService.findByIdentifier('nonexistent-slug');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('DID Lookup', () => {
    it('should find user by DID when identifier starts with "did:"', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      const showProfileSpy = jest
        .spyOn(userService, 'showProfile')
        .mockResolvedValue(mockBlueskyUser);

      // Act
      const result = await userService.findByIdentifier(did);

      // Assert
      expect(result).toEqual(mockBlueskyUser);
      expect(userService.findBySocialIdAndProvider).toHaveBeenCalledWith(
        {
          socialId: did,
          provider: AuthProvidersEnum.bluesky,
        },
        undefined,
      );
      expect(showProfileSpy).toHaveBeenCalledWith('alice-abc123');
    });

    it('should return null when DID not found', async () => {
      // Arrange
      const did = 'did:plc:notfound';
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Act
      const result = await userService.findByIdentifier(did);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle different DID methods (did:web, did:key, etc)', async () => {
      // Arrange - DID Web
      const didWeb = 'did:web:example.com';
      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      const result = await userService.findByIdentifier(didWeb);

      // Assert
      expect(result).toEqual(mockBlueskyUser);
      expect(userService.findBySocialIdAndProvider).toHaveBeenCalledWith(
        {
          socialId: didWeb,
          provider: AuthProvidersEnum.bluesky,
        },
        undefined,
      );
      expect(userService.showProfile).toHaveBeenCalledWith('alice-abc123');
    });
  });

  describe('Handle Lookup', () => {
    it('should resolve handle to DID then find user', async () => {
      // Arrange
      const handle = 'alice.bsky.social';
      const did = 'did:plc:abc123';

      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(did);

      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      const showProfileSpy = jest
        .spyOn(userService, 'showProfile')
        .mockResolvedValue(mockBlueskyUser);

      // Act
      const result = await userService.findByIdentifier(handle);

      // Assert
      expect(result).toEqual(mockBlueskyUser);
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        handle,
      );
      expect(userService.findBySocialIdAndProvider).toHaveBeenCalledWith(
        {
          socialId: did,
          provider: AuthProvidersEnum.bluesky,
        },
        undefined,
      );
      expect(showProfileSpy).toHaveBeenCalledWith('alice-abc123');
    });

    it('should return null when handle resolution fails', async () => {
      // Arrange
      const handle = 'nonexistent.bsky.social';
      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(null);

      // Act
      const result = await userService.findByIdentifier(handle);

      // Assert
      expect(result).toBeNull();
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        handle,
      );
    });

    it('should return null when handle resolves but user not found', async () => {
      // Arrange
      const handle = 'orphan.bsky.social';
      const did = 'did:plc:orphan123';

      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(did);

      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(null);

      // Act
      const result = await userService.findByIdentifier(handle);

      // Assert
      expect(result).toBeNull();
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        handle,
      );
    });

    it('should handle custom domain handles', async () => {
      // Arrange
      const customHandle = 'alice.custom-domain.com';
      const did = 'did:plc:abc123';

      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(did);

      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      const result = await userService.findByIdentifier(customHandle);

      // Assert
      expect(result).toEqual(mockBlueskyUser);
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        customHandle,
      );
      expect(userService.showProfile).toHaveBeenCalledWith('alice-abc123');
    });
  });

  describe('Identifier Detection', () => {
    it('should distinguish slug from handle correctly', async () => {
      // Arrange - slug pattern: username-shortcode
      const slug = 'alice-abc123';
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      await userService.findByIdentifier(slug);

      // Assert - treated as slug
      expect(userService.showProfile).toHaveBeenCalledWith(slug);
      expect(blueskyIdentityService.resolveHandleToDid).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Arrange - handle pattern: domain.tld
      const handle = 'alice.bsky.social';
      const did = 'did:plc:abc123';
      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(did);
      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      await userService.findByIdentifier(handle);

      // Assert - treated as handle
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        handle,
      );
      expect(userService.showProfile).toHaveBeenCalledWith('alice-abc123');
    });

    it('should treat identifier with @ prefix as handle', async () => {
      // Arrange - @handle format
      const handleWithAt = '@alice.bsky.social';
      const handleWithoutAt = 'alice.bsky.social';
      const did = 'did:plc:abc123';

      blueskyIdentityService.resolveHandleToDid.mockResolvedValue(did);

      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockBlueskyUser);

      // Act
      await userService.findByIdentifier(handleWithAt);

      // Assert - @ stripped and treated as handle
      expect(blueskyIdentityService.resolveHandleToDid).toHaveBeenCalledWith(
        handleWithoutAt,
      );
      expect(userService.showProfile).toHaveBeenCalledWith('alice-abc123');
    });

    it('should prioritize DID detection over other patterns', async () => {
      // Arrange - starts with "did:" should always be treated as DID
      const did = 'did:plc:abc123';
      const mockUserWithSlug = { ...mockBlueskyUser, slug: 'alice-abc123' };
      jest
        .spyOn(userService, 'findBySocialIdAndProvider')
        .mockResolvedValue(mockUserWithSlug);
      const showProfileSpy = jest
        .spyOn(userService, 'showProfile')
        .mockResolvedValue(mockBlueskyUser);

      // Act
      await userService.findByIdentifier(did);

      // Assert
      expect(userService.findBySocialIdAndProvider).toHaveBeenCalled();
      expect(blueskyIdentityService.resolveHandleToDid).not.toHaveBeenCalled();
      expect(showProfileSpy).toHaveBeenCalledWith('alice-abc123');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null identifier gracefully', async () => {
      // Act
      const result = await userService.findByIdentifier(null as any);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle undefined identifier gracefully', async () => {
      // Act
      const result = await userService.findByIdentifier(undefined as any);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle empty string identifier', async () => {
      // Act
      const result = await userService.findByIdentifier('');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle whitespace-only identifier', async () => {
      // Act
      const result = await userService.findByIdentifier('   ');

      // Assert
      expect(result).toBeNull();
    });
  });
});
