import { Test, TestingModule } from '@nestjs/testing';
import { GroupActivityFeedController } from './activity-feed.controller';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility } from '../core/constants/constant';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';

describe('GroupActivityFeedController', () => {
  let controller: GroupActivityFeedController;
  let activityFeedService: jest.Mocked<ActivityFeedService>;
  let groupService: jest.Mocked<GroupService>;

  const mockActivities: Partial<ActivityFeedEntity>[] = [
    {
      id: 1,
      ulid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
      activityType: 'member.joined',
      feedScope: 'group',
      groupId: 42,
      actorId: 100,
      actorIds: [100, 101, 102],
      visibility: 'public',
      aggregatedCount: 3,
      metadata: {
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
      },
      createdAt: new Date('2025-01-15T14:00:00Z'),
      updatedAt: new Date('2025-01-15T15:00:00Z'),
    },
    {
      id: 2,
      ulid: '01hqvxz6j8k9m0n1p2q3r4s5t7',
      activityType: 'event.created',
      feedScope: 'group',
      groupId: 42,
      actorId: 100,
      actorIds: [100],
      visibility: 'public',
      aggregatedCount: 1,
      metadata: {
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        eventSlug: 'coffee-meetup',
        eventName: 'Coffee Meetup',
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
      },
      createdAt: new Date('2025-01-15T13:00:00Z'),
      updatedAt: new Date('2025-01-15T13:00:00Z'),
    },
  ];

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

  beforeEach(async () => {
    const mockRequest = {
      tenantId: 'test-tenant',
      user: { id: 100 },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupActivityFeedController],
      providers: [
        {
          provide: ActivityFeedService,
          useFactory: () => ({
            getGroupFeed: jest.fn(),
          }),
        },
        {
          provide: GroupService,
          useFactory: () => ({
            getGroupBySlug: jest.fn(),
          }),
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    controller = module.get<GroupActivityFeedController>(
      GroupActivityFeedController,
    );
    activityFeedService = module.get(
      ActivityFeedService,
    ) as jest.Mocked<ActivityFeedService>;
    groupService = module.get(GroupService) as jest.Mocked<GroupService>;

    jest.clearAllMocks();
  });

  describe('getGroupFeed', () => {
    it('should return activities for a public group with default parameters', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue(
        mockActivities as ActivityFeedEntity[],
      );

      // Act
      const result = await controller.getGroupFeed('tech-talks', {});

      // Assert
      expect(groupService.getGroupBySlug).toHaveBeenCalledWith('tech-talks');
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 10,
        offset: 0,
      });
      expect(result).toEqual(mockActivities);
    });

    it('should respect limit parameter when provided', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act
      await controller.getGroupFeed('tech-talks', { limit: 20 });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 20,
        offset: 0,
      });
    });

    it('should filter by public visibility for guest users', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act
      await controller.getGroupFeed('tech-talks', {
        visibility: ['public'],
      });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 10,
        offset: 0,
        visibility: ['public'],
      });
    });

    it('should include members_only activities when visibility filter includes it', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPrivateGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act
      await controller.getGroupFeed('secret-group', {
        visibility: ['public', 'members_only'],
      });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(43, {
        limit: 10,
        offset: 0,
        visibility: ['public', 'members_only'],
      });
    });

    it('should throw error when group is not found', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.getGroupFeed('non-existent', {}),
      ).rejects.toThrow();
    });

    it('should handle comma-separated visibility values', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act - Testing that the Transform decorator works
      await controller.getGroupFeed('tech-talks', {
        visibility: ['public', 'authenticated'],
      });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 10,
        offset: 0,
        visibility: ['public', 'authenticated'],
      });
    });

    it('should respect offset parameter for pagination', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act - Get second page (skip first 10 items)
      await controller.getGroupFeed('tech-talks', { offset: 10 });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 10,
        offset: 10,
      });
    });

    it('should handle offset and limit together for pagination', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act - Get third page with custom page size (skip 40, take 10)
      await controller.getGroupFeed('tech-talks', {
        limit: 10,
        offset: 40,
      });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 10,
        offset: 40,
      });
    });

    it('should handle large offset values', async () => {
      // Arrange
      groupService.getGroupBySlug.mockResolvedValue(
        mockPublicGroup as GroupEntity,
      );
      activityFeedService.getGroupFeed.mockResolvedValue([]);

      // Act - Request page far into results
      await controller.getGroupFeed('tech-talks', {
        limit: 20,
        offset: 100,
      });

      // Assert
      expect(activityFeedService.getGroupFeed).toHaveBeenCalledWith(42, {
        limit: 20,
        offset: 100,
      });
    });
  });
});
