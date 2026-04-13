import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  Repository,
  Brackets,
  In,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  FindOptionsWhere,
} from 'typeorm';
import { instanceToPlain } from 'class-transformer';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { ResolvedEvent } from '../../attendance/types';
import { BLUESKY_COLLECTIONS } from '../../bluesky/BlueskyTypes';
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { QueryEventDto } from '../dto/query-events.dto';
import { DashboardSummaryDto } from '../dto/dashboard-summary.dto';
import {
  DashboardEventsQueryDto,
  DashboardEventsTab,
} from '../dto/dashboard-events-query.dto';
import { PaginationResult } from '../../utils/generic-pagination';
import { PaginationDto } from '../../utils/dto/pagination.dto';
import { HomeQuery } from '../../home/dto/home-query.dto';
import { MyEventsQueryDto } from '../../me/dto/my-events-query.dto';
import {
  EventVisibility,
  EventStatus,
  EventAttendeeStatus,
  PostgisSrid,
  DEFAULT_RADIUS,
} from '../../core/constants/constant';
import { paginate } from '../../utils/generic-pagination';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { GroupDIDFollowService } from '../../group-did-follow/group-did-follow.service';
import { ContrailQueryService } from '../../contrail/contrail-query.service';
import type {
  ContrailRecord,
  ContrailCondition,
} from '../../contrail/contrail-record.types';
import type { Main as CalendarEvent } from '../../generated-lexicon-types/types/community/lexicon/calendar/event';
import { AtprotoEnrichmentService } from '../../atproto-enrichment/atproto-enrichment.service';
import type { AtprotoSourcedEvent } from '../../atproto-enrichment/types/enriched-event.types';
import { UserService } from '../../user/user.service';
import { UserAtprotoIdentityService } from '../../user-atproto-identity/user-atproto-identity.service';

