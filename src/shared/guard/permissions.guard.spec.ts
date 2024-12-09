import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { ExecutionContext } from '@nestjs/common';
import { UserPermission, GroupPermission } from '../../core/constants/constant';
import { ForbiddenException } from '@nestjs/common';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  const mockAuthService = {
    getUserPermissions: jest.fn(),
    getEventAttendeeBySlug: jest.fn(),
    getGroupMembersBySlug: jest.fn(),
  };

  const createMockContext = (user = { id: 1 }, params = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          headers: {
            'x-event-slug': params['eventSlug'],
            'x-group-slug': params['groupSlug'],
          },
        }),
      }),
      getClass: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
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
  });

  describe('User Permissions', () => {
    it('should allow access with direct user permission', async () => {
      const requirements = [
        { context: 'user', permissions: [UserPermission.CreateEvents] },
      ];
      (reflector.get as jest.Mock).mockReturnValue(requirements);
      const mockContext = createMockContext({ id: 1 });

      mockAuthService.getUserPermissions.mockResolvedValue([
        { name: UserPermission.CreateEvents },
      ]);

      await expect(guard.canActivate(mockContext)).resolves.toBe(true);
    });

    it('should deny access without required user permission', async () => {
      // Mock the reflector to return our permissions requirements
      (reflector.get as jest.Mock).mockReturnValue([
        { context: 'user', permissions: [UserPermission.CreateEvents] },
      ]);

      const mockContext = createMockContext({ id: 1 });

      mockAuthService.getUserPermissions.mockResolvedValue([]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Insufficient permissions',
      );
    });
  });

  describe('Context Permissions', () => {
    describe('Multiple Contexts', () => {
      it('should deny access when missing one of the required permissions', async () => {
        (reflector.get as jest.Mock).mockReturnValue([
          {
            context: 'event',
            permissions: [UserPermission.ManageAttendees],
          },
          {
            context: 'group',
            permissions: [GroupPermission.ManageEvents],
          },
        ]);

        // Setup context requiring both event and group permissions
        const mockContext = createMockContext(
          { id: 1 },
          {
            eventSlug: 'event-slug',
            groupSlug: 'group-slug',
          },
        );

        // Mock event permissions - user has required event permission
        mockAuthService.getEventAttendeeBySlug.mockResolvedValue([
          {
            role: {
              permissions: [{ name: UserPermission.ManageAttendees }],
            },
          },
        ]);

        // Mock group permissions - user is a member but lacks required permission
        mockAuthService.getGroupMembersBySlug.mockResolvedValue([
          {
            groupRole: {
              groupPermissions: [GroupPermission.ManageDiscussions],
            },
          },
        ]);

        // Verify that access is denied due to missing group permission
        await expect(guard.canActivate(mockContext)).rejects.toThrow(
          new ForbiddenException('Insufficient permissions'),
        );
      });

      it('should deny access when having group permissions but missing event permissions', async () => {
        const requirements = [
          {
            context: 'event',
            permissions: [UserPermission.ManageAttendees],
          },
          {
            context: 'group',
            permissions: [GroupPermission.ManageEvents],
          },
        ];

        (reflector.get as jest.Mock).mockReturnValue(requirements);
        const mockContext = createMockContext(
          { id: 1 },
          {
            eventSlug: 'event-slug',
            groupSlug: 'group-slug',
          },
        );

        // Mock event permissions - user lacks required event permission
        mockAuthService.getEventAttendeeBySlug.mockResolvedValue([
          {
            role: {
              permissions: [],
            },
          },
        ]);

        // Mock group permissions - user has required group permission
        mockAuthService.getGroupMembersBySlug.mockResolvedValue([
          {
            groupRole: {
              groupPermissions: [{ name: GroupPermission.ManageEvents }],
            },
          },
        ]);

        await expect(guard.canActivate(mockContext)).rejects.toThrow(
          new ForbiddenException('Insufficient permissions'),
        );
      });
    });
  });

  describe('Mixed Permissions', () => {
    it('should handle both user and context permissions', async () => {
      const requirements = [
        { context: 'user', permissions: [UserPermission.CreateEvents] },
        { context: 'group', permissions: [GroupPermission.ManageEvents] },
      ];
      (reflector.get as jest.Mock).mockReturnValue(requirements);
      const mockContext = createMockContext(
        { id: 1 },
        {
          groupSlug: 'group-slug',
        },
      );

      mockAuthService.getUserPermissions.mockResolvedValue([
        { name: UserPermission.CreateEvents },
      ]);

      mockAuthService.getGroupMembersBySlug.mockResolvedValue([
        {
          groupRole: {
            groupPermissions: [{ name: GroupPermission.ManageEvents }],
          },
        },
      ]);

      await expect(guard.canActivate(mockContext)).resolves.toBe(true);
    });
  });
});
