import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository, MoreThan, In } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { GroupVisibility, EventVisibility } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class ActivityFeedService {
  private activityFeedRepository: Repository<ActivityFeedEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.activityFeedRepository = dataSource.getRepository(ActivityFeedEntity);
  }

  /**
   * Create activity with smart aggregation
   */
  async create(params: {
    activityType: string;
    feedScope: 'sitewide' | 'group' | 'event';
    groupId?: number;
    groupSlug?: string;
    groupName?: string;
    eventId?: number;
    eventSlug?: string;
    eventName?: string;
    actorId?: number;
    actorSlug?: string;
    actorName?: string;
    groupVisibility?: GroupVisibility | EventVisibility;
    metadata?: Record<string, any>;
    aggregationStrategy?: 'time_window' | 'daily' | 'none';
    aggregationWindow?: number; // minutes
  }): Promise<ActivityFeedEntity> {
    await this.getTenantRepository();

    // Compute visibility from parent entity
    const visibility = params.groupVisibility
      ? this.mapVisibility(params.groupVisibility)
      : 'public';

    const strategy = params.aggregationStrategy || 'none';

    // Handle aggregation
    if (strategy === 'time_window' && params.aggregationWindow) {
      const aggregationKey = this.buildTimeWindowKey(params);
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - params.aggregationWindow);

      const existingActivity = await this.activityFeedRepository.findOne({
        where: {
          aggregationKey,
          createdAt: MoreThan(cutoffTime),
        },
      });

      if (existingActivity) {
        return await this.aggregateIntoExisting(existingActivity, params.actorId);
      }

      // Create new aggregated entry
      return await this.createNewEntry({
        ...params,
        visibility,
        aggregationKey,
        actorIds: params.actorId ? [params.actorId] : [],
        metadata: this.buildMetadata(params),
      });
    }

    // No aggregation - create single entry
    return await this.createNewEntry({
      ...params,
      visibility,
      actorIds: params.actorId ? [params.actorId] : [],
      metadata: this.buildMetadata(params),
    });
  }

  /**
   * Get feed for a specific group
   */
  async getGroupFeed(
    groupId: number,
    options: {
      limit?: number;
      visibility?: string[];
    } = {},
  ): Promise<ActivityFeedEntity[]> {
    await this.getTenantRepository();

    const queryOptions: any = {
      where: {
        feedScope: 'group',
        groupId,
      },
      order: { updatedAt: 'DESC' },
      take: options.limit || 50,
    };

    if (options.visibility) {
      queryOptions.where.visibility = In(options.visibility);
    }

    return await this.activityFeedRepository.find(queryOptions);
  }

  /**
   * Map entity visibility to activity visibility
   * This is the ONLY way to set activity visibility
   */
  mapVisibility(
    entityVisibility: GroupVisibility | EventVisibility,
  ): 'public' | 'authenticated' | 'members_only' {
    switch (entityVisibility) {
      case GroupVisibility.Public:
        return 'public';
      case GroupVisibility.Authenticated:
        return 'authenticated';
      case GroupVisibility.Private:
        return 'members_only';
      default:
        return 'public';
    }
  }

  /**
   * Create a new feed entry
   */
  private async createNewEntry(params: any): Promise<ActivityFeedEntity> {
    const activity = this.activityFeedRepository.create({
      activityType: params.activityType,
      feedScope: params.feedScope,
      groupId: params.groupId,
      eventId: params.eventId,
      actorId: params.actorId,
      actorIds: params.actorIds || [],
      visibility: params.visibility || 'public',
      metadata: params.metadata || {},
      aggregationKey: params.aggregationKey || null,
      aggregationStrategy: params.aggregationStrategy || 'none',
      aggregatedCount: 1,
    });

    return await this.activityFeedRepository.save(activity);
  }

  /**
   * Add actor to existing aggregated entry
   */
  private async aggregateIntoExisting(
    existingActivity: ActivityFeedEntity,
    actorId?: number,
  ): Promise<ActivityFeedEntity> {
    // Avoid duplicates
    if (actorId && existingActivity.actorIds.includes(actorId)) {
      return existingActivity;
    }

    if (actorId) {
      existingActivity.actorIds.push(actorId);
    }
    existingActivity.aggregatedCount = existingActivity.actorIds.length;
    existingActivity.updatedAt = new Date();

    return await this.activityFeedRepository.save(existingActivity);
  }

  /**
   * Build aggregation key for time window strategy
   */
  private buildTimeWindowKey(params: any): string {
    const now = new Date();
    const windowMinutes = params.aggregationWindow || 60;

    // Round down to nearest window
    const windowStart = new Date(
      Math.floor(now.getTime() / (windowMinutes * 60 * 1000)) *
        (windowMinutes * 60 * 1000),
    );

    const timestamp = windowStart.toISOString().slice(0, 13); // "2025-01-15T14"

    return `${params.activityType}:${params.feedScope}:${params.groupId || params.eventId}:${timestamp}`;
  }

  /**
   * Build metadata with slugs for frontend consumption
   * Stores slugs/names so frontend doesn't need to JOIN
   */
  private buildMetadata(params: any): Record<string, any> {
    const metadata: Record<string, any> = {
      ...(params.metadata || {}),
    };

    // Add group slugs if present
    if (params.groupSlug) {
      metadata.groupSlug = params.groupSlug;
    }
    if (params.groupName) {
      metadata.groupName = params.groupName;
    }

    // Add event slugs if present
    if (params.eventSlug) {
      metadata.eventSlug = params.eventSlug;
    }
    if (params.eventName) {
      metadata.eventName = params.eventName;
    }

    // Add actor slugs if present
    if (params.actorSlug) {
      metadata.actorSlug = params.actorSlug;
    }
    if (params.actorName) {
      metadata.actorName = params.actorName;
    }

    return metadata;
  }

  /**
   * TODO: Refresh metadata when entity slugs change (planned feature)
   *
   * Will be called when slug renaming is implemented:
   * - Listen for 'group.slug.changed' event
   * - Listen for 'event.slug.changed' event
   * - Listen for 'user.slug.changed' event
   * - Batch update all activities with new slugs/names
   *
   * Example implementation:
   *
   * async refreshGroupMetadata(groupId: number, updates: { groupSlug?: string, groupName?: string }) {
   *   await this.activityFeedRepository
   *     .createQueryBuilder()
   *     .update()
   *     .set({
   *       metadata: () => `
   *         jsonb_set(
   *           jsonb_set(metadata, '{groupSlug}', '"${updates.groupSlug}"'),
   *           '{groupName}', '"${updates.groupName}"'
   *         )
   *       `
   *     })
   *     .where('groupId = :groupId', { groupId })
   *     .execute();
   * }
   */
}
