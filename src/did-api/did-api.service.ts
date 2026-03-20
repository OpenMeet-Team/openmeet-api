import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { Not } from 'typeorm';
import { DIDEventsQueryDto } from './dto/did-events-query.dto';
import {
  EventVisibility,
  EventStatus,
  EventAttendeeStatus,
} from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST })
export class DIDApiService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService,
  ) {}

  private buildImageUrl(image: any): string | null {
    if (!image?.path) return null;
    const cloudfrontDomain = this.configService.get<string>(
      'file.cloudfrontDistributionDomain',
      { infer: true },
    );
    const fileDriver = this.configService.get<string>('file.driver', {
      infer: true,
    });
    if (fileDriver === 'cloudfront' && cloudfrontDomain) {
      return `https://${cloudfrontDomain}/${image.path}`;
    }
    const backendDomain = this.configService.get<string>('app.backendDomain', {
      infer: true,
    });
    const separator = image.path.startsWith('/') ? '' : '/';
    return `${backendDomain}${separator}${image.path}`;
  }

  private async getRepositories() {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required');
    }
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    return {
      groupRepo: dataSource.getRepository(GroupEntity),
      groupMemberRepo: dataSource.getRepository(GroupMemberEntity),
      eventRepo: dataSource.getRepository(EventEntity),
      eventAttendeeRepo: dataSource.getRepository(EventAttendeesEntity),
    };
  }

  /**
   * Get all groups the user belongs to, with role and counts.
   */
  async getMyGroups(userId: number) {
    const { groupRepo, eventRepo } = await this.getRepositories();

    const groups = await groupRepo
      .createQueryBuilder('group')
      .innerJoinAndSelect('group.groupMembers', 'gm', 'gm.userId = :userId', {
        userId,
      })
      .leftJoinAndSelect('gm.groupRole', 'groupRole')
      .leftJoinAndSelect('group.image', 'image')
      .loadRelationCountAndMap('group.groupMembersCount', 'group.groupMembers')
      .getMany();

    // Batch upcoming event counts for all groups in one query
    const groupIds = groups.map((g) => g.id);
    let upcomingCountMap: Record<number, number> = {};
    if (groupIds.length > 0) {
      const counts = await eventRepo
        .createQueryBuilder('event')
        .select('event.groupId', 'groupId')
        .addSelect('COUNT(event.id)', 'count')
        .where('event.groupId IN (:...groupIds)', { groupIds })
        .andWhere('event.startDate > :now', { now: new Date() })
        .andWhere('event.status = :status', {
          status: EventStatus.Published,
        })
        .groupBy('event.groupId')
        .getRawMany();

      upcomingCountMap = counts.reduce(
        (map, row) => {
          map[row.groupId] = parseInt(row.count, 10);
          return map;
        },
        {} as Record<number, number>,
      );
    }

    // The groupRole is already loaded via leftJoinAndSelect on the joined gm.
    // TypeORM hydrates gm.groupRole on the GroupMemberEntity relation.
    // Since we innerJoin'd on groupMembers with the user filter, each group's
    // groupMembers array contains only the current user's membership.
    const result = groups.map((group) => {
      // groupMembers was joined (innerJoin) but not selected with AndSelect,
      // however groupRole was leftJoinAndSelect'd through gm.
      // We need to get the role from the raw query result.
      // Since the join filters to this user only, groupMembers[0] is their membership.
      const membership = (group as any).groupMembers?.[0];
      const roleName = membership?.groupRole?.name;

      return {
        slug: group.slug,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        role: roleName || 'member',
        memberCount: (group as any).groupMembersCount || 0,
        upcomingEventCount: upcomingCountMap[group.id] || 0,
        image: this.buildImageUrl(group.image),
      };
    });

    return { groups: result };
  }

  /**
   * Get events the authenticated user has access to.
   *
   * Core logic:
   * - Private/unlisted events in groups the user is a member of
   * - Events the user is attending (any visibility)
   * - If includePublic=true, also include public events user is attending
   */
  async getMyEvents(userId: number, query: DIDEventsQueryDto) {
    const { eventRepo } = await this.getRepositories();

    const limit = query.limit || 50;
    const fromDate = query.fromDate ? new Date(query.fromDate) : new Date();
    const toDate = query.toDate
      ? new Date(query.toDate)
      : new Date(Date.now() + 90 * 86400000);
    const includePublic = query.includePublic || false;

    // Build the query using raw table joins to avoid TypeORM metadata errors.
    // groupMembers is joined as a raw table, so groupRoles must also be raw.
    const qb = eventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.group', 'eventGroup')
      .leftJoinAndSelect('event.image', 'image')
      .leftJoin(
        'groupMembers',
        'gm',
        'gm.groupId = eventGroup.id AND gm.userId = :userId',
        { userId },
      )
      .leftJoin('groupRoles', 'groupRole', 'groupRole.id = gm.groupRoleId')
      .leftJoin(
        'eventAttendees',
        'ea',
        'ea.eventId = event.id AND ea.userId = :userId AND ea.status != :rejectedStatus',
        { userId, rejectedStatus: EventAttendeeStatus.Rejected },
      )
      .addSelect('groupRole.name', 'userGroupRole')
      .addSelect('ea.status', 'userRsvpStatus')
      .where('event.status = :publishedStatus', {
        publishedStatus: EventStatus.Published,
      })
      .andWhere('event.startDate >= :fromDate', { fromDate })
      .andWhere('event.startDate <= :toDate', { toDate });

    // Core visibility filter
    const nonPublicVisibilities = [
      EventVisibility.Private,
      EventVisibility.Unlisted,
    ];

    if (includePublic) {
      // Private/unlisted in my groups OR anything I'm attending
      qb.andWhere(
        '(' +
          '(event.visibility IN (:...nonPublicVisibilities) AND gm.id IS NOT NULL) ' +
          'OR (ea.id IS NOT NULL)' +
          ')',
        { nonPublicVisibilities },
      );
    } else {
      // Non-public events where user has access via group membership or attendance
      qb.andWhere(
        '(' +
          'event.visibility IN (:...nonPublicVisibilities) ' +
          'AND (gm.id IS NOT NULL OR ea.id IS NOT NULL)' +
          ')',
        { nonPublicVisibilities },
      );
    }

    // Filter by group if specified
    if (query.groupSlug) {
      qb.andWhere('eventGroup.slug = :groupSlug', {
        groupSlug: query.groupSlug,
      });
    }

    // Cursor-based pagination: cursor is base64-encoded JSON with id and startDate
    if (query.cursor) {
      const decoded = this.decodeCursor(query.cursor);
      if (decoded) {
        qb.andWhere(
          '(event.startDate > :cursorDate OR (event.startDate = :cursorDate AND event.id > :cursorId))',
          { cursorDate: decoded.startDate, cursorId: decoded.id },
        );
      }
    }

    qb.orderBy('event.startDate', 'ASC').addOrderBy('event.id', 'ASC');

    // Fetch one extra to determine if there's a next page
    qb.take(limit + 1);

    // Use getRawMany to get correct addSelect aliases.
    // getRawAndEntities returns raw keys as tableAlias_columnName which breaks aliases.
    const rawResults = await qb.getRawMany();

    // Separate entities from raw: we need to reconstruct from raw rows
    // since getRawMany flattens everything. The entity columns use the
    // event_ prefix from the main alias.
    const hasMore = rawResults.length > limit;
    if (hasMore) {
      rawResults.pop();
    }

    // Determine cursor for next page
    let nextCursor: string | null = null;
    if (hasMore && rawResults.length > 0) {
      const lastRaw = rawResults[rawResults.length - 1];
      nextCursor = this.encodeCursor(lastRaw.event_id, lastRaw.event_startDate);
    }

    // Build attendee count map
    const eventIds = rawResults.map((r) => r.event_id).filter(Boolean);
    let attendeeCountMap: Record<number, number> = {};
    if (eventIds.length > 0) {
      const attendeeCounts = await eventRepo
        .createQueryBuilder('event')
        .select('event.id', 'eventId')
        .addSelect('COUNT(attendee.id)', 'count')
        .leftJoin('event.attendees', 'attendee')
        .where('event.id IN (:...eventIds)', { eventIds })
        .andWhere('attendee.status = :confirmedStatus', {
          confirmedStatus: EventAttendeeStatus.Confirmed,
        })
        .groupBy('event.id')
        .getRawMany();

      attendeeCountMap = attendeeCounts.reduce(
        (map, row) => {
          map[row.eventId] = parseInt(row.count, 10);
          return map;
        },
        {} as Record<number, number>,
      );
    }

    // Map raw rows to response shape
    const mappedEvents = rawResults.map((raw) => {
      const hasGroup = raw.eventGroup_id != null;
      return {
        slug: raw.event_slug,
        name: raw.event_name,
        description: raw.event_description,
        startDate: raw.event_startDate,
        endDate: raw.event_endDate,
        location: raw.event_location || null,
        locationOnline: raw.event_locationOnline || null,
        type: raw.event_type,
        visibility: raw.event_visibility,
        status: raw.event_status,
        atprotoUri: raw.event_atprotoUri || null,
        group: hasGroup
          ? {
              slug: raw.eventGroup_slug,
              name: raw.eventGroup_name,
              role: raw.userGroupRole || null,
            }
          : null,
        attendeesCount: attendeeCountMap[raw.event_id] || 0,
        userRsvpStatus: raw.userRsvpStatus || null,
        image: this.buildImageUrl(
          raw.image_id ? { path: raw.image_path } : null,
        ),
      };
    });

    return {
      events: mappedEvents,
      cursor: nextCursor,
    };
  }

  /**
   * Encode cursor as base64 JSON containing id and startDate.
   */
  private encodeCursor(id: number, startDate: Date | string): string {
    const dateStr =
      startDate instanceof Date ? startDate.toISOString() : startDate;
    return Buffer.from(JSON.stringify({ id, startDate: dateStr })).toString(
      'base64',
    );
  }

  /**
   * Decode cursor from base64 JSON. Returns null if invalid.
   */
  private decodeCursor(
    cursor: string,
  ): { id: number; startDate: string } | null {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf-8'),
      );
      if (
        typeof decoded.id === 'number' &&
        typeof decoded.startDate === 'string'
      ) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get a single event by slug, with permission check.
   */
  async getEventBySlug(userId: number, slug: string) {
    const { eventRepo } = await this.getRepositories();

    const event = await eventRepo.findOne({
      where: { slug },
      relations: ['group', 'image'],
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check access: public events are always accessible
    if (event.visibility === EventVisibility.Public) {
      return this.mapEventDetail(event, userId);
    }

    // For non-public events, check group membership or attendance
    const hasAccess = await this.userHasEventAccess(userId, event);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this event');
    }

    return this.mapEventDetail(event, userId);
  }

  private async userHasEventAccess(
    userId: number,
    event: EventEntity,
  ): Promise<boolean> {
    const { groupMemberRepo, eventAttendeeRepo } = await this.getRepositories();

    // Check if user is attending this event (rejected users are excluded)
    const attendance = await eventAttendeeRepo.findOne({
      where: {
        event: { id: event.id },
        user: { id: userId },
        status: Not(EventAttendeeStatus.Rejected),
      },
    });
    if (attendance) return true;

    // Check if user is a member of the event's group
    if (event.group) {
      const membership = await groupMemberRepo.findOne({
        where: {
          group: { id: event.group.id },
          user: { id: userId },
        },
      });
      if (membership) return true;
    }

    return false;
  }

  private async mapEventDetail(event: EventEntity, userId: number) {
    const { groupMemberRepo, eventAttendeeRepo } = await this.getRepositories();

    // Get user's group role if event is in a group
    let groupRole: string | null = null;
    if (event.group) {
      const membership = await groupMemberRepo.findOne({
        where: {
          group: { id: event.group.id },
          user: { id: userId },
        },
        relations: ['groupRole'],
      });
      groupRole = membership?.groupRole?.name || null;
    }

    // Get user's RSVP status
    const attendance = await eventAttendeeRepo.findOne({
      where: {
        event: { id: event.id },
        user: { id: userId },
      },
    });

    // Get attendee count
    const attendeesCount = await eventAttendeeRepo.count({
      where: {
        event: { id: event.id },
        status: EventAttendeeStatus.Confirmed,
      },
    });

    return {
      slug: event.slug,
      name: event.name,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location || null,
      locationOnline: event.locationOnline || null,
      type: event.type,
      visibility: event.visibility,
      status: event.status,
      atprotoUri: event.atprotoUri || null,
      group: event.group
        ? {
            slug: event.group.slug,
            name: event.group.name,
            role: groupRole,
          }
        : null,
      attendeesCount,
      userRsvpStatus: attendance?.status || null,
      image: this.buildImageUrl(event.image),
    };
  }
}
