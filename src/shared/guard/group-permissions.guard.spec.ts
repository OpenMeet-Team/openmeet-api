import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('PermissionsGuard - Group Event Permissions', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  // Mock data for tests
  const userId = 1;
  const eventSlug = 'test-event';
  const groupId = 123;
  const eventId = 456;

  // Mock the event with group
  const mockEvent = {
    id: eventId,
    slug: eventSlug,
    name: 'Test Event',
    description: 'Event description',
    group: {
      id: groupId,
      slug: 'test-group',
      name: 'Test Group',
    },
    user: {
      id: 999, // Different from our test userId to test non-owner scenarios
    },
  };

  // Mock auth service with configurable returns
  const mockAuthService = {
    getUserPermissions: jest.fn(),
    getEventAttendeeBySlug: jest.fn(),
    getGroupMembersBySlug: jest.fn(),
    getEvent: jest.fn(),
    getGroupMemberByUserId: jest.fn(),
    getGroup: jest.fn(),
  };

  // Create mock context with configurable params
  const createMockContext = (
    user = { id: userId },
    params = { slug: eventSlug },
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          headers: {
            'x-event-slug': params['slug'],
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
    authService = module.get<AuthService>(AuthService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('Event permission checks for group-associated events', () => {
    beforeEach(() => {
      // Default behavior - require VIEW_EVENTS permission for event context
      jest
        .spyOn(reflector, 'get')
        .mockReturnValue([{ context: 'event', permissions: ['VIEW_EVENTS'] }]);

      // Default - event has a group
      mockAuthService.getEvent.mockResolvedValue(mockEvent);

      // Default - user is not an attendee
      mockAuthService.getEventAttendeeBySlug.mockResolvedValue(null);
    });

    it('should allow a group admin to access an event they did not create', async () => {
      // Set up a group member with admin permission
      const groupMember = {
        groupRole: {
          name: 'Admin',
          groupPermissions: [
            { name: 'MANAGE_EVENTS' },
            { name: 'VIEW_GROUPS' },
          ],
        },
      };
      mockAuthService.getGroupMemberByUserId.mockResolvedValue(groupMember);

      // Create context with user that is not the event owner
      const context = createMockContext({ id: userId }, { slug: eventSlug });

      // Permissions check should pass
      await expect(guard.canActivate(context)).resolves.toBe(true);

      // Verify the correct methods were called
      expect(mockAuthService.getEvent).toHaveBeenCalledWith(eventSlug);
      expect(mockAuthService.getEventAttendeeBySlug).toHaveBeenCalledWith(
        userId,
        eventSlug,
      );
      expect(mockAuthService.getGroupMemberByUserId).toHaveBeenCalledWith(
        userId,
        groupId,
      );
    });

    it('should deny a regular group member from editing an event they did not create', async () => {
      // Set up a group member without admin permission
      const groupMember = {
        groupRole: {
          name: 'Member',
          groupPermissions: [
            { name: 'VIEW_GROUPS' },
            // No MANAGE_EVENTS permission
          ],
        },
      };
      mockAuthService.getGroupMemberByUserId.mockResolvedValue(groupMember);

      // Create context with user that is not the event owner
      const context = createMockContext({ id: userId }, { slug: eventSlug });

      // Permissions check should fail with ForbiddenException
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      // Verify the correct methods were called
      expect(mockAuthService.getEvent).toHaveBeenCalledWith(eventSlug);
      expect(mockAuthService.getEventAttendeeBySlug).toHaveBeenCalledWith(
        userId,
        eventSlug,
      );
      expect(mockAuthService.getGroupMemberByUserId).toHaveBeenCalledWith(
        userId,
        groupId,
      );
    });

    it('should allow the event owner to manage their event regardless of group permissions', async () => {
      // Set up the event with the current user as owner
      const ownerEvent = {
        ...mockEvent,
        user: {
          id: userId, // Same as our test userId to test owner scenario
        },
      };
      mockAuthService.getEvent.mockResolvedValue(ownerEvent);

      // Set up a group member without admin permission
      const groupMember = {
        groupRole: {
          name: 'Member',
          groupPermissions: [
            { name: 'VIEW_GROUPS' },
            // No MANAGE_EVENTS permission
          ],
        },
      };
      mockAuthService.getGroupMemberByUserId.mockResolvedValue(groupMember);

      // Create context with user that is the event owner
      const context = createMockContext({ id: userId }, { slug: eventSlug });

      // Permissions check should pass because user is owner
      await expect(guard.canActivate(context)).resolves.toBe(true);

      // Verify the correct methods were called
      expect(mockAuthService.getEvent).toHaveBeenCalledWith(eventSlug);
      expect(mockAuthService.getEventAttendeeBySlug).toHaveBeenCalledWith(
        userId,
        eventSlug,
      );
    });

    it('should deny access when no group membership exists', async () => {
      // No group membership found
      mockAuthService.getGroupMemberByUserId.mockResolvedValue(null);

      // Create context with user that is not the event owner
      const context = createMockContext({ id: userId }, { slug: eventSlug });

      // Permissions check should fail with ForbiddenException
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      // Verify the correct methods were called
      expect(mockAuthService.getEvent).toHaveBeenCalledWith(eventSlug);
      expect(mockAuthService.getEventAttendeeBySlug).toHaveBeenCalledWith(
        userId,
        eventSlug,
      );
      expect(mockAuthService.getGroupMemberByUserId).toHaveBeenCalledWith(
        userId,
        groupId,
      );
    });

    it('should properly handle when group permissions are null or undefined', async () => {
      // Set up a group member with missing or malformed permissions data
      const groupMember = {
        groupRole: {
          name: 'Member',
          // Missing groupPermissions array
        },
      };
      mockAuthService.getGroupMemberByUserId.mockResolvedValue(groupMember);

      // Create context with user that is not the event owner
      const context = createMockContext({ id: userId }, { slug: eventSlug });

      // Permissions check should fail with ForbiddenException
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      // Verify the correct methods were called
      expect(mockAuthService.getEvent).toHaveBeenCalledWith(eventSlug);
      expect(mockAuthService.getEventAttendeeBySlug).toHaveBeenCalledWith(
        userId,
        eventSlug,
      );
      expect(mockAuthService.getGroupMemberByUserId).toHaveBeenCalledWith(
        userId,
        groupId,
      );
    });
  });
});
