import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository, MoreThan, In } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { GroupVisibility, EventVisibility } from '../core/constants/constant';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class ActivityFeedService {
  private activityFeedRepository: Repository<ActivityFeedEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly atprotoHandleCache: AtprotoHandleCacheService,
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
        return await this.aggregateIntoExisting(
          existingActivity,
          params.actorId,
        );
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
      offset?: number;
      visibility?: string[];
    } = {},
  ): Promise<Array<ActivityFeedEntity & { displayName?: string }>> {
    await this.getTenantRepository();

    const queryOptions: any = {
      where: {
        feedScope: 'group',
        groupId,
      },
      relations: ['actor'],
      order: { updatedAt: 'DESC' },
      take: options.limit || 20,
      skip: options.offset || 0,
    };

    if (options.visibility) {
      queryOptions.where.visibility = In(options.visibility);
    }

    const activities = await this.activityFeedRepository.find(queryOptions);
    return await this.resolveDisplayNames(activities);
  }

  /**
   * Get feed for a specific event
   * Returns activities from both standalone events (feedScope='event')
   * and group events (feedScope='group')
   */
  async getEventFeed(
    eventId: number,
    options: {
      limit?: number;
      offset?: number;
      visibility?: string[];
    } = {},
  ): Promise<Array<ActivityFeedEntity & { displayName?: string }>> {
    await this.getTenantRepository();

    // Build where conditions for both standalone and group events
    const whereConditions: any[] = [
      { feedScope: 'event', eventId }, // Standalone events
      { feedScope: 'group', eventId }, // Group events
    ];

    // Add visibility filter if provided
    if (options.visibility) {
      whereConditions[0].visibility = In(options.visibility);
      whereConditions[1].visibility = In(options.visibility);
    }

    const queryOptions: any = {
      where: whereConditions,
      relations: ['actor'],
      order: { updatedAt: 'DESC' },
      take: options.limit || 20,
      skip: options.offset || 0,
    };

    const activities = await this.activityFeedRepository.find(queryOptions);
    return await this.resolveDisplayNames(activities);
  }

  /**
   * Get sitewide feed (discovery feed)
   * Shows activities from public groups and anonymized activities from private groups
   */
  async getSitewideFeed(
    options: {
      limit?: number;
      offset?: number;
      visibility?: string[];
    } = {},
  ): Promise<Array<ActivityFeedEntity & { displayName?: string }>> {
    await this.getTenantRepository();

    const queryOptions: any = {
      where: {
        feedScope: 'sitewide',
      },
      relations: ['actor'],
      order: { updatedAt: 'DESC' },
      take: options.limit || 20,
      skip: options.offset || 0,
    };

    // Apply visibility filtering
    // Guests see only 'public', authenticated users see 'public' + 'authenticated'
    if (options.visibility) {
      queryOptions.where.visibility = In(options.visibility);
    }

    const activities = await this.activityFeedRepository.find(queryOptions);
    return await this.resolveDisplayNames(activities);
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
      case GroupVisibility.Unlisted:
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

  /**
   * Resolve display names for activity feed actors
   * - For Bluesky shadow users: Resolve DID → handle using cache
   * - For regular users: Use firstName
   * - Batch resolution for performance
   */
  async resolveDisplayNames(
    activities: ActivityFeedEntity[],
  ): Promise<Array<ActivityFeedEntity & { displayName?: string }>> {
    if (!activities.length) {
      return [];
    }

    // Collect unique DIDs that need resolution
    const didsToResolve = new Set<string>();
    const userCache = new Map<number, string>(); // userId -> displayName

    for (const activity of activities) {
      if (!activity.actor) continue;

      const user = activity.actor;

      // Skip if we've already processed this user
      if (userCache.has(user.id)) continue;

      // Check if this is a Bluesky user with a DID
      if (
        user.provider === AuthProvidersEnum.bluesky &&
        user.socialId?.startsWith('did:')
      ) {
        didsToResolve.add(user.socialId);
      } else {
        // For regular users, use firstName
        userCache.set(user.id, user.firstName || '');
      }
    }

    // Batch resolve all DIDs if any
    if (didsToResolve.size > 0) {
      const resolvedHandles = await this.atprotoHandleCache.resolveHandles(
        Array.from(didsToResolve),
      );

      // Populate cache with resolved handles
      for (const activity of activities) {
        if (!activity.actor) continue;
        const user = activity.actor;

        if (
          user.provider === AuthProvidersEnum.bluesky &&
          user.socialId?.startsWith('did:')
        ) {
          const handle = resolvedHandles.get(user.socialId);
          if (handle) {
            userCache.set(user.id, handle);
          }
        }
      }
    }

    // Return activities with resolved display names
    return activities.map((activity) => {
      const displayName = activity.actor
        ? userCache.get(activity.actor.id)
        : undefined;
      return Object.assign(activity, { displayName });
    });
  }
}
