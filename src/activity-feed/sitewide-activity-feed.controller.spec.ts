import { Test, TestingModule } from '@nestjs/testing';
import { SitewideActivityFeedController } from './sitewide-activity-feed.controller';
import { ActivityFeedService } from './activity-feed.service';
import { REQUEST } from '@nestjs/core';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';

describe('SitewideActivityFeedController', () => {
  let controller: SitewideActivityFeedController;
  let activityFeedService: jest.Mocked<ActivityFeedService>;

  const mockSitewideActivities: Partial<ActivityFeedEntity>[] = [
    {
      id: 1,
      ulid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
      activityType: 'group.created',
      feedScope: 'sitewide',
      groupId: 42,
      actorId: 100,
      actorIds: [100],
      visibility: 'public',
      aggregatedCount: 1,
      metadata: {
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        actorSlug: 'sarah-chen',
        actorName: 'Sarah Chen',
      },
      createdAt: new Date('2025-01-15T14:00:00Z'),
      updatedAt: new Date('2025-01-15T14:00:00Z'),
    },
    {
      id: 2,
      ulid: '01hqvxz6j8k9m0n1p2q3r4s5t7',
      activityType: 'group.milestone',
      feedScope: 'sitewide',
      groupId: 42,
      actorIds: [],
      visibility: 'public',
      aggregatedCount: 1,
      metadata: {
        groupSlug: 'tech-talks',
        groupName: 'Tech Talks',
        milestoneType: 'members',
        value: 100,
      },
      createdAt: new Date('2025-01-15T13:00:00Z'),
      updatedAt: new Date('2025-01-15T13:00:00Z'),
    },
  ];

  beforeEach(async () => {
    const mockRequest = {
      tenantId: 'test-tenant',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SitewideActivityFeedController],
      providers: [
        {
          provide: ActivityFeedService,
          useFactory: () => ({
            getSitewideFeed: jest.fn(),
          }),
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    controller = module.get<SitewideActivityFeedController>(
      SitewideActivityFeedController,
    );
    activityFeedService = module.get(
      ActivityFeedService,
    ) as jest.Mocked<ActivityFeedService>;

    jest.clearAllMocks();
  });

  describe('getSitewideFeed', () => {
    it('should return sitewide activities for guest users with public visibility only', async () => {
      // Arrange
      const mockRequest = { tenantId: 'test-tenant' }; // No user = guest
      activityFeedService.getSitewideFeed.mockResolvedValue(
        mockSitewideActivities as ActivityFeedEntity[],
      );

      // Act
      const result = await controller.getSitewideFeed({}, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        visibility: ['public'],
      });
      expect(result).toEqual(mockSitewideActivities);
    });

    it('should return sitewide activities for authenticated users with public + authenticated visibility', async () => {
      // Arrange
      const mockRequest = {
        tenantId: 'test-tenant',
        user: { id: 100 },
      }; // Has user = authenticated
      activityFeedService.getSitewideFeed.mockResolvedValue(
        mockSitewideActivities as ActivityFeedEntity[],
      );

      // Act
      const result = await controller.getSitewideFeed({}, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 20,
        offset: 0,
        visibility: ['public', 'authenticated'],
      });
      expect(result).toEqual(mockSitewideActivities);
    });

    it('should respect limit parameter when provided', async () => {
      // Arrange
      const mockRequest = { tenantId: 'test-tenant' };
      activityFeedService.getSitewideFeed.mockResolvedValue([]);

      // Act
      await controller.getSitewideFeed({ limit: 50 }, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        visibility: ['public'],
      });
    });

    it('should respect offset parameter for pagination', async () => {
      // Arrange
      const mockRequest = { tenantId: 'test-tenant' };
      activityFeedService.getSitewideFeed.mockResolvedValue([]);

      // Act - Get second page (skip first 20 items)
      await controller.getSitewideFeed({ offset: 20 }, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 20,
        offset: 20,
        visibility: ['public'],
      });
    });

    it('should handle offset and limit together for pagination', async () => {
      // Arrange
      const mockRequest = {
        tenantId: 'test-tenant',
        user: { id: 100 },
      };
      activityFeedService.getSitewideFeed.mockResolvedValue([]);

      // Act - Get third page with custom page size (skip 40, take 10)
      await controller.getSitewideFeed({ limit: 10, offset: 40 }, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 10,
        offset: 40,
        visibility: ['public', 'authenticated'],
      });
    });

    it('should handle large offset values', async () => {
      // Arrange
      const mockRequest = { tenantId: 'test-tenant' };
      activityFeedService.getSitewideFeed.mockResolvedValue([]);

      // Act - Request page far into results
      await controller.getSitewideFeed({ limit: 20, offset: 100 }, mockRequest);

      // Assert
      expect(activityFeedService.getSitewideFeed).toHaveBeenCalledWith({
        limit: 20,
        offset: 100,
        visibility: ['public'],
      });
    });

    it('should return empty array when no sitewide activities exist', async () => {
      // Arrange
      const mockRequest = { tenantId: 'test-tenant' };
      activityFeedService.getSitewideFeed.mockResolvedValue([]);

      // Act
      const result = await controller.getSitewideFeed({}, mockRequest);

      // Assert
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });
});
