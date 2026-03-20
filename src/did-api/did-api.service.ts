import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
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
  ) {}

  private async getRepositories() {
    const tenantId = this.request.tenantId;
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
    const { groupRepo } = await this.getRepositories();

    const groups = await groupRepo
      .createQueryBuilder('group')
      .innerJoin('group.groupMembers', 'gm')
      .innerJoin('gm.user', 'user', 'user.id = :userId', { userId })
      .leftJoinAndSelect('gm.groupRole', 'groupRole')
      .leftJoinAndSelect('group.image', 'image')
      .loadRelationCountAndMap('group.groupMembersCount', 'group.groupMembers')
      .getMany();

    // For each group, find the user's membership to get their role
    // The groupMembers relation was joined but not selected, so we query separately
    const result = await Promise.all(
      groups.map(async (group) => {
        // Get the user's membership for this group
        const { groupMemberRepo } = await this.getRepositories();
        const membership = await groupMemberRepo
          .createQueryBuilder('gm')
          .leftJoinAndSelect('gm.groupRole', 'groupRole')
          .innerJoin('gm.user', 'user', 'user.id = :userId', { userId })
          .innerJoin('gm.group', 'group', 'group.id = :groupId', {
            groupId: group.id,
          })
          .getOne();

        // Count upcoming events for this group
        const { eventRepo } = await this.getRepositories();
        const upcomingEventCount = await eventRepo
          .createQueryBuilder('event')
          .where('event.group = :groupId', { groupId: group.id })
          .andWhere('event.startDate > :now', { now: new Date() })
          .andWhere('event.status = :status', {
            status: EventStatus.Published,
          })
          .getCount();

        return {
          slug: group.slug,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          role: membership?.groupRole?.name || 'member',
          memberCount: (group as any).groupMembersCount || 0,
          upcomingEventCount,
          image: group.image || null,
        };
      }),
    );

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

    // Build the query using a union-like approach via OR conditions
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
      .leftJoin('gm.groupRole', 'groupRole')
      .leftJoin(
        'eventAttendees',
        'ea',
        'ea.eventId = event.id AND ea.userId = :userId',
        { userId },
      )
      .addSelect('groupRole.name', 'userGroupRole')
      .addSelect('ea.status', 'userRsvpStatus')
      .where('event.status = :publishedStatus', {
        publishedStatus: EventStatus.Published,
      })
      .andWhere('event.startDate >= :fromDate', { fromDate })
      .andWhere('event.startDate <= :toDate', { toDate });

    // Core visibility filter
    if (includePublic) {
      // Private/unlisted in my groups OR anything I'm attending
      qb.andWhere(
        '(' +
          '(event.visibility IN (:...nonPublicVisibilities) AND gm.id IS NOT NULL) ' +
          'OR (ea.id IS NOT NULL)' +
          ')',
        {
          nonPublicVisibilities: [
            EventVisibility.Private,
            EventVisibility.Unlisted,
          ],
        },
      );
    } else {
      // Only private/unlisted events in my groups OR private/unlisted events I'm attending
      qb.andWhere(
        '(' +
          '(event.visibility IN (:...nonPublicVisibilities) AND gm.id IS NOT NULL) ' +
          'OR (event.visibility IN (:...nonPublicVisibilities2) AND ea.id IS NOT NULL)' +
          ')',
        {
          nonPublicVisibilities: [
            EventVisibility.Private,
            EventVisibility.Unlisted,
          ],
          nonPublicVisibilities2: [
            EventVisibility.Private,
            EventVisibility.Unlisted,
          ],
        },
      );
    }

    // Filter by group if specified
    if (query.groupSlug) {
      qb.andWhere('eventGroup.slug = :groupSlug', {
        groupSlug: query.groupSlug,
      });
    }

    // Cursor-based pagination: cursor is the event ID to start after
    if (query.cursor) {
      const cursorId = parseInt(query.cursor, 10);
      if (!isNaN(cursorId)) {
        // Get the startDate of the cursor event for proper ordering
        const cursorEvent = await eventRepo.findOne({
          where: { id: cursorId },
          select: ['id', 'startDate'],
        });
        if (cursorEvent) {
          qb.andWhere(
            '(event.startDate > :cursorDate OR (event.startDate = :cursorDate AND event.id > :cursorId))',
            { cursorDate: cursorEvent.startDate, cursorId },
          );
        }
      }
    }

    qb.orderBy('event.startDate', 'ASC').addOrderBy('event.id', 'ASC');

    // Fetch one extra to determine if there's a next page
    qb.take(limit + 1);

    const rawAndEntities = await qb.getRawAndEntities();
    const events = rawAndEntities.entities;
    const rawResults = rawAndEntities.raw;

    // Determine cursor for next page
    let nextCursor: string | null = null;
    if (events.length > limit) {
      events.pop();
      rawResults.pop();
      const lastEvent = events[events.length - 1];
      nextCursor = String(lastEvent.id);
    }

    // Build attendee count map
    const eventIds = events.map((e) => e.id);
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

    // Map events to response shape
    const mappedEvents = events.map((event, index) => {
      const raw = rawResults[index];
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
              role: raw?.userGroupRole || null,
            }
          : null,
        attendeesCount: attendeeCountMap[event.id] || 0,
        userRsvpStatus: raw?.userRsvpStatus || null,
        image: event.image || null,
      };
    });

    return {
      events: mappedEvents,
      cursor: nextCursor,
    };
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

    // Check if user is attending this event
    const attendance = await eventAttendeeRepo.findOne({
      where: {
        event: { id: event.id },
        user: { id: userId },
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
      image: event.image || null,
    };
  }
}
