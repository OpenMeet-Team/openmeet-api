import { Test, TestingModule } from '@nestjs/testing';
import { ActivityFeedListener } from './activity-feed.listener';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { ModuleRef } from '@nestjs/core';
import { GroupVisibility, EventVisibility } from '../core/constants/constant';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventQueryService } from '../event/services/event-query.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { AttendanceChangedEvent } from '../attendance/types';
import { ContrailQueryService } from '../contrail/contrail-query.service';

describe('ActivityFeedListener', () => {
  let listener: ActivityFeedListener;
  let activityFeedService: jest.Mocked<ActivityFeedService>;
  let groupService: jest.Mocked<GroupService>;
  let userService: jest.Mocked<UserService>;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let mockContrailQueryService: any;
  let mockModuleRef: jest.Mocked<ModuleRef>;

  const mockPublicGroup: Partial<GroupEntity> = {
    id: 42,
    slug: 'tech-talks',
    name: 'Tech Talks',
    visibility: GroupVisibility.Public,
  };

  const mockPrivateGroup: Partial<GroupEntity> = {
    id: 43,
    slug: 'secret-group',
    name: 'Secret Group',
    visibility: GroupVisibility.Private,
  };

  const mockAuthenticatedGroup: Partial<GroupEntity> = {
    id: 44,
    slug: 'authenticated-group',
    name: 'Authenticated Group',
    visibility: GroupVisibility.Unlisted,
  };

  const mockUser: Partial<UserEntity> = {
    id: 100,
    slug: 'sarah-chen',
    firstName: 'Sarah',
    lastName: 'Chen',
  };

  const mockEvent: Partial<EventEntity> = {
    id: 200,
    slug: 'typescript-workshop',
    name: 'TypeScript Workshop',
    visibility: EventVisibility.Public,
    group: mockPublicGroup as GroupEntity,
  };

  beforeEach(async () => {
    activityFeedService = { create: jest.fn() } as any;
    groupService = { getGroupBySlug: jest.fn() } as any;
    userService = { getUserBySlug: jest.fn(), getUserById: jest.fn() } as any;
    eventQueryService = { findEventBySlug: jest.fn() } as any;
    mockContrailQueryService = {
      findByUri: jest.fn().mockResolvedValue(null),
    };

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass) => {
        if (serviceClass === ActivityFeedService) return activityFeedService;
        if (serviceClass === GroupService) return groupService;
        if (serviceClass === UserService) return userService;
        if (serviceClass === EventQueryService) return eventQueryService;
        if (serviceClass === ContrailQueryService)
          return mockContrailQueryService;
        throw new Error(`Unexpected service: ${serviceClass}`);
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedListener,
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    listener = module.get<ActivityFeedListener>(ActivityFeedListener);

    jest.clearAllMocks();
  });

  describe('handleGroupMemberAdded - Public Group', () => {
    it('should create a single public activity when member joins public group', async () => {
      // Arrange
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledTimes(1);
      expect(activityFeedService.create).toHaveBeenCalledWith({
        activityType: 'member.joined',
        feedScope: 'group',
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'time_window',
        aggregationWindow: 60,
      });
    });

    it('should include all required slugs in activity metadata', async () => {
      // Arrange
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      const call = activityFeedService.create.mock.calls[0][0];
      expect(call.groupSlug).toBe('tech-talks');
      expect(call.groupName).toBe('Tech Talks');
      expect(call.actorSlug).toBe('sarah-chen');
      expect(call.actorName).toBe('Sarah Chen');
    });

    it('should use 60-minute aggregation window for member.joined activities', async () => {
      // Arrange
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregationStrategy: 'time_window',
          aggregationWindow: 60,
        }),
      );
    });
  });

  describe('handleGroupMemberAdded - Private Group', () => {
    it('should create TWO activities when member joins private group', async () => {
      // Arrange
      const params = {
        groupSlug: 'secret-group',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPrivateGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert - Only creates group-scoped activity, not sitewide
      expect(activityFeedService.create).toHaveBeenCalledTimes(1);
    });

    it('should create detailed members_only activity for private group', async () => {
      // Arrange
      const params = {
        groupSlug: 'secret-group',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPrivateGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert - First call should be detailed activity
      expect(activityFeedService.create).toHaveBeenNthCalledWith(1, {
        activityType: 'member.joined',
        feedScope: 'group',
        groupId: 43,
        groupSlug: 'secret-group',
        groupName: 'Secret Group',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Private,
        aggregationStrategy: 'time_window',
        aggregationWindow: 60,
      });
    });

    it('should NOT create sitewide activity for private group', async () => {
      // Arrange
      const params = {
        groupSlug: 'secret-group',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPrivateGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert - Only one call (group-scoped), no sitewide activity
      expect(activityFeedService.create).toHaveBeenCalledTimes(1);
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          feedScope: 'group',
          groupVisibility: GroupVisibility.Private,
        }),
      );
    });
  });

  describe('handleGroupMemberAdded - Authenticated Group', () => {
    it('should create a single authenticated activity when member joins authenticated group', async () => {
      // Arrange
      const params = {
        groupSlug: 'authenticated-group',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockAuthenticatedGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledTimes(1);
      expect(activityFeedService.create).toHaveBeenCalledWith({
        activityType: 'member.joined',
        feedScope: 'group',
        groupId: 44,
        groupSlug: 'authenticated-group',
        groupName: 'Authenticated Group',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Unlisted,
        aggregationStrategy: 'time_window',
        aggregationWindow: 60,
      });
    });
  });

  describe('handleGroupMemberAdded - Error Handling', () => {
    it('should not create activity when group is not found', async () => {
      // Arrange
      const params = {
        groupSlug: 'non-existent',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(null);
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should not create activity when user is not found', async () => {
      // Arrange
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'non-existent',
        tenantId: 'test-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(null);

      // Act
      await listener.handleGroupMemberAdded(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      // Arrange
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'sarah-chen',
        tenantId: 'test-tenant',
      };

      const error = new Error('Database connection failed');
      groupService.getGroupBySlug.mockRejectedValue(error);

      // Act & Assert - Should not throw
      await expect(
        listener.handleGroupMemberAdded(params),
      ).resolves.not.toThrow();
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });
  });

  describe('handleEventCreated', () => {
    it('should create event.created activity when event is created in a group', async () => {
      // Arrange
      const params = {
        eventId: 200,
        slug: 'typescript-workshop',
        userId: 100,
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleEventCreated(params);

      // Assert - Now creates 2 activities: group feed + sitewide feed
      expect(activityFeedService.create).toHaveBeenCalledTimes(2);

      // First call: group-scoped activity
      expect(activityFeedService.create).toHaveBeenNthCalledWith(1, {
        activityType: 'event.created',
        feedScope: 'group',
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        eventId: 200,
        eventSlug: 'typescript-workshop',
        eventName: 'TypeScript Workshop',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'none',
      });

      // Second call: sitewide activity (for public event in public group)
      expect(activityFeedService.create).toHaveBeenNthCalledWith(2, {
        activityType: 'event.created',
        feedScope: 'sitewide',
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        eventId: 200,
        eventSlug: 'typescript-workshop',
        eventName: 'TypeScript Workshop',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'none',
      });
    });

    it('should not create activity when event is not found', async () => {
      // Arrange
      const params = {
        eventId: 999,
        slug: 'non-existent',
        userId: 100,
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(null);

      // Act
      await listener.handleEventCreated(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should create activities visible to both event attendees and public discovery', async () => {
      // Arrange
      const params = {
        eventId: 200,
        slug: 'standalone-event',
        userId: 100,
        tenantId: 'test-tenant',
      };

      const eventWithoutGroup: Partial<EventEntity> = {
        id: 200,
        slug: 'standalone-event',
        name: 'Standalone Event',
        visibility: EventVisibility.Public,
        group: null,
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        eventWithoutGroup as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleEventCreated(params);

      // Assert - Check behavior: what feeds should have activities
      const activities = activityFeedService.create.mock.calls.map(
        (call) => call[0],
      );

      // Behavior 1: Event page should show activity to attendees
      const eventActivity = activities.find((a) => a.feedScope === 'event');
      expect(eventActivity).toMatchObject({
        activityType: 'event.created',
        feedScope: 'event',
        eventId: 200,
      });

      // Behavior 2: Sitewide feed should show activity for discovery
      const sitewideActivity = activities.find(
        (a) => a.feedScope === 'sitewide',
      );
      expect(sitewideActivity).toMatchObject({
        activityType: 'event.created',
        feedScope: 'sitewide',
        eventId: 200,
        // Public events show full details (name, slug, etc.)
      });
      expect(sitewideActivity.eventName).toBe('Standalone Event');
    });

    it('should treat event as standalone when group is not found', async () => {
      // Arrange
      const params = {
        eventId: 200,
        slug: 'typescript-workshop',
        userId: 100,
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      groupService.getGroupBySlug.mockResolvedValue(null);
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleEventCreated(params);

      // Assert - Check behavior: should work like standalone event
      const activities = activityFeedService.create.mock.calls.map(
        (call) => call[0],
      );

      // Should create event-scoped activity (not group-scoped)
      const eventActivity = activities.find((a) => a.feedScope === 'event');
      expect(eventActivity).toBeDefined();
      expect(eventActivity.groupId).toBeUndefined();

      // Should also create sitewide activity
      const sitewideActivity = activities.find(
        (a) => a.feedScope === 'sitewide',
      );
      expect(sitewideActivity).toBeDefined();
    });

    it('should not create activity when user is not found', async () => {
      // Arrange
      const params = {
        eventId: 200,
        slug: 'typescript-workshop',
        userId: 999,
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserById.mockResolvedValue(null);

      // Act
      await listener.handleEventCreated(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      // Arrange
      const params = {
        eventId: 200,
        slug: 'typescript-workshop',
        userId: 100,
        tenantId: 'test-tenant',
      };

      const error = new Error('Database connection failed');
      eventQueryService.findEventBySlug.mockRejectedValue(error);

      // Act & Assert - Should not throw
      await expect(listener.handleEventCreated(params)).resolves.not.toThrow();
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should never expose private event details in sitewide feed', async () => {
      // Arrange
      const params = {
        eventId: 300,
        slug: 'private-event',
        userId: 100,
        tenantId: 'test-tenant',
      };

      const privateEvent: Partial<EventEntity> = {
        id: 300,
        slug: 'private-event',
        name: 'Secret Meeting',
        visibility: EventVisibility.Private,
        group: null, // standalone private event
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        privateEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleEventCreated(params);

      // Assert - Check privacy behavior
      const activities = activityFeedService.create.mock.calls.map(
        (call) => call[0],
      );

      // Behavior 1: Event feed should have full details for attendees
      const eventActivity = activities.find((a) => a.feedScope === 'event');
      expect(eventActivity).toBeDefined();
      expect(eventActivity.eventName).toBe('Secret Meeting'); // Attendees can see name

      // Behavior 2: Sitewide feed must NOT include private events
      const sitewideActivity = activities.find(
        (a) => a.feedScope === 'sitewide',
      );
      expect(sitewideActivity).toBeUndefined(); // Private events do not appear in sitewide feed
    });
  });

  describe('Firehose ingested event subscriptions', () => {
    function getEventNames(methodName: string): string[] {
      const metadata: Array<{ event: string }> = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        ActivityFeedListener.prototype[methodName],
      );
      return metadata ? metadata.map((m) => m.event) : [];
    }

    it('should handle event.ingested events for activity feed', () => {
      const eventNames = getEventNames('handleEventCreated');
      expect(eventNames).toContain('event.created');
      expect(eventNames).toContain('event.ingested');
    });

    it('should handle event.ingested.updated events for activity feed', () => {
      const eventNames = getEventNames('handleEventUpdated');
      expect(eventNames).toContain('event.updated');
      expect(eventNames).toContain('event.ingested.updated');
    });
  });

  describe('Tenant context propagation', () => {
    it('should register synthetic request with tenantId for each event', async () => {
      const params = {
        groupSlug: 'tech-talks',
        userSlug: 'sarah-chen',
        tenantId: 'firehose-tenant',
      };

      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      userService.getUserBySlug.mockResolvedValue(mockUser as UserEntity);

      await listener.handleGroupMemberAdded(params);

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        {
          tenantId: 'firehose-tenant',
          headers: { 'x-tenant-id': 'firehose-tenant' },
        },
        expect.anything(),
      );
    });
  });

  describe('handleAttendanceChanged', () => {
    const baseEvent: AttendanceChangedEvent = {
      status: 'going',
      previousStatus: null,
      eventUri: 'at://did:plc:abc/community.openmeet.event/123',
      eventId: 200,
      eventSlug: 'typescript-workshop',
      userUlid: 'user-ulid-123',
      userDid: 'did:plc:abc',
      tenantId: 'test-tenant',
    };

    it('should create activity for tenant event attendance change', async () => {
      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      (userService as any).findByUlid = jest
        .fn()
        .mockResolvedValue(mockUser as UserEntity);
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );

      await listener.handleAttendanceChanged(baseEvent);

      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          eventSlug: 'typescript-workshop',
          actorSlug: 'sarah-chen',
        }),
      );
    });

    it('should create activity for foreign event (eventId null) with eventUri', async () => {
      (userService as any).findByUlid = jest
        .fn()
        .mockResolvedValue(mockUser as UserEntity);

      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          feedScope: 'sitewide',
          actorSlug: 'sarah-chen',
        }),
      );
    });

    it('should include eventName in metadata for foreign event when Contrail lookup succeeds', async () => {
      (userService as any).findByUlid = jest
        .fn()
        .mockResolvedValue(mockUser as UserEntity);

      mockContrailQueryService.findByUri.mockResolvedValue({
        uri: 'at://did:plc:abc/community.openmeet.event/123',
        record: {
          name: 'ATProto Community Meetup',
          startsAt: '2026-05-01T10:00:00Z',
        },
      });

      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          feedScope: 'sitewide',
          metadata: expect.objectContaining({
            eventName: 'ATProto Community Meetup',
            eventUri: baseEvent.eventUri,
          }),
        }),
      );
    });

    it('should gracefully handle Contrail lookup failure for foreign event', async () => {
      (userService as any).findByUlid = jest
        .fn()
        .mockResolvedValue(mockUser as UserEntity);

      mockContrailQueryService.findByUri.mockRejectedValue(
        new Error('Contrail unavailable'),
      );

      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      // Should still create the activity, just without eventName
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          feedScope: 'sitewide',
        }),
      );
    });

    it('should not create activity when user is not found', async () => {
      (userService as any).findByUlid = jest.fn().mockResolvedValue(null);

      await listener.handleAttendanceChanged(baseEvent);

      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (userService as any).findByUlid = jest
        .fn()
        .mockRejectedValue(new Error('DB error'));

      await expect(
        listener.handleAttendanceChanged(baseEvent),
      ).resolves.not.toThrow();
    });

    it('should have @OnEvent(attendance.changed) decorator', () => {
      const metadata: Array<{ event: string }> = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        ActivityFeedListener.prototype['handleAttendanceChanged'],
      );
      expect(metadata).toBeDefined();
      expect(metadata.map((m) => m.event)).toContain('attendance.changed');
    });
  });
});
