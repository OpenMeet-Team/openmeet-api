import { Test, TestingModule } from '@nestjs/testing';
import { ActivityFeedListener } from './activity-feed.listener';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility } from '../core/constants/constant';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

describe('ActivityFeedListener', () => {
  let listener: ActivityFeedListener;
  let activityFeedService: jest.Mocked<ActivityFeedService>;
  let groupService: jest.Mocked<GroupService>;
  let userService: jest.Mocked<UserService>;
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
});
