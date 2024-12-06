import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { PermissionsGuard } from './permissions.guard';
import { Request, Response } from 'express';
import {
  EventAttendeePermission,
  GroupPermission,
  UserPermission,
} from '../../core/constants/constant';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let authService: AuthService;

  // Helper function to create mock execution context
  const createMockExecutionContext = (data: {
    user?: any;
    params?: any;
  }): ExecutionContext => {
    const mockRequest = {
      user: {
        id: 1,
        role: {
          permissions: [UserPermission.ManageCategories], // Default empty permissions
        },
        ...data.user,
      },
      params: data.params || {},
    } as Request & { user: any };

    const mockResponse = {} as Response;
    const mockNext = () => {};
    const mockHandler = () => {};
    const mockClass = class MockClass {};

    const mockContext: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: <T = any>() => mockRequest as T,
        getResponse: <T = any>() => mockResponse as T,
        getNext: <T = any>() => mockNext as T,
      }),
      getHandler: () => mockHandler,
      getClass: <T = any>() => mockClass as Type<T>,
      getType: <TContext extends string = string>() => 'http' as TContext,
      getArgs: <T extends Array<any> = any[]>() => [] as unknown as T,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      getArgByIndex: <T = any>(_index: number) => ({}) as T,
      switchToRpc: () => ({
        getContext: <T = any>() => ({}) as T,
        getData: <T = any>() => ({}) as T,
      }),
      switchToWs: () => ({
        getClient: <T = any>() => ({}) as T,
        getData: <T = any>() => ({}) as T,
        getPattern: () => '',
      }),
    };
    return mockContext;
  };

  beforeEach(async () => {
    const mockAuthService = {
      getEventAttendeesBySlug: jest.fn(),
      getGroupMembersBySlug: jest.fn(),
      getUserPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
    authService = module.get<AuthService>(AuthService);
  });

  describe('User Permissions', () => {
    it('should allow access with direct user permission', async () => {
      const mockContext = createMockExecutionContext({
        user: {
          id: 1,
          role: {
            permissions: [{ name: 'CREATE_EVENTS' }],
          },
        },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'user',
          permissions: ['CREATE_EVENTS'],
        },
      ]);

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should deny access without required user permission', async () => {
      const mockContext = createMockExecutionContext({
        user: {
          id: 1,
          role: {
            permissions: [], // No permissions
          },
        },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'user',
          permissions: ['CREATE_EVENTS'],
        },
      ]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Insufficient permissions',
      );
    });
  });

  describe('Context Permissions', () => {
    it('should allow access when user has all required permissions across contexts', async () => {
      const mockContext = createMockExecutionContext({
        user: { id: 1 },
        params: { slug: 'test-event', groupSlug: 'test-group' },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'event',
          permissions: [EventAttendeePermission.ManageAttendees],
        },
        {
          context: 'group',
          permissions: [GroupPermission.ManageEvents],
        },
      ]);

      (authService.getEventAttendeesBySlug as jest.Mock).mockResolvedValue([
        {
          role: {
            permissions: [{ name: EventAttendeePermission.ManageAttendees }],
          },
        },
      ]);

      (authService.getGroupMembersBySlug as jest.Mock).mockResolvedValue([
        {
          groupRole: {
            groupPermissions: [{ name: GroupPermission.ManageEvents }],
          },
        },
      ]);

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should deny access when missing permissions in any context', async () => {
      const mockContext = createMockExecutionContext({
        user: { id: 1 },
        params: { slug: 'test-event', groupSlug: 'test-group' },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'event',
          permissions: [EventAttendeePermission.ManageAttendees],
        },
        {
          context: 'group',
          permissions: [GroupPermission.ManageEvents],
        },
      ]);

      (authService.getEventAttendeesBySlug as jest.Mock).mockResolvedValue([
        {
          role: {
            permissions: [{ name: EventAttendeePermission.ManageAttendees }],
          },
        },
      ]);

      // Missing group permission
      (authService.getGroupMembersBySlug as jest.Mock).mockResolvedValue([
        {
          groupRole: {
            groupPermissions: [], // No permissions
          },
        },
      ]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new ForbiddenException('Insufficient permissions'),
      );
    });

    it('should deny access when user is not a member of required context', async () => {
      const mockContext = createMockExecutionContext({
        user: { id: 1 },
        params: { slug: 'test-event', groupSlug: 'test-group' },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'event',
          permissions: [EventAttendeePermission.ManageAttendees],
        },
      ]);

      // User not found in event
      (authService.getEventAttendeesBySlug as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new ForbiddenException('Insufficient permissions'),
      );
    });
  });

  describe('Mixed Permissions', () => {
    it('should handle both user and context permissions', async () => {
      const mockContext = createMockExecutionContext({
        user: {
          id: 1,
          role: {
            permissions: [{ name: 'CREATE_EVENTS' }],
          },
        },
        params: { groupSlug: 'test-group' },
      });

      jest.spyOn(reflector, 'get').mockReturnValue([
        {
          context: 'user',
          permissions: ['CREATE_EVENTS'],
        },
        {
          context: 'group',
          permissions: [GroupPermission.ManageEvents],
        },
      ]);

      (authService.getGroupMembersBySlug as jest.Mock).mockResolvedValue([
        {
          groupRole: {
            groupPermissions: [{ name: GroupPermission.ManageEvents }],
          },
        },
      ]);

      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });
  });
});
