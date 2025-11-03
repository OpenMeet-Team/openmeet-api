import { Test, TestingModule } from '@nestjs/testing';
import { ActivityFeedListener } from './activity-feed.listener';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility, EventVisibility } from '../core/constants/constant';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventQueryService } from '../event/services/event-query.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

describe('ActivityFeedListener', () => {
  let listener: ActivityFeedListener;
  let activityFeedService: jest.Mocked<ActivityFeedService>;
  let groupService: jest.Mocked<GroupService>;
  let userService: jest.Mocked<UserService>;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let mockRequest: any;

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
    visibility: GroupVisibility.Authenticated,
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
    mockRequest = {
      tenantId: 'test-tenant',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedListener,
        {
          provide: ActivityFeedService,
          useFactory: () => ({
            create: jest.fn(),
          }),
        },
        {
          provide: GroupService,
          useFactory: () => ({
            getGroupBySlug: jest.fn(),
          }),
        },
        {
          provide: UserService,
          useFactory: () => ({
            getUserBySlug: jest.fn(),
            getUserById: jest.fn(),
          }),
        },
        {
          provide: EventQueryService,
          useFactory: () => ({
            findEventBySlug: jest.fn(),
          }),
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    listener = module.get<ActivityFeedListener>(ActivityFeedListener);
    activityFeedService = module.get(
      ActivityFeedService,
    ) as jest.Mocked<ActivityFeedService>;
    groupService = module.get(GroupService) as jest.Mocked<GroupService>;
    userService = module.get(UserService) as jest.Mocked<UserService>;
    eventQueryService = module.get(
      EventQueryService,
    ) as jest.Mocked<EventQueryService>;

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

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledTimes(2);
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

    it('should create anonymized public activity for private group', async () => {
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

      // Assert - Second call should be anonymized activity
      expect(activityFeedService.create).toHaveBeenNthCalledWith(2, {
        activityType: 'group.activity',
        feedScope: 'sitewide',
        groupId: 43,
        groupSlug: 'secret-group',
        groupName: 'Secret Group',
        groupVisibility: GroupVisibility.Public, // Force public for sitewide
        metadata: {
          activityCount: 1,
        },
        aggregationStrategy: 'time_window',
        aggregationWindow: 60,
      });
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
        groupVisibility: GroupVisibility.Authenticated,
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
      const activities = activityFeedService.create.mock.calls.map(call => call[0]);

      // Behavior 1: Event page should show activity to attendees
      const eventActivity = activities.find(a => a.feedScope === 'event');
      expect(eventActivity).toMatchObject({
        activityType: 'event.created',
        feedScope: 'event',
        eventId: 200,
      });

      // Behavior 2: Sitewide feed should show activity for discovery
      const sitewideActivity = activities.find(a => a.feedScope === 'sitewide');
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
      const activities = activityFeedService.create.mock.calls.map(call => call[0]);

      // Should create event-scoped activity (not group-scoped)
      const eventActivity = activities.find(a => a.feedScope === 'event');
      expect(eventActivity).toBeDefined();
      expect(eventActivity.groupId).toBeUndefined();

      // Should also create sitewide activity
      const sitewideActivity = activities.find(a => a.feedScope === 'sitewide');
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
      const activities = activityFeedService.create.mock.calls.map(call => call[0]);

      // Behavior 1: Event feed should have full details for attendees
      const eventActivity = activities.find(a => a.feedScope === 'event');
      expect(eventActivity).toBeDefined();
      expect(eventActivity.eventName).toBe('Secret Meeting'); // Attendees can see name

      // Behavior 2: Sitewide feed must NOT expose private details
      const sitewideActivity = activities.find(a => a.feedScope === 'sitewide');
      expect(sitewideActivity).toBeDefined();
      expect(sitewideActivity.activityType).toBe('group.activity'); // Anonymized
      expect(sitewideActivity.eventName).toBeUndefined(); // No event name
      expect(sitewideActivity.eventSlug).toBeUndefined(); // No event slug
      expect(sitewideActivity.actorName).toBeUndefined(); // No creator name
      expect(sitewideActivity.metadata.activityDescription).toBe('A new event was created');
    });
  });

  describe('handleEventRsvpAdded', () => {
    it('should create group-scoped activity for group events', async () => {
      // Arrange
      const params = {
        eventSlug: 'typescript-workshop',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          feedScope: 'group',
          groupId: mockPublicGroup.id,
          groupSlug: mockPublicGroup.slug,
          groupName: mockPublicGroup.name,
          eventId: mockEvent.id,
          eventSlug: mockEvent.slug,
          eventName: mockEvent.name,
          actorId: mockUser.id,
          actorSlug: mockUser.slug,
          actorName: 'Sarah Chen',
          groupVisibility: mockPublicGroup.visibility,
          aggregationStrategy: 'time_window',
          aggregationWindow: 30,
        }),
      );
    });

    it('should create event-scoped activity for standalone events', async () => {
      // Arrange
      const params = {
        eventSlug: 'standalone-workshop',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      const standaloneEvent: Partial<EventEntity> = {
        id: 201,
        slug: 'standalone-workshop',
        name: 'Standalone Workshop',
        visibility: EventVisibility.Public,
        group: null, // No group - standalone event
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        standaloneEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'event.rsvp',
          feedScope: 'event',
          eventId: standaloneEvent.id,
          eventSlug: standaloneEvent.slug,
          eventName: standaloneEvent.name,
          actorId: mockUser.id,
          actorSlug: mockUser.slug,
          actorName: 'Sarah Chen',
          aggregationStrategy: 'time_window',
          aggregationWindow: 30,
        }),
      );

      // Should NOT have group fields
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          groupId: expect.anything(),
          groupSlug: expect.anything(),
          groupName: expect.anything(),
          groupVisibility: expect.anything(),
        }),
      );
    });

    it('should use 30-minute aggregation window for RSVP activities', async () => {
      // Arrange
      const params = {
        eventSlug: 'typescript-workshop',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregationStrategy: 'time_window',
          aggregationWindow: 30,
        }),
      );
    });

    it('should not create activity when event is not found', async () => {
      // Arrange
      const params = {
        eventSlug: 'non-existent-event',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(null);

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should not create activity when user is not found', async () => {
      // Arrange
      const params = {
        eventSlug: 'typescript-workshop',
        userId: 999,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(null);

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should not create activity when group is not found for group events', async () => {
      // Arrange
      const params = {
        eventSlug: 'typescript-workshop',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      eventQueryService.findEventBySlug.mockResolvedValue(
        mockEvent as EventEntity,
      );
      userService.getUserById.mockResolvedValue(mockUser as UserEntity);
      groupService.getGroupBySlug.mockResolvedValue(null);

      // Act
      await listener.handleEventRsvpAdded(params);

      // Assert
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      // Arrange
      const params = {
        eventSlug: 'typescript-workshop',
        userId: 100,
        status: 'confirmed',
        tenantId: 'test-tenant',
      };

      const error = new Error('Database connection failed');
      eventQueryService.findEventBySlug.mockRejectedValue(error);

      // Act & Assert - Should not throw
      await expect(
        listener.handleEventRsvpAdded(params),
      ).resolves.not.toThrow();
      expect(activityFeedService.create).not.toHaveBeenCalled();
    });
  });
});