@Injectable({ scope: Scope.REQUEST })
export class EventQueryService {
  private readonly logger = new Logger(EventQueryService.name);
  private readonly tracer = trace.getTracer('event-query-service');
  private eventRepository: Repository<EventEntity>;
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupMemberService: GroupMemberService,
    @Inject(forwardRef(() => GroupDIDFollowService))
    private readonly groupDidFollowService: GroupDIDFollowService,
    private readonly contrailQueryService: ContrailQueryService,
    private readonly atprotoEnrichmentService: AtprotoEnrichmentService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly identityService: UserAtprotoIdentityService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-query.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  /**
   * Resolve a userId to an ATProto DID for Contrail queries.
   * Returns null if the user has no ATProto identity.
   */
  private async resolveUserDid(userId: number): Promise<string | null> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user?.ulid) return null;
      const identity = await this.identityService.findByUserUlid(
        this.request.tenantId,
        user.ulid,
      );
      return identity?.did || null;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve DID for userId ${userId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Apply visibility filtering to event queries based on authentication and attendance.
   *
   * Implements the visibility model:
   * - Public: Always visible to everyone
   * - Unlisted: Only visible to actual attendees (not all authenticated users)
   * - Private: Only visible to actual attendees
   *
   * "Unlisted" means not discoverable unless you have the URL and RSVP'd as an attendee.
   *
   * @param queryBuilder - The query builder to apply filters to
   * @param userId - Optional user ID for authenticated users
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async applyEventVisibilityFilter(
    queryBuilder: any,
    userId?: number,
  ): Promise<void> {
    if (userId) {
      // Authenticated users: show Public + Unlisted/Private only if hosting or RSVP'd
      // Note: Group membership grants URL access (via VisibilityGuard) but NOT search discoverability
      // Using EXISTS subquery instead of pre-fetching all attended event IDs for better performance
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('event.visibility = :publicVisibility', {
            publicVisibility: EventVisibility.Public,
          });

          // For unlisted/private: show ONLY if user is creator OR attendee
          qb.orWhere(
            new Brackets((subQb) => {
              subQb.where(
                '(event.visibility IN (:...restrictedVisibilities) AND event.userId = :userId)',
                {
                  restrictedVisibilities: [
                    EventVisibility.Unlisted,
                    EventVisibility.Private,
                  ],
                  userId,
                },
              );

              // Use EXISTS subquery to check attendance (more efficient than IN with pre-fetched IDs)
              subQb.orWhere(
                `(event.visibility IN (:...restrictedVisibilities) AND EXISTS (
                  SELECT 1 FROM "eventAttendees" ea
                  WHERE ea."eventId" = event.id AND ea."userId" = :attendeeUserId
                ))`,
                {
                  restrictedVisibilities: [
                    EventVisibility.Unlisted,
                    EventVisibility.Private,
                  ],
                  attendeeUserId: userId,
                },
              );
            }),
          );
        }),
      );
    } else {
      // Anonymous users: show only Public events
      queryBuilder.andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      });
    }
  }

  @Trace('event-query.findEventBySlug')
  async findEventBySlug(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    return this.eventRepository.findOne({
      where: { slug },
      relations: ['user', 'group', 'categories', 'image'],
    });
  }

  /**
   * Find an event by ID
   */
  @Trace('event-query.findEventById')
  async findEventById(id: number): Promise<EventEntity> {
    return this.findEventBy({ id });
  }

  /**
   * Generic method to find an event by criteria
   * @private
   */
  @Trace('event-query.findEventBy')
  private async findEventBy(criteria: {
    slug?: string;
    id?: number;
  }): Promise<EventEntity> {
    await this.initializeRepository();

    // Create log message based on criteria
    const criteriaType = criteria.slug ? 'slug' : 'id';
    const criteriaValue = criteria.slug || criteria.id;
    this.logger.debug(
      `[findEventBy] Finding event for ${criteriaType}: ${criteriaValue}`,
    );

    const userId = this.request.user?.id;
    const authState = userId ? 'authenticated' : 'public access';
    this.logger.debug(`[findEventBy] Request type: ${authState}`);

    const queryBuilder = this.eventRepository.createQueryBuilder('event');

    // Apply criteria
    if (criteria.slug) {
      queryBuilder.where('event.slug = :slug', { slug: criteria.slug });
    } else if (criteria.id) {
      queryBuilder.where('event.id = :id', { id: criteria.id });
    }

    // Always load the user relationship for permission checks
    queryBuilder.leftJoinAndSelect('event.user', 'user');

    if (userId) {
      queryBuilder
        .leftJoinAndSelect('event.attendees', 'attendee')
        .leftJoinAndSelect('attendee.user', 'attendeeUser')
        .leftJoinAndSelect('attendee.role', 'role');
    }

    const event = await queryBuilder.getOne();

    if (!event) {
      const errorMsg = criteria.slug
        ? `Event with slug ${criteria.slug} not found`
        : `Event with id ${criteria.id} not found`;
      throw new NotFoundException(errorMsg);
    }

    // If the event is part of a series, return it immediately without additional processing
    if (event.seriesSlug) {
      return event;
    }

    if (userId) {
      this.logger.debug(
        `[findEventBy] Checking attendance for user: ${userId}`,
      );
      const attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );

      if (attendee) {
        this.logger.debug(
          `[findEventBySlug] Found attendee with status: ${attendee.status}`,
        );
        event.attendee = attendee;
      } else {
        this.logger.debug('[findEventBySlug] User has not attended this event');
      }
    }

    // Add recurrence information like human-readable description
    const eventWithRecurrenceInfo = this.addRecurrenceInformation(event);

    return eventWithRecurrenceInfo;
  }

  @Trace('event-query.showEvent')
  async showEvent(slug: string, userId?: number): Promise<EventEntity> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['user', 'group', 'categories', 'series'],
      select: {
        id: false,
        user: {
          name: true,
          slug: true,
          provider: true,
          socialId: true,
          isShadowAccount: true,
          photo: {
            path: true,
          },
        },
      },
    });

    if (!event) {
      // Fallback: check if this is an ATProto fallback slug (did~rkey format)
      const parsed = this.atprotoEnrichmentService.parseAtprotoSlug(slug);
      if (parsed) {
        const uri = `at://${parsed.did}/community.lexicon.calendar.event/${parsed.rkey}`;
        const record = await this.contrailQueryService.findByUri(
          'community.lexicon.calendar.event',
          uri,
        );
        if (record) {
          try {
            const [enriched] =
              await this.atprotoEnrichmentService.enrichRecords(
                [record],
                this.request.tenantId,
              );

            // Check user's RSVP status via Contrail for foreign events
            if (userId) {
              const userDid = await this.resolveUserDid(userId);
              if (userDid) {
                const rsvpRecords = await this.contrailQueryService.find(
                  BLUESKY_COLLECTIONS.RSVP,
                  {
                    conditions: [
                      {
                        sql: "record->'subject'->>'uri' = $1",
                        params: [uri],
                      },
                      { sql: 'did = $1', params: [userDid] },
                    ],
                    limit: 1,
                  },
                );
                if (rsvpRecords.records.length > 0) {
                  const rsvpRecord = rsvpRecords.records[0].record as any;
                  const fullStatus = rsvpRecord.status as string;
                  const shortStatus = fullStatus.includes('#')
                    ? fullStatus.split('#')[1]
                    : fullStatus;
                  (enriched as any).attendee = {
                    status:
                      shortStatus === 'going'
                        ? 'confirmed'
                        : shortStatus === 'notgoing'
                          ? 'cancelled'
                          : shortStatus,
                  };
                }
              }
            }

            // TODO(om-vsq9): AtprotoSourcedEvent is not EventEntity — adopt
            // ATProto-shaped API response types to remove this cast
            return enriched as any;
          } catch (err) {
            this.logger.error(
              `Failed to enrich ATProto record ${uri}`,
              (err as Error).stack,
            );
            throw new NotFoundException('Event not found');
          }
        }
      }

      throw new NotFoundException('Event not found');
    }

    event.attendees = (
      await this.eventAttendeeService.showEventAttendees(
        event.id,
        { page: 1, limit: 5 },
        EventAttendeeStatus.Confirmed,
      )
    ).data;

    if (event.group && userId) {
      event.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );
    }

    event.attendeesCount =
      await this.eventAttendeeService.showConfirmedEventAttendeesCount(
        event.id,
      );

    if (userId) {
      this.logger.debug(
        `Finding attendance status for user ${userId} in event ${event.id}`,
      );
      event.attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );

      // Log whether we found attendance data
      if (event.attendee) {
        this.logger.debug(
          `Found attendee record with status: ${event.attendee.status}`,
        );
      } else {
        this.logger.debug(
          `No attendee record found for user ${userId} in event ${event.id}`,
        );
      }
    }

    // Matrix-based discussions will be loaded from the frontend directly
    // No need to set messages or topics in the event entity

    // Add recurrence information like human-readable description
    const eventWithRecurrenceInfo = this.addRecurrenceInformation(event);

    return eventWithRecurrenceInfo;
  }

  @Trace('event-query.editEvent')
  async editEvent(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'categories'],
    });
    if (event) {
      return this.addRecurrenceInformation(event);
    }
    return event;
  }

  @Trace('event-query.showEventBySlug')
  async showEventBySlug(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['user'],
    });

    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    return this.addRecurrenceInformation(event);
  }

  @Trace('event-query.showAllEvents')
  async showAllEvents(
    pagination: PaginationDto,
    query: QueryEventDto,
    user?: any,
  ): Promise<any> {
    await this.initializeRepository();
    return this.showAllEventsWithContrail(pagination, query, user);
  }

  @Trace('event-query.searchAllEvents')
  async searchAllEvents(
    pagination: PaginationDto,
    query: HomeQuery,
    userId?: number,
  ): Promise<any> {
    await this.initializeRepository();

    const limit = pagination.limit || 25;
    const page = pagination.page || 1;
    const offset = (page - 1) * limit;
    const now = new Date().toISOString();

    // 1. Public events from Contrail
    const conditions: ContrailCondition[] = [
      {
        sql: `(record->>'startsAt' ~ '^[0-9]') AND record->>'startsAt' >= $1`,
        params: [now],
      },
    ];

    if (query.search) {
      conditions.push({
        sql: `search_vector @@ plainto_tsquery($1)`,
        params: [query.search],
      });
    }

    const contrailResult = await this.contrailQueryService.find<CalendarEvent>(
      'community.lexicon.calendar.event',
      {
        conditions,
        orderBy: `record->>'startsAt' ASC, uri ASC`,
        limit,
        offset,
      },
    );

    const tenantId = this.request.tenantId;
    const enrichedPublic = await this.atprotoEnrichmentService.enrichRecords(
      contrailResult.records,
      tenantId,
    );

    // 2. Private/unlisted events from tenant (authenticated users only)
    let privateEvents: EventEntity[] = [];
    if (userId) {
      const privateQb = this.eventRepository
        .createQueryBuilder('event')
        .where('event.status IN (:...statuses)', {
          statuses: [EventStatus.Published, EventStatus.Cancelled],
        })
        .andWhere('event.visibility IN (:...visibilities)', {
          visibilities: [EventVisibility.Unlisted, EventVisibility.Private],
        })
        .andWhere(
          new Brackets((qb) => {
            qb.where('event.userId = :userId', { userId });
            qb.orWhere(
              `EXISTS (SELECT 1 FROM "eventAttendees" ea WHERE ea."eventId" = event.id AND ea."userId" = :attendeeUserId)`,
              { attendeeUserId: userId },
            );
          }),
        )
        .andWhere('event.startDate >= :now', { now: new Date() });

      if (query.search) {
        privateQb.andWhere('event.name ILIKE :search', {
          search: `%${query.search}%`,
        });
      }

      privateQb.orderBy('event.startDate', 'ASC');
      privateEvents = await privateQb.getMany();
    }

    // 3. Dedup and merge
    const publicUriSet = new Set(
      enrichedPublic.map((e) => e.atprotoUri).filter(Boolean),
    );
    const dedupedPrivate =
      this.atprotoEnrichmentService.deduplicatePrivateEvents(
        privateEvents,
        publicUriSet,
      );

    const allEvents = [...enrichedPublic, ...dedupedPrivate]
      .sort((a, b) => {
        const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
        return aDate - bDate;
      })
      .slice(0, limit);

    const total = contrailResult.total + dedupedPrivate.length;

    return {
      data: allEvents,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    } as PaginationResult<Partial<EventEntity>>;
  }

  @Trace('event-query.getEventsByCreator')
  async getEventsByCreator(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository.find({
      where: { user: { id: userId } },
    });

    if (!events || events.length === 0) {
      return [];
    }

    // Batch fetch attendee counts in a single query (avoids N+1)
    const eventIds = events.map((e) => e.id);
    const counts = await this.eventAttendeesRepository
      .createQueryBuilder('att')
      .select('att.eventId', 'eventId')
      .addSelect('COUNT(att.id)', 'count')
      .where('att.eventId IN (:...eventIds)', { eventIds })
      .andWhere('att.status = :status', {
        status: EventAttendeeStatus.Confirmed,
      })
      .groupBy('att.eventId')
      .getRawMany();

    const countMap = new Map(
      counts.map((c) => [c.eventId, parseInt(c.count, 10)]),
    );
    events.forEach((event) => {
      (event as any).attendeesCount = countMap.get(event.id) || 0;
    });

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
  }

  @Trace('event-query.getEventsByAttendee')
  async getEventsByAttendee(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const attendees = await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .where('eventAttendee.user.id = :userId', { userId })
      .getMany();

    const events = attendees.map((attendee) => attendee.event);

    // Add recurrence descriptions
    return events
      .filter((event): event is EventEntity => event !== null)
      .map((event) => this.addRecurrenceInformation(event));
  }

  @Trace('event-query.findEventsForGroup')
  async findEventsForGroup(
    groupId: number,
    limit: number,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    const statusFilter = In([EventStatus.Published, EventStatus.Cancelled]);

    // Build date filter (shared by both queries)
    const dateWhere: FindOptionsWhere<EventEntity> = {};
    if (dateFilter?.startDate && dateFilter?.endDate) {
      dateWhere.startDate = Between(
        new Date(dateFilter.startDate),
        new Date(dateFilter.endDate),
      );
    } else if (dateFilter?.startDate) {
      dateWhere.startDate = MoreThanOrEqual(new Date(dateFilter.startDate));
    } else if (dateFilter?.endDate) {
      dateWhere.startDate = LessThanOrEqual(new Date(dateFilter.endDate));
    }

    // Query 1: Native group events (existing behavior)
    const nativeWhere: FindOptionsWhere<EventEntity> = {
      group: { id: groupId },
      status: statusFilter,
      ...dateWhere,
    };

    const nativeEvents = await this.eventRepository.find({
      where: nativeWhere,
      relations: ['group', 'series', 'image'],
      take: limit || undefined,
    });

    // Mark native events
    nativeEvents.forEach((event) => {
      (event as any).origin = 'group';
    });

    // Query 2: External events from followed DIDs (via Contrail)
    let externalEvents: AtprotoSourcedEvent[] = [];
    const followedDids =
      await this.groupDidFollowService.getFollowedDidsForGroup(groupId);

    if (followedDids.length > 0) {
      const contrailConditions: ContrailCondition[] = [
        {
          sql: followedDids.map((_, i) => `did = $${i + 1}`).join(' OR '),
          params: followedDids,
        },
      ];

      // Date filters
      if (dateFilter?.startDate && dateFilter?.endDate) {
        contrailConditions.push({
          sql: `record->>'startsAt' BETWEEN $1 AND $2`,
          params: [dateFilter.startDate, dateFilter.endDate],
        });
      } else if (dateFilter?.startDate) {
        contrailConditions.push({
          sql: `record->>'startsAt' >= $1`,
          params: [dateFilter.startDate],
        });
      } else if (dateFilter?.endDate) {
        contrailConditions.push({
          sql: `record->>'startsAt' <= $1`,
          params: [dateFilter.endDate],
        });
      }

      const contrailResult =
        await this.contrailQueryService.find<CalendarEvent>(
          'community.lexicon.calendar.event',
          {
            conditions: contrailConditions,
            orderBy: `record->>'startsAt' ASC, uri ASC`,
            limit: limit || 200,
            offset: 0,
          },
        );

      const tenantId = this.request.tenantId;
      externalEvents = await this.atprotoEnrichmentService.enrichRecords(
        contrailResult.records,
        tenantId,
      );
    }

    // Deduplicate: remove external events already in native group events
    const nativeUris = new Set(
      nativeEvents.filter((e) => e.atprotoUri).map((e) => e.atprotoUri),
    );
    const nativeIds = new Set(nativeEvents.map((e) => e.id));
    const dedupedExternal = externalEvents.filter((e: any) => {
      if (e.atprotoUri && nativeUris.has(e.atprotoUri)) return false;
      if (e.id && nativeIds.has(e.id)) return false;
      return true;
    });

    // Mark origin after deduplication
    dedupedExternal.forEach((event) => {
      (event as any).origin = 'external';
    });

    const allEvents: EventEntity[] = [
      ...nativeEvents,
      ...(dedupedExternal as unknown as EventEntity[]),
    ];

    // Sort by startDate ascending
    allEvents.sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aDate - bDate;
    });

    // Apply limit after merge (limit=0 means no limit, matching TypeORM's take:0 behavior)
    const limited = limit > 0 ? allEvents.slice(0, limit) : allEvents;

    // Batch fetch attendee counts (only for events with tenant IDs)
    if (limited.length > 0) {
      const eventIds = limited.filter((e: any) => e.id).map((e) => e.id);
      if (eventIds.length > 0) {
        const counts = await this.eventAttendeesRepository
          .createQueryBuilder('att')
          .select('att.eventId', 'eventId')
          .addSelect('COUNT(att.id)', 'count')
          .where('att.eventId IN (:...eventIds)', { eventIds })
          .andWhere('att.status = :status', {
            status: EventAttendeeStatus.Confirmed,
          })
          .groupBy('att.eventId')
          .getRawMany();

        const countMap = new Map(
          counts.map((c) => [c.eventId, parseInt(c.count, 10)]),
        );
        limited.forEach((event) => {
          if ((event as any).id) {
            (event as any).attendeesCount =
              countMap.get((event as any).id) || 0;
          }
        });
      }
    }

    // Add recurrence descriptions
    return limited.map((event) => this.addRecurrenceInformation(event));
  }

  @Trace('event-query.findUpcomingEventsForGroup')
  async findUpcomingEventsForGroup(
    groupId: number,
    limit: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.image', 'image')
      .where('event.group.id = :groupId', { groupId })
      .andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .andWhere(
        '(event.startDate > :now OR (event.startDate <= :now AND (event.endDate > :now OR (event.endDate IS NULL AND event.startDate > :oneHourAgo))))',
        { now, oneHourAgo },
      )
      .orderBy('event.startDate', 'ASC')
      .limit(limit)
      .getMany();

    // Batch fetch attendee counts in a single query (avoids N+1)
    if (events.length > 0) {
      const eventIds = events.map((e) => e.id);
      const counts = await this.eventAttendeesRepository
        .createQueryBuilder('att')
        .select('att.eventId', 'eventId')
        .addSelect('COUNT(att.id)', 'count')
        .where('att.eventId IN (:...eventIds)', { eventIds })
        .andWhere('att.status = :status', {
          status: EventAttendeeStatus.Confirmed,
        })
        .groupBy('att.eventId')
        .getRawMany();

      const countMap = new Map(
        counts.map((c) => [c.eventId, parseInt(c.count, 10)]),
      );
      events.forEach((event) => {
        (event as any).attendeesCount = countMap.get(event.id) || 0;
      });
    }

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
  }

  /**
   * Get all events a user is attending, from any source.
   *
   * Two parallel queries:
   * 1. Contrail RSVPs → batch-fetch event records → enrichRecords() (handles foreign + local-with-ATProto)
   * 2. Local private eventAttendees (atprotoUri IS NULL — never published to ATProto)
   *
   * Follows same pattern as searchAllEvents: enrich → dedup → merge → sort.
   */
  @Trace('event-query.getAttendingEvents')
  async getAttendingEvents(
    userId: number,
    options: {
      limit?: number;
      upcomingOnly?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{ events: (AtprotoSourcedEvent | EventEntity)[]; total: number }> {
    await this.initializeRepository();
    const { limit = 10, upcomingOnly = false, startDate, endDate } = options;
    const userDid = await this.resolveUserDid(userId);

    // Q1: Contrail RSVP → event records → enrichment
    let enrichedAtprotoEvents: AtprotoSourcedEvent[] = [];
    if (userDid) {
      try {
        // Get user's RSVP event URIs
        const rsvpResult = await this.contrailQueryService.find(
          BLUESKY_COLLECTIONS.RSVP,
          {
            conditions: [
              { sql: 'did = $1', params: [userDid] },
              { sql: "record->>'status' LIKE $1", params: ['%#going'] },
            ],
          },
        );

        const eventUris = (
          rsvpResult.records.map((r: any) => r.record?.subject?.uri) as (
            | string
            | undefined
          )[]
        ).filter(Boolean) as string[];

        if (eventUris.length > 0) {
          // Batch-fetch event records from Contrail
          const eventRecords =
            await this.contrailQueryService.findByUris<CalendarEvent>(
              BLUESKY_COLLECTIONS.EVENT,
              eventUris,
            );

          // Enrich: adds tenant metadata for local events, resolves handles for foreign
          enrichedAtprotoEvents =
            await this.atprotoEnrichmentService.enrichRecords(
              eventRecords,
              this.request.tenantId,
            );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch Contrail attending events for userId ${userId}: ${error.message}`,
        );
      }
    }

    // Q2: All local attendees (private events + public events where Contrail RSVP
    // may not exist yet — PDS write is best-effort, sync is async).
    // deduplicatePrivateEvents handles overlap with Q1 results.
    const attendeeRecords = await this.eventAttendeesRepository
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.event', 'event')
      .leftJoinAndSelect('event.image', 'eventImage')
      .where('att.userId = :userId', { userId })
      .andWhere('att.status != :cancelledStatus', {
        cancelledStatus: EventAttendeeStatus.Cancelled,
      })
      .orderBy('event.startDate', 'ASC')
      .getMany();

    const privateEvents = attendeeRecords
      .map((att) => att.event)
      .filter((e): e is EventEntity => e != null);

    // Dedup and merge (same pattern as searchAllEvents)
    const publicUriSet = new Set(
      enrichedAtprotoEvents.map((e) => e.atprotoUri).filter(Boolean),
    );
    const dedupedPrivate =
      this.atprotoEnrichmentService.deduplicatePrivateEvents(
        privateEvents,
        publicUriSet,
      );

    const allEvents = [...enrichedAtprotoEvents, ...dedupedPrivate].sort(
      (a, b) => {
        const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
        return aDate - bDate;
      },
    );

    // Apply date filters
    const now = new Date();
    const filtered = allEvents.filter((e) => {
      if (!e.startDate) return !upcomingOnly; // Keep dateless events unless upcomingOnly
      const eventDate = new Date(e.startDate);
      if (upcomingOnly && eventDate < now) return false;
      if (startDate && eventDate < startDate) return false;
      if (endDate && eventDate > endDate) return false;
      return true;
    });

    const limited = filtered.slice(0, limit);

    return {
      events: limited,
      total: filtered.length,
    };
  }

  @Trace('event-query.getDashboardSummary')
  async getDashboardSummary(userId: number): Promise<DashboardSummaryDto> {
    await this.initializeRepository();

    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay())); // End of current week (Sunday)
    endOfWeek.setHours(23, 59, 59, 999);

    // Base query builder for events created by user (hosting)
    const createHostingQuery = () =>
      this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.user', 'user')
        .leftJoinAndSelect('user.photo', 'userPhoto')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('group.image', 'groupImage')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.image', 'image')
        .where('event.userId = :userId', { userId });

    // Fetch attending events via unified getAttendingEvents (handles Contrail + local)
    const attendingResult = await this.getAttendingEvents(userId, {
      limit: 5,
      upcomingOnly: true,
    });

    // Execute hosting queries in parallel
    const [hostingUpcomingCount, pastCount, hostingThisWeek, hostingLater] =
      await Promise.all([
        // Count: hosting upcoming
        createHostingQuery()
          .andWhere('event.startDate >= :now', { now })
          .getCount(),

        // Count: past events (both hosting and attending, deduplicated via union approach)
        this.getPastEventsCount(userId, now),

        // Hosting this week (full list, typically small)
        createHostingQuery()
          .andWhere('event.startDate >= :now', { now })
          .andWhere('event.startDate <= :endOfWeek', { endOfWeek })
          .orderBy('event.startDate', 'ASC')
          .getMany(),

        // Hosting later (limited preview)
        createHostingQuery()
          .andWhere('event.startDate > :endOfWeek', { endOfWeek })
          .orderBy('event.startDate', 'ASC')
          .limit(5)
          .getMany(),
      ]);

    const attendingUpcomingCount = attendingResult.total;
    const attendingSoon = attendingResult.events;

    // Batch fetch attendee counts for hosting events
    // (attendingSoon events from getAttendingEvents already have enrichment data)
    const allEvents = [...hostingThisWeek, ...hostingLater];
    if (allEvents.length > 0) {
      const eventIds = allEvents.map((e) => e.id);

      const [counts, attendeeRecords] = await Promise.all([
        this.eventAttendeesRepository
          .createQueryBuilder('att')
          .select('att.eventId', 'eventId')
          .addSelect('COUNT(att.id)', 'count')
          .where('att.eventId IN (:...eventIds)', { eventIds })
          .andWhere('att.status = :status', {
            status: EventAttendeeStatus.Confirmed,
          })
          .groupBy('att.eventId')
          .getRawMany(),
        this.eventAttendeesRepository
          .createQueryBuilder('att')
          .leftJoinAndSelect('att.role', 'role')
          .leftJoin('att.event', 'event')
          .addSelect('event.id')
          .where('att.eventId IN (:...eventIds)', { eventIds })
          .andWhere('att.userId = :userId', { userId })
          .getMany(),
      ]);

      const countMap = new Map(
        counts.map((c) => [c.eventId, parseInt(c.count, 10)]),
      );
      const attendeeMap = new Map(attendeeRecords.map((a) => [a.event?.id, a]));

      allEvents.forEach((event) => {
        (event as any).attendeesCount = countMap.get(event.id) || 0;
        const attendee = attendeeMap.get(event.id);
        if (attendee) {
          event.attendee = attendee;
        }
      });
    }

    // Add recurrence info
    const processEvents = (events: EventEntity[]) =>
      events.map((event) => this.addRecurrenceInformation(event));

    return {
      counts: {
        hostingUpcoming: hostingUpcomingCount,
        attendingUpcoming: attendingUpcomingCount,
        past: pastCount,
      },
      hostingThisWeek: processEvents(hostingThisWeek),
      hostingLater: processEvents(hostingLater),
      attendingSoon: attendingSoon as EventEntity[],
    };
  }

  private async getPastEventsCount(userId: number, now: Date): Promise<number> {
    // Count unique past events (hosting OR attending) from local DB
    const localResult = await this.eventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.id)', 'count')
      .leftJoin('event.attendees', 'attendee')
      .where('event.startDate < :now', { now })
      .andWhere(
        new Brackets((qb) => {
          qb.where('event.userId = :userId', { userId }).orWhere(
            'attendee.userId = :userId AND attendee.status != :cancelledStatus',
            { userId, cancelledStatus: EventAttendeeStatus.Cancelled },
          );
        }),
      )
      .getRawOne();

    const localCount = parseInt(localResult?.count || '0', 10);

    // Also count Contrail-sourced past events (foreign events with no local row)
    try {
      const pastAttending = await this.getAttendingEvents(userId, {
        limit: 1000,
        startDate: new Date(0),
        endDate: now,
      });

      // Count Contrail-only events (those without an id, i.e. AtprotoSourcedEvent)
      const contrailOnlyCount = pastAttending.events.filter(
        (e) => !(e as EventEntity).id,
      ).length;

      return localCount + contrailOnlyCount;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Contrail past events count for userId ${userId}: ${(error as Error).message}`,
      );
      return localCount;
    }
  }

  @Trace('event-query.showDashboardEventsPaginated')
  async showDashboardEventsPaginated(
    userId: number,
    query: DashboardEventsQueryDto,
  ): Promise<PaginationResult<EventEntity>> {
    await this.initializeRepository();

    const { page = 1, limit = 10, tab } = query;
    const now = new Date();

    // Base query builder with common selections
    let eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('user.photo', 'userPhoto')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('group.image', 'groupImage')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image');

    // Apply tab-specific filtering
    if (tab === DashboardEventsTab.Hosting) {
      // Events user is hosting (upcoming)
      eventQuery = eventQuery
        .where('event.userId = :userId', { userId })
        .andWhere('event.startDate >= :now', { now })
        .orderBy('event.startDate', 'ASC');
    } else if (tab === DashboardEventsTab.Attending) {
      // Events user is attending (not hosting, upcoming)
      // Union: local event_attendees OR Contrail RSVP records for public events
      const userDid = await this.resolveUserDid(userId);

      eventQuery = eventQuery
        .leftJoin(
          'event.attendees',
          'attendee',
          'attendee.userId = :userId AND attendee.status != :cancelledStatus',
          { userId, cancelledStatus: EventAttendeeStatus.Cancelled },
        )
        .where(
          new Brackets((qb) => {
            qb.where('attendee.id IS NOT NULL');
            if (userDid) {
              qb.orWhere(
                `event."atprotoUri" IN (SELECT record->'subject'->>'uri' FROM public.records_community_lexicon_calendar_rsvp WHERE did = :userDid AND record->>'status' LIKE '%#going')`,
                { userDid },
              );
            }
          }),
        )
        .andWhere('event.userId != :userId', { userId })
        .andWhere('event.startDate >= :now', { now })
        .orderBy('event.startDate', 'ASC');
    } else if (tab === DashboardEventsTab.Past) {
      // Past events (both hosting and attending)
      eventQuery = eventQuery
        .leftJoin('event.attendees', 'attendee')
        .where('event.startDate < :now', { now })
        .andWhere(
          '(event.userId = :userId OR (attendee.userId = :userId AND attendee.status != :cancelledStatus))',
          { userId, cancelledStatus: EventAttendeeStatus.Cancelled },
        )
        .orderBy('event.startDate', 'DESC');
    } else {
      // No tab specified - return all user's events (hosting + attending, upcoming first)
      eventQuery = eventQuery
        .leftJoin('event.attendees', 'attendee')
        .where(
          '(event.userId = :userId OR (attendee.userId = :userId AND attendee.status != :cancelledStatus))',
          { userId, cancelledStatus: EventAttendeeStatus.Cancelled },
        )
        .orderBy('event.startDate', 'ASC');
    }

    return await paginate(eventQuery, { page, limit });
  }

  @Trace('event-query.getHomePageFeaturedEvents')
  async getHomePageFeaturedEvents(): Promise<EventEntity[]> {
    await this.initializeRepository();

    const now = new Date().toISOString();

    // Fetch upcoming public events from Contrail (larger window for random sampling)
    const contrailResult = await this.contrailQueryService.find<CalendarEvent>(
      'community.lexicon.calendar.event',
      {
        conditions: [
          {
            sql: `(record->>'startsAt' ~ '^[0-9]') AND (record->>'startsAt' >= $1 OR (record->>'startsAt' <= $2 AND (record->>'endsAt') > $3))`,
            params: [now, now, now],
          },
        ],
        orderBy: `record->>'startsAt' ASC, uri ASC`,
        limit: 50,
        offset: 0,
      },
    );

    // Enrich with tenant metadata
    const tenantId = this.request.tenantId;
    const enriched = await this.atprotoEnrichmentService.enrichRecords(
      contrailResult.records,
      tenantId,
    );

    // Random sample 4 from the enriched set
    const shuffled = enriched.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);

    // Serialize and add recurrence info
    return selected.map((event) => {
      const plainEvent = instanceToPlain(event);
      return this.addRecurrenceInformation(plainEvent as any);
    }) as unknown as EventEntity[];
  }

  @Trace('event-query.getHomePageUserNextHostedEvent')
  async getHomePageUserNextHostedEvent(
    userId: number,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.image', 'image')
      .where('event.user.id = :userId', { userId })
      .andWhere(
        '(event.startDate > :now OR (event.startDate <= :now AND (event.endDate > :now OR (event.endDate IS NULL AND event.startDate > :oneHourAgo))))',
        {
          now: new Date(),
          oneHourAgo: new Date(Date.now() - 60 * 60 * 1000),
        },
      )
      .andWhere('event.status = :status', { status: EventStatus.Published })
      .orderBy('event.startDate', 'ASC')
      .getOne();

    if (!event) {
      return null;
    }

    // Batch fetch attendee count for this single event
    const countResult = await this.eventAttendeesRepository
      .createQueryBuilder('att')
      .select('COUNT(att.id)', 'count')
      .where('att.eventId = :eventId', { eventId: event.id })
      .andWhere('att.status = :status', {
        status: EventAttendeeStatus.Confirmed,
      })
      .getRawOne();
    (event as any).attendeesCount = parseInt(countResult?.count || '0', 10);

    // Debug image before processing
    if (event.image) {
      this.logger.debug(
        `Next hosted event image before: path=${JSON.stringify(event.image.path)}`,
      );
    }

    // Add recurrence info
    const processedEvent = this.addRecurrenceInformation(event);

    // Transform image - exactly like in showAllEvents method
    if (
      processedEvent.image &&
      typeof processedEvent.image.path === 'object' &&
      Object.keys(processedEvent.image.path).length === 0
    ) {
      // Use instanceToPlain to force the Transform decorator to run
      processedEvent.image = instanceToPlain(processedEvent.image) as any;
    }

    // Final debug check
    if (processedEvent.image) {
      this.logger.debug(
        `Next hosted event image after: path=${JSON.stringify(processedEvent.image.path)}`,
      );
    }

    return processedEvent;
  }

  @Trace('event-query.getHomePageUserRecentEventDrafts')
  async getHomePageUserRecentEventDrafts(
    userId: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.user.id = :userId', { userId })
      .andWhere('event.status = :status', { status: EventStatus.Draft })
      .orderBy('event.updatedAt', 'DESC')
      .limit(3)
      .getMany();

    // Batch fetch attendee counts in a single query (avoids N+1)
    if (events.length > 0) {
      const eventIds = events.map((e) => e.id);
      const counts = await this.eventAttendeesRepository
        .createQueryBuilder('att')
        .select('att.eventId', 'eventId')
        .addSelect('COUNT(att.id)', 'count')
        .where('att.eventId IN (:...eventIds)', { eventIds })
        .andWhere('att.status = :status', {
          status: EventAttendeeStatus.Confirmed,
        })
        .groupBy('att.eventId')
        .getRawMany();

      const countMap = new Map(
        counts.map((c) => [c.eventId, parseInt(c.count, 10)]),
      );
      events.forEach((event) => {
        (event as any).attendeesCount = countMap.get(event.id) || 0;
      });
    }

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
  }

  @Trace('event-query.getHomePageUserUpcomingEvents')
  async getHomePageUserUpcomingEvents(userId: number): Promise<EventEntity[]> {
    const result = await this.getAttendingEvents(userId, {
      limit: 5,
      upcomingOnly: true,
    });

    this.logger.debug(
      `Found ${result.events.length} upcoming events for user ${userId}`,
    );

    return result.events as EventEntity[];
  }

  @Trace('event-query.findEventTopicsByEventId')
  findEventTopicsByEventId(): Promise<any[]> {
    return Promise.resolve([]);
  }

  @Trace('event-query.showEventAttendees')
  async showEventAttendees(
    slug: string,
    pagination: PaginationDto,
  ): Promise<any> {
    await this.initializeRepository();
    const event = await this.findEventBySlug(slug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }
    return this.eventAttendeeService.showEventAttendees(event.id, pagination);
  }

  @Trace('event-query.findById')
  async findById(id: number, _tenantId: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (event) {
      return this.addRecurrenceInformation(event);
    }

    return event;
  }

  /**
   * Tenant-aware version of showEventBySlug that doesn't rely on the request context
   * This is useful for background processing where the request context is not available
   */
  @Trace('event-query.showEventBySlugWithTenant')
  async showEventBySlugWithTenant(
    slug: string,
    tenantId?: string,
  ): Promise<EventEntity | null> {
    // If tenantId is not provided, try to use the one from the request
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    // Get a connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    const eventRepo = dataSource.getRepository(EventEntity);

    // Find the event using the provided tenant connection
    const event = await eventRepo.findOne({
      where: { slug },
      relations: ['user', 'group'],
    });

    if (!event) {
      this.logger.warn(
        `Event with slug ${slug} not found in tenant ${effectiveTenantId}`,
      );
      return null;
    }

    return this.addRecurrenceInformation(event);
  }

  /**
   * Find all events that have a specific parent event ID
   * Useful for finding split points and occurrences of a parent event
   */
  @Trace('event-query.findEventsByParentId')
  async findEventsByParentId(parentId: number): Promise<EventEntity[]> {
    await this.initializeRepository();

    // Use query builder to support fields that aren't in TypeORM entity definition
    const events = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.parentEventId = :parentId', { parentId })
      .orderBy('event.originalDate', 'ASC')
      .getMany();

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
  }

  /**
   * Enhance event entity with recurrence information
   * This adds a human-readable description of the recurrence pattern and other helpful properties
   * @deprecated Event recurrence is now handled by EventSeriesOccurrence service
   */
  @Trace('event-query.addRecurrenceInformation')
  private addRecurrenceInformation(event: EventEntity): EventEntity {
    if (!event) {
      return event;
    }

    // If the event is part of a series, it's already handled by EventSeriesOccurrenceService
    if (event.seriesSlug) {
      return event;
    }

    // For backward compatibility with old recurring events
    const eventWithRecurrence = event as EventEntity & {
      isRecurring?: boolean;
      recurrenceRule?: {
        frequency?: string;
        interval?: number;
      };
      recurrenceDescription?: string;
    };

    if (eventWithRecurrence.isRecurring && eventWithRecurrence.recurrenceRule) {
      const rule = eventWithRecurrence.recurrenceRule;
      const freq = rule.frequency?.toLowerCase() || 'weekly';
      const interval = rule.interval || 1;

      let recurrenceDescription = `Every ${interval > 1 ? interval : ''} ${freq}`;
      if (interval > 1) {
        recurrenceDescription += freq.endsWith('s') ? '' : 's';
      }

      eventWithRecurrence.recurrenceDescription = recurrenceDescription;
    }

    return event;
  }

  async findEventByDateAndSeries(
    date: Date,
    seriesSlug: string,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();
    return this.eventRepository.findOne({
      where: {
        startDate: date,
        seriesSlug,
      },
      relations: ['user', 'group', 'categories', 'image'],
    });
  }

  /**
   * Find events by Bluesky source information (did and rkey)
   */
  @Trace('event-query.findByBlueskySource')
  async findByBlueskySource(source: {
    did: string;
    rkey: string;
  }): Promise<EventEntity[]> {
    await this.initializeRepository();

    const queryBuilder = this.eventRepository.createQueryBuilder('event');

    queryBuilder
      .where('event.sourceType = :sourceType', { sourceType: 'bluesky' })
      .andWhere('event.sourceId = :did', { did: source.did })
      .andWhere(`event.sourceData->>'rkey' = :rkey`, { rkey: source.rkey })
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .leftJoinAndSelect('event.series', 'series');

    const events = await queryBuilder.getMany();

    return events;
  }

  /**
   * Find events by source information (sourceId and sourceType)
   */
  @Trace('event-query.findBySourceAttributes')
  async findBySourceAttributes(
    sourceId: string,
    sourceType: string,
    tenantId: string,
  ): Promise<EventEntity[]> {
    // Get tenant connection for the specified tenant
    const tenantConnection =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const eventRepo = tenantConnection.getRepository(EventEntity);

    this.logger.debug(
      `Finding events with sourceId: ${sourceId} and sourceType: ${sourceType} in tenant: ${tenantId}`,
    );

    const queryBuilder = eventRepo.createQueryBuilder('event');

    queryBuilder
      .where('event.sourceType = :sourceType', { sourceType })
      .andWhere('event.sourceId = :sourceId', { sourceId })
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .leftJoinAndSelect('event.series', 'series');

    const events = await queryBuilder.getMany();
    this.logger.debug(`Found ${events.length} events matching source criteria`);

    return events;
  }

  /**
   * Find events by atprotoUri (for native OpenMeet events)
   */
  @Trace('event-query.findByAtprotoUri')
  async findByAtprotoUri(
    atprotoUri: string,
    tenantId: string,
  ): Promise<EventEntity[]> {
    const tenantConnection =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const eventRepo = tenantConnection.getRepository(EventEntity);

    this.logger.debug(`Finding events with atprotoUri: ${atprotoUri}`);

    const events = await eventRepo.find({
      where: { atprotoUri },
      relations: ['user', 'categories', 'image', 'series'],
    });

    this.logger.debug(`Found ${events.length} events by atprotoUri`);
    return events;
  }

  /**
   * Find all events (occurrences) that belong to a series by the series slug
   */
  @Trace('event-query.findEventsBySeriesSlug')
  async findEventsBySeriesSlug(
    seriesSlug: string,
    options?: { page: number; limit: number },
  ): Promise<[EventEntity[], number]> {
    try {
      await this.initializeRepository();

      const page = options?.page || 1;
      const limit = options?.limit || 10;

      this.logger.debug(`Finding events for series slug ${seriesSlug}`);

      // Direct query by seriesSlug
      const queryBuilder = this.eventRepository
        .createQueryBuilder('event')
        .where('event.seriesSlug = :seriesSlug', { seriesSlug })
        .leftJoinAndSelect('event.user', 'user')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.image', 'image')
        .orderBy('event.startDate', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      try {
        const [events, total] = await queryBuilder.getManyAndCount();
        this.logger.debug(
          `Found ${events.length} events for series slug ${seriesSlug}`,
        );
        return [events, total];
      } catch (queryError) {
        this.logger.error(`Database query error: ${queryError.message}`);
        return [[], 0];
      }
    } catch (error) {
      this.logger.error(
        `Error finding events by series slug: ${error.message}`,
        error.stack,
      );
      return [[], 0]; // Return empty results instead of throwing to prevent hanging
    }
  }

  /**
   * Find all events (occurrences) that belong to a series by ID
   * @internal This method is primarily for internal use - prefer findEventsBySeriesSlug for user-facing code
   */
  @Trace('event-query.findEventsBySeriesId')
  async findEventsBySeriesId(
    seriesId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventEntity[], number]> {
    try {
      await this.initializeRepository();

      const page = options?.page || 1;
      const limit = options?.limit || 10;

      this.logger.debug(
        `Finding events for series ID ${seriesId}, page ${page}, limit ${limit}`,
      );

      // Get the series to find its slug since we need to query by slug, not ID
      const tenantId = this.request.tenantId;
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const seriesRepository = dataSource.getRepository(EventSeriesEntity);
      const series = await seriesRepository.findOne({
        where: { id: seriesId },
      });

      if (!series) {
        this.logger.warn(`Series with ID ${seriesId} not found`);
        return [[], 0];
      }

      // Forward to the slug-based method
      return await this.findEventsBySeriesSlug(series.slug, options);
    } catch (error) {
      this.logger.error(
        `Error finding events by seriesId: ${error.message}`,
        error.stack,
      );
      return [[], 0];
    }
  }

  /**
   * Find all events for a specific user (organized or attended)
   * Used by calendar feed generation
   */
  @Trace('event-query.findUserEvents')
  async findUserEvents(
    userId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.series', 'series')
      .leftJoinAndSelect('event.attendees', 'attendees')
      .where('(event.userId = :userId OR attendees.userId = :userId)', {
        userId,
      })
      .andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .orderBy('event.startDate', 'ASC');

    // Apply date filters if provided
    if (startDate) {
      query.andWhere('event.startDate >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('event.startDate <= :endDate', { endDate });
    }

    return query.getMany();
  }

  /**
   * Find all events for a specific group
   * Used by calendar feed generation
   */
  @Trace('event-query.findGroupEvents')
  async findGroupEvents(
    groupSlug: string,
    startDate?: string,
    endDate?: string,
    userId?: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    let query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.series', 'series')
      .where('group.slug = :groupSlug', { groupSlug })
      .andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.Published, EventStatus.Cancelled],
      });

    // For private groups, ensure user is a member (if userId provided)
    if (userId) {
      query = query
        .leftJoin('group.groupMembers', 'groupMembers')
        .andWhere(
          '(group.visibility = :publicVisibility OR groupMembers.userId = :userId)',
          {
            publicVisibility: 'public',
            userId,
          },
        );
    } else {
      // No user context, only return public group events
      query = query.andWhere('group.visibility = :publicVisibility', {
        publicVisibility: 'public',
      });
    }

    // Apply date filters if provided
    if (startDate) {
      query.andWhere('event.startDate >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('event.startDate <= :endDate', { endDate });
    }

    query = query.orderBy('event.startDate', 'ASC');

    const nativeEvents = await query.getMany();

    // Include events from followed DIDs via Contrail
    // Need group ID — get it from the first native event or look up separately
    let groupId: number | null = null;
    if (nativeEvents.length > 0 && nativeEvents[0].group?.id) {
      groupId = nativeEvents[0].group.id;
    } else {
      // Look up group by slug to get ID for DID follows
      const groupEntity = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .where('group.slug = :groupSlug', { groupSlug })
        .select('group.id')
        .getOne();
      groupId = groupEntity?.group?.id ?? null;
    }

    if (groupId) {
      const followedDids =
        await this.groupDidFollowService.getFollowedDidsForGroup(groupId);

      if (followedDids.length > 0) {
        const contrailConditions: ContrailCondition[] = [
          {
            sql: followedDids.map((_, i) => `did = $${i + 1}`).join(' OR '),
            params: followedDids,
          },
        ];

        if (startDate) {
          contrailConditions.push({
            sql: `record->>'startsAt' >= $1`,
            params: [startDate],
          });
        }
        if (endDate) {
          contrailConditions.push({
            sql: `record->>'startsAt' <= $1`,
            params: [endDate],
          });
        }

        const contrailResult =
          await this.contrailQueryService.find<CalendarEvent>(
            'community.lexicon.calendar.event',
            {
              conditions: contrailConditions,
              orderBy: `record->>'startsAt' ASC, uri ASC`,
              limit: 200,
              offset: 0,
            },
          );

        if (contrailResult.records.length > 0) {
          const tenantId = this.request.tenantId;
          const externalEvents =
            await this.atprotoEnrichmentService.enrichRecords(
              contrailResult.records,
              tenantId,
            );

          // Dedup against native events
          const nativeUris = new Set(
            nativeEvents.filter((e) => e.atprotoUri).map((e) => e.atprotoUri),
          );
          const dedupedExternal = externalEvents.filter(
            (e) => !e.atprotoUri || !nativeUris.has(e.atprotoUri),
          );

          const allEvents = [
            ...nativeEvents,
            ...(dedupedExternal as unknown as EventEntity[]),
          ].sort((a, b) => {
            const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
            const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
            return aDate - bDate;
          });

          return allEvents;
        }
      }
    }

    return nativeEvents;
  }

  /**
   * Get all events that have Matrix chat rooms
   */
  async getAllEventsWithMatrixRooms(
    tenantId: string,
  ): Promise<Array<{ slug: string; matrixRoomId: string; name: string }>> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const eventRepository = dataSource.getRepository(EventEntity);

    const events = await eventRepository
      .createQueryBuilder('event')
      .select(['event.slug', 'event.matrixRoomId', 'event.name'])
      .where('event.matrixRoomId IS NOT NULL')
      .getMany();

    return events.map((event) => ({
      slug: event.slug,
      matrixRoomId: event.matrixRoomId!,
      name: event.name,
    }));
  }

  /**
   * Find all events that have confirmed attendees (for Matrix sync)
   */
  async findEventsWithConfirmedAttendees(
    tenantId: string,
  ): Promise<Array<{ id: number; slug: string; name: string }>> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const eventRepository = dataSource.getRepository(EventEntity);

    const events = await eventRepository
      .createQueryBuilder('event')
      .innerJoin('event.attendees', 'attendee')
      .select(['event.id', 'event.slug', 'event.name'])
      .where('attendee.status = :status', {
        status: EventAttendeeStatus.Confirmed,
      })
      .groupBy('event.id, event.slug, event.name')
      .orderBy('event.createdAt', 'DESC')
      .getMany();

    return events.map((event) => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
    }));
  }

  @Trace('event-query.getMyEvents')
  async getMyEvents(
    userId: number,
    query: MyEventsQueryDto,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. Get events the user organizes (event.userId = userId) within date range
    const organizedEvents = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.group', 'group')
      .where('event.userId = :userId', { userId })
      .andWhere('event.startDate >= :startDate', { startDate })
      .andWhere('event.startDate <= :endDate', { endDate })
      .andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.Published, EventStatus.Cancelled],
      })
      .orderBy('event.startDate', 'ASC')
      .getMany();

    // 2. Get events the user is attending (both ATProto + local attendees)
    const attendingResult = await this.getAttendingEvents(userId, {
      limit: 500,
      startDate,
      endDate,
    });

    // 3. Build a set of organized event IDs for dedup
    const organizedIds = new Set(organizedEvents.map((e) => e.id));

    // 4. Merge: organized events first, then attending events not already in organized set
    const attendingOnly = attendingResult.events.filter((e) => {
      const eventId = (e as EventEntity).id;
      return !eventId || !organizedIds.has(eventId);
    });

    const allEvents = [...organizedEvents, ...attendingOnly];

    // 5. Batch-fetch attendee records for this user to enrich with status/role
    const localEventIds = allEvents
      .map((e) => (e as EventEntity).id)
      .filter(Boolean);

    let attendeeMap = new Map<
      number,
      { status: string; role: string | null }
    >();
    if (localEventIds.length > 0) {
      const attendeeRecords = await this.eventAttendeesRepository
        .createQueryBuilder('att')
        .where('att.userId = :userId', { userId })
        .andWhere('att.eventId IN (:...eventIds)', {
          eventIds: localEventIds,
        })
        .getMany();

      attendeeMap = new Map(
        attendeeRecords.map((att: any) => [
          att.eventId || att.event?.id,
          { status: att.status, role: att.role || null },
        ]),
      );
    }

    // 6. Resolve user DID for ATProto event organizer detection
    const userDid = await this.resolveUserDid(userId);

    // 7. Enrich each event with isOrganizer, attendeeStatus, attendeeRole
    const enriched = allEvents.map((event) => {
      const e = event as any;
      let isOrganizer = false;

      if (e.id && e.user?.id) {
        // Local EventEntity
        isOrganizer = e.user.id === userId;
      } else if (e.atprotoUri && userDid) {
        // AtprotoSourcedEvent - check if the DID in the URI matches user's DID
        const match = (e.atprotoUri as string).match(/^at:\/\/(did:[^/]+)\//);
        isOrganizer = match ? match[1] === userDid : false;
      }

      const attendee = e.id ? attendeeMap.get(e.id) : undefined;
      // If event came from attending list and no local attendee record, infer confirmed
      const isFromAttending = !organizedIds.has(e.id) || !e.id;
      const attendeeStatus = attendee
        ? attendee.status
        : isFromAttending
          ? EventAttendeeStatus.Confirmed
          : null;
      const attendeeRole = attendee ? attendee.role : null;

      return {
        ...e,
        isOrganizer,
        attendeeStatus,
        attendeeRole,
      };
    });

    // 8. Sort by startDate ASC
    enriched.sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aDate - bDate;
    });

    return enriched as EventEntity[];
  }

  private async showAllEventsWithContrail(
    pagination: PaginationDto,
    query: QueryEventDto,
    user?: any,
  ): Promise<any> {
    const { search, type, fromDate, toDate, categories, lat, lon, radius } =
      query;
    const limit = pagination.limit || 25;
    const page = pagination.page || 1;
    const offset = (page - 1) * limit;

    // Build conditions for Contrail query
    const conditions: ContrailCondition[] = [];

    if (fromDate && toDate) {
      conditions.push({
        sql: `record->>'startsAt' BETWEEN $1 AND $2`,
        params: [fromDate, toDate],
      });
    } else if (fromDate) {
      conditions.push({
        sql: `record->>'startsAt' >= $1`,
        params: [fromDate],
      });
    } else if (toDate) {
      conditions.push({
        sql: `record->>'startsAt' <= $1`,
        params: [toDate],
      });
    } else {
      const now = new Date().toISOString();
      conditions.push({
        sql: `(record->>'startsAt' ~ '^[0-9]') AND (record->>'startsAt' >= $1 OR (record->>'startsAt' <= $2 AND (record->>'endsAt') > $3))`,
        params: [now, now, now],
      });
    }

    if (search) {
      conditions.push({
        sql: `search_vector @@ plainto_tsquery($1)`,
        params: [search],
      });
    }

    if (type) {
      conditions.push({
        sql: `record->>'mode' = $1`,
        params: [type],
      });
    }

    // 1. Public events from Contrail
    let contrailResult: {
      records: ContrailRecord<CalendarEvent>[];
      total: number;
    };

    if (lat && lon) {
      const searchRadius = radius ?? DEFAULT_RADIUS;
      const radiusMeters = searchRadius * 1609.34; // Miles to meters

      contrailResult =
        await this.contrailQueryService.findWithGeoFilter<CalendarEvent>(
          'community.lexicon.calendar.event',
          { lat, lon, radiusMeters },
          {
            conditions,
            orderBy: `r.record->>'startsAt' ASC, r.uri ASC`,
            limit,
            offset,
          },
        );
    } else {
      contrailResult = await this.contrailQueryService.find<CalendarEvent>(
        'community.lexicon.calendar.event',
        {
          conditions,
          orderBy: `record->>'startsAt' ASC, uri ASC`,
          limit,
          offset,
        },
      );
    }

    // 2. Private/unlisted events from tenant table
    const privateQb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('user.photo', 'photo')
      .leftJoinAndSelect('event.image', 'image')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.group', 'group')
      .where('event.visibility IN (:...visibilities)', {
        visibilities: ['unlisted', 'private'],
      })
      .andWhere('event.status IN (:...statuses)', {
        statuses: [EventStatus.Published, EventStatus.Cancelled],
      });

    if (user?.id) {
      // Show private/unlisted events where user is creator OR attendee
      privateQb.andWhere(
        new Brackets((qb) => {
          qb.where('event.userId = :userId', { userId: user.id });
          qb.orWhere(
            `EXISTS (SELECT 1 FROM "eventAttendees" ea WHERE ea."eventId" = event.id AND ea."userId" = :attendeeUserId)`,
            { attendeeUserId: user.id },
          );
        }),
      );
    } else {
      privateQb.andWhere('1 = 0');
    }

    if (fromDate) {
      privateQb.andWhere('event.startDate >= :fromDate', { fromDate });
    } else {
      privateQb.andWhere('event.startDate >= :now', { now: new Date() });
    }
    if (toDate) {
      privateQb.andWhere('event.startDate <= :toDate', { toDate });
    }

    if (categories && categories.length > 0) {
      const likeConditions = categories
        .map(
          (_: string, index: number) =>
            `categories.name LIKE :category${index}`,
        )
        .join(' OR ');
      const likeParameters = categories.reduce(
        (acc: Record<string, string>, category: string, index: number) => {
          acc[`category${index}`] = `%${category}%`;
          return acc;
        },
        {} as Record<string, string>,
      );
      privateQb.andWhere(`(${likeConditions})`, likeParameters);
    }

    if (lat && lon) {
      const searchRadius = radius ?? DEFAULT_RADIUS;
      privateQb.andWhere(
        `ST_DWithin(
          event.locationPoint,
          ST_SetSRID(ST_MakePoint(:pLon, :pLat), ${PostgisSrid.SRID}),
          :pRadius
        )`,
        { pLon: lon, pLat: lat, pRadius: searchRadius * 1609.34 },
      );
    }

    privateQb.orderBy('event.startDate', 'ASC');
    const privateEvents = await privateQb.getMany();

    // Phases 3-5: Enrich ATProto records (tenant metadata + handle resolution)
    const tenantId = this.request.tenantId;
    let enrichedPublic = await this.atprotoEnrichmentService.enrichRecords(
      contrailResult.records,
      tenantId,
    );

    // Phase 4: Category filter (in-memory via tenant metadata)
    enrichedPublic = this.atprotoEnrichmentService.filterByCategories(
      enrichedPublic,
      categories,
    );

    // Phase 6: Dedup and merge
    const publicUriSet = new Set(
      enrichedPublic.map((e) => e.atprotoUri).filter(Boolean),
    );
    const dedupedPrivate =
      this.atprotoEnrichmentService.deduplicatePrivateEvents(
        privateEvents,
        publicUriSet,
      );

    // Batch-fetch attendee counts for private/unlisted events
    const privateEventIds = dedupedPrivate.filter((e) => e.id).map((e) => e.id);
    if (privateEventIds.length > 0) {
      const counts = await this.eventAttendeesRepository
        .createQueryBuilder('att')
        .select('att.eventId', 'eventId')
        .addSelect('COUNT(att.id)', 'count')
        .where('att.eventId IN (:...eventIds)', { eventIds: privateEventIds })
        .andWhere('att.status = :status', {
          status: EventAttendeeStatus.Confirmed,
        })
        .groupBy('att.eventId')
        .getRawMany();

      const countMap = new Map(
        counts.map((c: any) => [c.eventId, parseInt(c.count, 10)]),
      );
      dedupedPrivate.forEach((event: any) => {
        if (event.id && countMap.has(event.id)) {
          event.attendeesCount = countMap.get(event.id);
        }
      });
    }

    const allEvents = [...enrichedPublic, ...dedupedPrivate]
      .sort((a, b) => {
        const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
        return aDate - bDate;
      })
      .slice(0, limit);

    let publicTotal = contrailResult.total;
    if (categories && categories.length > 0) {
      publicTotal = enrichedPublic.length;
    }
    const total = publicTotal + dedupedPrivate.length;

    return {
      data: allEvents,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    } as PaginationResult<Partial<EventEntity>>;
  }

  @Trace('event-query.resolveForAttendance')
  async resolveForAttendance(slug: string): Promise<ResolvedEvent> {
    await this.initializeRepository();

    const atprotoSlug = this.atprotoEnrichmentService.parseAtprotoSlug(slug);
    if (atprotoSlug) {
      const uri = `at://${atprotoSlug.did}/${BLUESKY_COLLECTIONS.EVENT}/${atprotoSlug.rkey}`;

      // Check if a local tenant event exists with this atprotoUri.
      // Users navigate to events via AT Protocol slug even when the
      // event is hosted by this tenant — use the tenant path for
      // local attendee records, authorization, and activity metadata.
      const tenantEvent = await this.eventRepository.findOne({
        where: { atprotoUri: uri },
        relations: ['group', 'user'],
      });
      if (tenantEvent) {
        return this.buildResolvedEvent(tenantEvent, uri);
      }

      // Truly foreign event — exists only in Contrail
      const record = await this.contrailQueryService.findByUri(
        BLUESKY_COLLECTIONS.EVENT,
        uri,
      );
      if (!record) {
        throw new NotFoundException(`Event ${slug} not found in Contrail`);
      }
      return {
        tenantEvent: null,
        uri,
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      };
    }

    // Regular slug — look up in tenant DB
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'user'],
    });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    return this.buildResolvedEvent(event, event.atprotoUri || null);
  }

  private buildResolvedEvent(
    event: EventEntity,
    uri: string | null,
  ): ResolvedEvent {
    return {
      tenantEvent: event,
      uri,
      isPublic: event.visibility !== EventVisibility.Private,
      requiresApproval: event.requireApproval || false,
      allowWaitlist: event.allowWaitlist || false,
      maxAttendees: event.maxAttendees || 0,
      requireGroupMembership: event.requireGroupMembership || false,
    };
  }
}
