import { Test, TestingModule } from '@nestjs/testing';
import { ActivityFeedService } from './activity-feed.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { Repository } from 'typeorm';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { GroupVisibility } from '../core/constants/constant';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';

describe('ActivityFeedService', () => {
  let service: ActivityFeedService;
  let repository: jest.Mocked<Repository<ActivityFeedEntity>>;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let handleCacheService: jest.Mocked<AtprotoHandleCacheService>;

  const mockActivity: Partial<ActivityFeedEntity> = {
    id: 1,
    ulid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
    activityType: 'member.joined',
    feedScope: 'group',
    groupId: 42,
    actorId: 100,
    actorIds: [100],
    visibility: 'public',
    aggregatedCount: 1,
    metadata: {},
    createdAt: new Date('2025-01-15T14:00:00Z'),
    updatedAt: new Date('2025-01-15T14:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockTenantService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
      }),
    };

    const mockHandleCacheService = {
      resolveHandle: jest.fn(),
      resolveHandles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
        {
          provide: AtprotoHandleCacheService,
          useValue: mockHandleCacheService,
        },
      ],
    }).compile();

    // Use resolve() for REQUEST-scoped providers
    service = await module.resolve<ActivityFeedService>(ActivityFeedService);
    tenantService = module.get(
      TenantConnectionService,
    ) as jest.Mocked<TenantConnectionService>;
    handleCacheService = module.get(
      AtprotoHandleCacheService,
    ) as jest.Mocked<AtprotoHandleCacheService>;

    // Get the repository after tenant connection is established
    const connection =
      await tenantService.getTenantConnection(TESTING_TENANT_ID);
    repository = connection.getRepository(ActivityFeedEntity) as jest.Mocked<
      Repository<ActivityFeedEntity>
    >;
  });

  describe('create()', () => {
    it('should create an activity with public visibility for public group', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Public,
      };

      repository.create.mockReturnValue(mockActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(mockActivity as ActivityFeedEntity);

      const result = await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'member.joined',
          feedScope: 'group',
          groupId: 42,
          actorId: 100,
          visibility: 'public',
          actorIds: [100],
          aggregatedCount: 1,
          metadata: expect.objectContaining({
            groupSlug: 'tech-talks',
            groupName: 'Tech Talks',
            actorSlug: 'sarah-chen',
            actorName: 'Sarah Chen',
          }),
        }),
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result.visibility).toBe('public');
    });

    it('should create an activity with members_only visibility for private group', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        actorId: 100,
        groupVisibility: GroupVisibility.Private,
      };

      const privateActivity = { ...mockActivity, visibility: 'members_only' };
      repository.create.mockReturnValue(privateActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(privateActivity as ActivityFeedEntity);

      const result = await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'members_only',
        }),
      );
      expect(result.visibility).toBe('members_only');
    });

    it('should create an activity with authenticated visibility for authenticated group', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        actorId: 100,
        groupVisibility: GroupVisibility.Authenticated,
      };

      const authActivity = { ...mockActivity, visibility: 'authenticated' };
      repository.create.mockReturnValue(authActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(authActivity as ActivityFeedEntity);

      const result = await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'authenticated',
        }),
      );
      expect(result.visibility).toBe('authenticated');
    });

    it('should initialize actor_ids with first actor', async () => {
      const params = {
        activityType: 'group.created',
        feedScope: 'sitewide' as const,
        actorId: 100,
        groupVisibility: GroupVisibility.Public,
      };

      repository.create.mockReturnValue(mockActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(mockActivity as ActivityFeedEntity);

      await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorIds: [100],
        }),
      );
    });

    it('should store slugs in metadata for frontend consumption', async () => {
      const params = {
        activityType: 'event.created',
        feedScope: 'group' as const,
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        eventId: 78,
        eventSlug: 'coffee-meetup',
        eventName: 'Coffee Meetup',
        actorId: 100,
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
        groupVisibility: GroupVisibility.Public,
      };

      repository.create.mockReturnValue(mockActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(mockActivity as ActivityFeedEntity);

      await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            groupSlug: 'tech-talks',
            groupName: 'Tech Talks',
            eventSlug: 'coffee-meetup',
            eventName: 'Coffee Meetup',
            actorSlug: 'sarah-chen',
            actorName: 'Sarah Chen',
          }),
        }),
      );
    });

    it('should merge custom metadata with slugs', async () => {
      const params = {
        activityType: 'group.milestone',
        feedScope: 'group' as const,
        groupId: 42,
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        groupVisibility: GroupVisibility.Public,
        metadata: {
          milestoneType: 'members',
          value: 50,
        },
      };

      repository.create.mockReturnValue(mockActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(mockActivity as ActivityFeedEntity);

      await service.create(params);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            groupSlug: 'tech-talks',
            groupName: 'Tech Talks',
            milestoneType: 'members',
            value: 50,
          }),
        }),
      );
    });
  });

  describe('create() with aggregation', () => {
    it('should aggregate duplicate activities within time window', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        actorId: 101,
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'time_window' as const,
        aggregationWindow: 60, // 1 hour
      };

      const existingActivity = {
        ...mockActivity,
        actorIds: [100],
        aggregatedCount: 1,
      } as ActivityFeedEntity;

      repository.findOne.mockResolvedValue(existingActivity);
      repository.save.mockResolvedValue({
        ...existingActivity,
        actorIds: [100, 101],
        aggregatedCount: 2,
      } as ActivityFeedEntity);

      const result = await service.create(params);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          aggregationKey: expect.stringContaining('member.joined:group:42'),
          createdAt: expect.any(Object), // MoreThan() matcher
        }),
      });
      expect(result.aggregatedCount).toBe(2);
      expect(result.actorIds).toContain(100);
      expect(result.actorIds).toContain(101);
    });

    it('should create new activity if no existing activity in time window', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        actorId: 100,
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'time_window' as const,
        aggregationWindow: 60,
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockActivity as ActivityFeedEntity);
      repository.save.mockResolvedValue(mockActivity as ActivityFeedEntity);

      const result = await service.create(params);

      expect(repository.create).toHaveBeenCalled();
      expect(result.aggregatedCount).toBe(1);
    });

    it('should not aggregate if actor already in actor_ids', async () => {
      const params = {
        activityType: 'member.joined',
        feedScope: 'group' as const,
        groupId: 42,
        actorId: 100, // Same actor
        groupVisibility: GroupVisibility.Public,
        aggregationStrategy: 'time_window' as const,
        aggregationWindow: 60,
      };

      const existingActivity = {
        ...mockActivity,
        actorIds: [100], // Already contains this actor
        aggregatedCount: 1,
      } as ActivityFeedEntity;

      repository.findOne.mockResolvedValue(existingActivity);

      const result = await service.create(params);

      expect(result.aggregatedCount).toBe(1); // Not incremented
      expect(result.actorIds).toHaveLength(1);
    });
  });

  describe('getGroupFeed()', () => {
    it('should return activities for a group', async () => {
      const activities = [mockActivity, { ...mockActivity, id: 2 }];
      repository.find.mockResolvedValue(activities as ActivityFeedEntity[]);

      const result = await service.getGroupFeed(42, {});

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          feedScope: 'group',
          groupId: 42,
        },
        relations: ['actor'],
        order: { updatedAt: 'DESC' },
        take: 20,
        skip: 0,
      });
      expect(result).toHaveLength(2);
    });

    it('should filter by visibility for guest users', async () => {
      repository.find.mockResolvedValue([mockActivity as ActivityFeedEntity]);

      await service.getGroupFeed(42, {
        visibility: ['public'],
        limit: 20,
      });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: expect.any(Object), // In(['public'])
          }),
          take: 20,
        }),
      );
    });

    it('should include members_only activities for members', async () => {
      repository.find.mockResolvedValue([mockActivity as ActivityFeedEntity]);

      await service.getGroupFeed(42, {
        visibility: ['public', 'members_only'],
      });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: expect.any(Object), // In(['public', 'members_only'])
          }),
        }),
      );
    });

    it('should respect limit parameter', async () => {
      repository.find.mockResolvedValue([mockActivity as ActivityFeedEntity]);

      await service.getGroupFeed(42, { limit: 10 });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    it('should respect offset parameter for pagination', async () => {
      repository.find.mockResolvedValue([mockActivity as ActivityFeedEntity]);

      await service.getGroupFeed(42, { limit: 10, offset: 20 });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('mapVisibility()', () => {
    it('should map Public to public', () => {
      const result = service.mapVisibility(GroupVisibility.Public);
      expect(result).toBe('public');
    });

    it('should map Authenticated to authenticated', () => {
      const result = service.mapVisibility(GroupVisibility.Authenticated);
      expect(result).toBe('authenticated');
    });

    it('should map Private to members_only', () => {
      const result = service.mapVisibility(GroupVisibility.Private);
      expect(result).toBe('members_only');
    });
  });

  describe('resolveDisplayNames() - Handle Resolution', () => {
    it('should resolve DID to handle for Bluesky shadow users', async () => {
      // Arrange
      const blueskyUser: Partial<UserEntity> = {
        id: 100,
        slug: 'alice-abc123',
        firstName: 'alice.bsky.social',
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:abc123',
      };

      const activity: Partial<ActivityFeedEntity> = {
        ...mockActivity,
        actorId: 100,
        actor: blueskyUser as UserEntity,
      };

      handleCacheService.resolveHandles.mockResolvedValue(
        new Map([['did:plc:abc123', 'alice.bsky.social']]),
      );

      // Act
      const result = await service.resolveDisplayNames([
        activity as ActivityFeedEntity,
      ]);

      // Assert
      expect(result[0].displayName).toBe('alice.bsky.social');
      expect(handleCacheService.resolveHandles).toHaveBeenCalledWith([
        'did:plc:abc123',
      ]);
    });

    it('should use firstName for regular email users', async () => {
      // Arrange
      const regularUser: Partial<UserEntity> = {
        id: 100,
        slug: 'sarah-chen',
        firstName: 'Sarah',
        lastName: 'Chen',
        provider: AuthProvidersEnum.email,
        socialId: null,
      };

      const activity: Partial<ActivityFeedEntity> = {
        ...mockActivity,
        actorId: 100,
        actor: regularUser as UserEntity,
      };

      // Act
      const result = await service.resolveDisplayNames([
        activity as ActivityFeedEntity,
      ]);

      // Assert
      expect(result[0].displayName).toBe('Sarah');
      expect(handleCacheService.resolveHandles).not.toHaveBeenCalled();
    });

    it('should batch resolve multiple unique Bluesky users', async () => {
      // Arrange
      const user1: Partial<UserEntity> = {
        id: 100,
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:alice123',
        firstName: 'alice.bsky.social',
      };

      const user2: Partial<UserEntity> = {
        id: 101,
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:bob456',
        firstName: 'bob.bsky.social',
      };

      const activities = [
        { ...mockActivity, id: 1, actorId: 100, actor: user1 as UserEntity },
        { ...mockActivity, id: 2, actorId: 101, actor: user2 as UserEntity },
        { ...mockActivity, id: 3, actorId: 100, actor: user1 as UserEntity },
      ];

      handleCacheService.resolveHandles.mockResolvedValue(
        new Map([
          ['did:plc:alice123', 'alice.bsky.social'],
          ['did:plc:bob456', 'bob.bsky.social'],
        ]),
      );

      // Act
      const result = await service.resolveDisplayNames(
        activities as ActivityFeedEntity[],
      );

      // Assert - Should batch resolve both DIDs in one call
      expect(handleCacheService.resolveHandles).toHaveBeenCalledTimes(1);
      expect(handleCacheService.resolveHandles).toHaveBeenCalledWith([
        'did:plc:alice123',
        'did:plc:bob456',
      ]);
      expect(result[0].displayName).toBe('alice.bsky.social');
      expect(result[1].displayName).toBe('bob.bsky.social');
      expect(result[2].displayName).toBe('alice.bsky.social');
    });

    it('should handle mix of Bluesky and regular users', async () => {
      // Arrange
      const blueskyUser: Partial<UserEntity> = {
        id: 100,
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:alice123',
        firstName: 'alice.bsky.social',
      };

      const regularUser: Partial<UserEntity> = {
        id: 101,
        provider: AuthProvidersEnum.email,
        firstName: 'Bob',
        socialId: null,
      };

      const activities = [
        { ...mockActivity, id: 1, actorId: 100, actor: blueskyUser as UserEntity },
        { ...mockActivity, id: 2, actorId: 101, actor: regularUser as UserEntity },
      ];

      handleCacheService.resolveHandles.mockResolvedValue(
        new Map([['did:plc:alice123', 'alice.bsky.social']]),
      );

      // Act
      const result = await service.resolveDisplayNames(
        activities as ActivityFeedEntity[],
      );

      // Assert
      expect(handleCacheService.resolveHandles).toHaveBeenCalledWith([
        'did:plc:alice123',
      ]);
      expect(result[0].displayName).toBe('alice.bsky.social');
      expect(result[1].displayName).toBe('Bob');
    });

    it('should fallback to DID if handle resolution fails', async () => {
      // Arrange
      const blueskyUser: Partial<UserEntity> = {
        id: 100,
        provider: AuthProvidersEnum.bluesky,
        socialId: 'did:plc:abc123',
        firstName: 'did:plc:abc123',
      };

      const activity: Partial<ActivityFeedEntity> = {
        ...mockActivity,
        actorId: 100,
        actor: blueskyUser as UserEntity,
      };

      // Mock returns DID as fallback (when resolution fails)
      handleCacheService.resolveHandles.mockResolvedValue(
        new Map([['did:plc:abc123', 'did:plc:abc123']]),
      );

      // Act
      const result = await service.resolveDisplayNames([
        activity as ActivityFeedEntity,
      ]);

      // Assert - Should use DID as fallback gracefully
      expect(result[0].displayName).toBe('did:plc:abc123');
    });

    it('should handle activities without actors', async () => {
      // Arrange
      const activity: Partial<ActivityFeedEntity> = {
        ...mockActivity,
        actorId: null,
        actor: undefined,
      };

      // Act
      const result = await service.resolveDisplayNames([
        activity as ActivityFeedEntity,
      ]);

      // Assert - Should handle missing actor gracefully
      expect(result[0].displayName).toBeUndefined();
      expect(handleCacheService.resolveHandles).not.toHaveBeenCalled();
    });

    it('should handle empty feed array', async () => {
      // Act
      const result = await service.resolveDisplayNames([]);

      // Assert
      expect(result).toEqual([]);
      expect(handleCacheService.resolveHandles).not.toHaveBeenCalled();
    });
  });
});
