import { Test, TestingModule } from '@nestjs/testing';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { AuthService } from '../auth/auth.service';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { JWTAuthGuard } from '../auth/auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { UserPermission } from '../core/constants/constant';

describe('CategoryController', () => {
  let controller: CategoryController;
  let guard: PermissionsGuard;

  const mockCategoryService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockAuthService = {
    getUserPermissions: jest.fn(),
    getGroup: jest.fn(),
    getGroupMembers: jest.fn(),
    getGroupMemberPermissions: jest.fn(),
  };

  const createMockExecutionContext = (
    handler: (...args: any[]) => Promise<any>,
    userContext: any = {},
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => CategoryController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 1, ...userContext },
          headers: {
            'x-group-slug': 'test-group',
          },
        }),
      }),
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => ({}),
      switchToWs: () => ({}),
      getType: () => 'http',
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [
        {
          provide: CategoryService,
          useValue: mockCategoryService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        Reflector,
        PermissionsGuard,
        JWTAuthGuard,
      ],
    }).compile();

    controller = module.get<CategoryController>(CategoryController);
    guard = module.get<PermissionsGuard>(PermissionsGuard);
  });

  describe('Authorization', () => {
    const mockUser = {
      id: 1,
      role: {
        permissions: [],
      },
    };
    describe('POST /categories', () => {
      const createDto = {
        name: 'New Category',
        description: 'New Description',
        slug: 'new-category',
      };

      it('should deny access without CreateCategories permission', async () => {
        mockAuthService.getUserPermissions.mockResolvedValue([]);
        mockAuthService.getGroup.mockResolvedValue({
          id: 1,
          name: 'Test Group',
        });
        mockAuthService.getGroupMembers.mockResolvedValue([
          { id: 1, userId: 1, groupId: 1 },
        ]);
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.create);
        await expect(guard.canActivate(context)).rejects.toThrow(/permissions/);
      });

      it('should allow access with CreateCategories permission', async () => {
        const createdCategory = { id: 1, ...createDto };
        mockCategoryService.create.mockResolvedValue(createdCategory);

        const mockUserWithPermissions = {
          ...mockUser,
          role: {
            permissions: [{ name: UserPermission.CreateCategories }],
          },
        };

        const context = createMockExecutionContext(
          controller.create,
          mockUserWithPermissions,
        );

        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.create(createDto);
        expect(result).toEqual(createdCategory);
      });
    });

    describe('GET /categories', () => {
      it('should allow public access to findAll', async () => {
        const categories = [{ id: 1, name: 'Test Category' }];
        mockCategoryService.findAll.mockResolvedValue(categories);

        const result = await controller.findAll();
        expect(result).toEqual(categories);
      });
    });

    describe('GET /categories/:id', () => {
      it('should deny access without ManageCategories permission', async () => {
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.findOne);
        await expect(guard.canActivate(context)).rejects.toThrow(
          'Insufficient permissions',
        );
      });

      it('should allow access with ManageCategories permission', async () => {
        const category = { id: 1, name: 'Test Category' };
        mockCategoryService.findOne.mockResolvedValue(category);

        const mockUserWithPermissions = {
          ...mockUser,
          role: {
            permissions: [{ name: 'MANAGE_CATEGORIES' }],
          },
        };

        const context = createMockExecutionContext(
          controller.findOne,
          mockUserWithPermissions,
        );

        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.findOne(1);
        expect(result).toEqual(category);
      });
    });

    describe('PATCH /categories/:id', () => {
      const updateDto = {
        name: 'Updated Category',
        description: 'Updated Description',
      };

      it('should deny access without ManageCategories permission', async () => {
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.update);
        await expect(guard.canActivate(context)).rejects.toThrow(/permissions/);
      });

      it('should allow access with ManageCategories permission', async () => {
        const updatedCategory = { id: 1, ...updateDto };
        mockCategoryService.update.mockResolvedValue(updatedCategory);

        const mockUserWithPermissions = {
          ...mockUser,
          role: {
            permissions: [{ name: 'MANAGE_CATEGORIES' }],
          },
        };

        const context = createMockExecutionContext(
          controller.update,
          mockUserWithPermissions,
        );

        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.update(1, updateDto);
        expect(result).toEqual(updatedCategory);
      });
    });

    describe('DELETE /categories/:id', () => {
      const mockUser = {
        id: 1,
        role: {
          permissions: [],
        },
      };

      it('should deny access without DeleteCategories permission', async () => {
        const mockUserWithoutPermissions = {
          ...mockUser,
          role: {
            permissions: [],
          },
        };

        const context = createMockExecutionContext(
          controller.remove,
          mockUserWithoutPermissions,
        );

        await expect(guard.canActivate(context)).rejects.toThrow(
          'Insufficient permissions',
        );
      });

      it('should allow access with DeleteCategories permission', async () => {
        mockCategoryService.remove.mockResolvedValue(undefined);

        const mockUserWithPermissions = {
          ...mockUser,
          role: {
            permissions: [{ name: UserPermission.DeleteCategories }],
          },
        };

        const context = createMockExecutionContext(
          controller.remove,
          mockUserWithPermissions,
        );

        await expect(guard.canActivate(context)).resolves.toBe(true);

        await expect(controller.remove(1)).resolves.toBeUndefined();
        expect(mockCategoryService.remove).toHaveBeenCalledWith(1);
      });
    });
  });
});
