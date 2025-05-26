import { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { UserService } from './user.service';
import {
  mockFilesS3PresignedService,
  mockRepository,
  mockRole,
  mockRoleService,
  mockSubCategory,
  mockSubCategoryService,
  mockUser,
} from '../test/mocks';
import { mockTenantConnectionService } from '../test/mocks';
import { TenantConnectionService } from '../tenant/tenant.service';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { RoleService } from '../role/role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { TESTING_TENANT_ID } from '../../test/utils/constants';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

  describe('showProfile', () => {
    it('should show a user profile', async () => {
      jest.spyOn(userService, 'showProfile').mockResolvedValue(mockUser);
      const user = await userService.showProfile(mockUser.slug);
      expect(user).toBeDefined();
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

  // Removed Zulip credentials test - we've migrated to Matrix

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
    it('should remove a user', async () => {
      jest.spyOn(userService, 'remove').mockResolvedValue();
      const user = await userService.remove(mockUser.id);
      expect(user).toBeUndefined();
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
});
