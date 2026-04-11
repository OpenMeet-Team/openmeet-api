import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Agent } from '@atproto/api';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  EventVisibility,
  GroupRole,
} from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ContrailQueryService } from '../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../atproto-enrichment/atproto-enrichment.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { PdsSessionService } from '../pds/pds-session.service';
import { SessionUnavailableError } from '../pds/pds.errors';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';
import { GroupMemberQueryService } from '../group-member/group-member-query.service';
import { BLUESKY_COLLECTIONS, RsvpStatusShort } from '../bluesky/BlueskyTypes';
import {
  AttendanceChangedEvent,
  AttendanceResult,
  ResolvedEvent,
} from './types';
import { Trace } from '../utils/trace.decorator';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly contrailQueryService: ContrailQueryService,
    private readonly atprotoEnrichmentService: AtprotoEnrichmentService,
    private readonly blueskyRsvpService: BlueskyRsvpService,
    @Inject(forwardRef(() => PdsSessionService))
    private readonly pdsSessionService: PdsSessionService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly eventRoleService: EventRoleService,
    @Inject(forwardRef(() => GroupMemberQueryService))
    private readonly groupMemberQueryService: GroupMemberQueryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async initializeRepository(): Promise<void> {
    if (!this.eventRepository) {
      const dataSource = await this.tenantConnectionService.getTenantConnection(
        this.request.tenantId,
      );
      this.eventRepository = dataSource.getRepository(EventEntity);
    }
  }

  @Trace('attendance.resolveEvent')
  async resolveEvent(slug: string): Promise<ResolvedEvent> {
    await this.initializeRepository();

    const atprotoSlug = this.atprotoEnrichmentService.parseAtprotoSlug(slug);
    if (atprotoSlug) {
      const uri = `at://${atprotoSlug.did}/${BLUESKY_COLLECTIONS.EVENT}/${atprotoSlug.rkey}`;
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

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'user'],
    });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    return {
      tenantEvent: event,
      uri: event.atprotoUri || null,
      // Public and Unlisted events allow any authenticated user to RSVP;
      // only Private events require an invitation or group membership.
      isPublic: event.visibility !== EventVisibility.Private,
      requiresApproval: event.requireApproval || false,
      allowWaitlist: event.allowWaitlist || false,
      maxAttendees: event.maxAttendees || 0,
      requireGroupMembership: event.requireGroupMembership || false,
    };
  }

  @Trace('attendance.recordAttendance')
  async recordAttendance(
    slug: string,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const resolved = await this.resolveEvent(slug);
    const user = await this.resolveUser(userUlid);

    await this.authorizeAttendance(resolved, user.id);

    if (!resolved.isPublic) {
      return this.recordPrivateAttendance(resolved, user, status);
    }

    // Tenant events always need a local attendee record (for queries, roles, etc.)
    if (resolved.tenantEvent) {
      return this.recordPublicWithOverlay(resolved, user, userUlid, status);
    }

    // Contrail-only events (no local DB row) — PDS write only
    return this.recordPublicSimple(resolved, userUlid, status);
  }

  private async recordPublicSimple(
    resolved: ResolvedEvent,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const session = await this.getSessionAgent(userUlid);

    const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
      resolved.uri!,
      status,
      session.did,
      this.request.tenantId,
      session.agent,
    );

    this.emitAttendanceChanged(resolved, userUlid, session.did, status);

    return {
      status,
      rsvpUri: pdsResult.rsvpUri,
      attendeeId: null,
      eventUri: resolved.uri,
    };
  }

  private async recordPrivateAttendance(
    resolved: ResolvedEvent,
    user: { id: number; ulid?: string; slug?: string; [key: string]: any },
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const { attendee, previousStatus, changed } = await this.upsertAttendee(
      resolved,
      user,
      status,
    );

    if (changed) {
      this.emitAttendanceChanged(
        resolved,
        user.ulid!,
        null,
        status,
        previousStatus,
      );
    }

    return {
      status,
      rsvpUri: null,
      attendeeId: attendee.id,
      eventUri: null,
    };
  }

  private async recordPublicWithOverlay(
    resolved: ResolvedEvent,
    user: { id: number; ulid?: string; slug?: string; [key: string]: any },
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    // PDS publish is best-effort — users without AT Protocol identity
    // (e.g. quick-rsvp guests) still get a local attendee record.
    let rsvpUri: string | null = null;
    let userDid: string | null = null;
    try {
      const session = await this.getSessionAgent(userUlid);
      userDid = session.did;
      const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
        resolved.uri!,
        status,
        session.did,
        this.request.tenantId,
        session.agent,
      );
      rsvpUri = pdsResult.rsvpUri;
    } catch (error) {
      this.logger.warn(
        `PDS publish failed, continuing with local record: ${error.message}`,
      );
    }

    const { attendee, previousStatus, changed } = await this.upsertAttendee(
      resolved,
      user,
      status,
    );

    // Emit the actual attendee status (may differ from requested —
    // e.g. 'going' becomes 'pending' when event requires approval).
    const actualStatus =
      attendee.status === EventAttendeeStatus.Pending ? 'pending' : status;

    if (changed) {
      this.emitAttendanceChanged(
        resolved,
        userUlid,
        userDid,
        actualStatus,
        previousStatus,
      );
    }

    return {
      status: actualStatus,
      rsvpUri,
      attendeeId: attendee.id,
      eventUri: resolved.uri,
    };
  }

  private async upsertAttendee(
    resolved: ResolvedEvent,
    user: { id: number; [key: string]: any },
    status: RsvpStatusShort,
  ): Promise<{
    attendee: any;
    isNew: boolean;
    previousStatus: string | null;
    changed: boolean;
  }> {
    const event = resolved.tenantEvent!;
    const existing = await this.eventAttendeeService.findEventAttendeeByUserId(
      event.id,
      user.id,
    );
    const attendeeStatus =
      status === 'notgoing'
        ? EventAttendeeStatus.Cancelled
        : await this.calculateStatus(resolved);

    if (existing) {
      if (
        existing.status === attendeeStatus &&
        existing.status !== EventAttendeeStatus.Cancelled
      ) {
        return {
          attendee: existing,
          isNew: false,
          previousStatus: null,
          changed: false,
        };
      }
      const previousStatus = existing.status;
      existing.status = attendeeStatus;
      const roleName = await this.determineRole(resolved, user.id);
      existing.role = await this.eventRoleService.getRoleByName(roleName);
      const updated = await this.eventAttendeeService.save(existing);
      return { attendee: updated, isNew: false, previousStatus, changed: true };
    }

    // New record
    const roleName = await this.determineRole(resolved, user.id);
    const role = await this.eventRoleService.getRoleByName(roleName);
    const attendee = await this.eventAttendeeService.create({
      event,
      user,
      status: attendeeStatus,
      role,
    } as any);
    return { attendee, isNew: true, previousStatus: null, changed: true };
  }

  private async calculateStatus(
    resolved: ResolvedEvent,
  ): Promise<EventAttendeeStatus> {
    if (resolved.requiresApproval) {
      return EventAttendeeStatus.Pending;
    }
    if (resolved.allowWaitlist && resolved.maxAttendees > 0) {
      const count = await this.eventAttendeeService.showEventAttendeesCount(
        resolved.tenantEvent!.id,
      );
      if (count >= resolved.maxAttendees) {
        return EventAttendeeStatus.Waitlist;
      }
    }
    return EventAttendeeStatus.Confirmed;
  }

  private async determineRole(
    resolved: ResolvedEvent,
    userId: number,
  ): Promise<EventAttendeeRole> {
    const event = resolved.tenantEvent!;

    // Event creator is always Host
    if (event.user && event.user.id === userId) {
      return EventAttendeeRole.Host;
    }

    // Group owner/admin is Host
    if (event.group?.id) {
      try {
        const member =
          await this.groupMemberQueryService.findGroupMemberByUserId(
            event.group.id,
            userId,
            this.request.tenantId,
          );
        if (
          member?.groupRole?.name === 'owner' ||
          member?.groupRole?.name === 'admin'
        ) {
          return EventAttendeeRole.Host;
        }
      } catch {
        // Not a group member — fall through to Participant
      }
    }

    return EventAttendeeRole.Participant;
  }

  @Trace('attendance.cancelAttendance')
  async cancelAttendance(
    slug: string,
    userUlid: string,
  ): Promise<AttendanceResult> {
    const resolved = await this.resolveEvent(slug);

    if (resolved.isPublic) {
      // PDS cancel is best-effort — users without ATProto identity
      // (e.g. quick-rsvp guests) still get their local record cancelled.
      let rsvpUri: string | null = null;
      let userDid: string | null = null;
      if (resolved.uri) {
        try {
          const session = await this.getSessionAgent(userUlid);
          userDid = session.did;
          const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
            resolved.uri,
            'notgoing',
            session.did,
            this.request.tenantId,
            session.agent,
          );
          rsvpUri = pdsResult.rsvpUri;
        } catch (error) {
          this.logger.warn(
            `PDS cancel failed, continuing with local record: ${error.message}`,
          );
        }
      }

      // If a local record exists, cancel it and capture actual previous status
      let cancelledAttendeeId: number | null = null;
      let previousStatus: string | null = null;
      if (resolved.tenantEvent) {
        const user = await this.resolveUser(userUlid);
        try {
          const existing =
            await this.eventAttendeeService.findEventAttendeeByUserSlug(
              resolved.tenantEvent.slug,
              user.slug,
            );
          previousStatus = existing?.status ?? null;
          const cancelled =
            await this.eventAttendeeService.cancelEventAttendanceBySlug(
              resolved.tenantEvent.slug,
              user.slug,
            );
          cancelledAttendeeId = cancelled?.id ?? null;
        } catch {
          // No local record to cancel — that's fine for Contrail-only RSVPs
        }
      }

      this.emitAttendanceChanged(
        resolved,
        userUlid,
        userDid,
        'notgoing',
        previousStatus,
      );

      return {
        status: 'notgoing',
        rsvpUri,
        attendeeId: cancelledAttendeeId,
        eventUri: resolved.uri,
      };
    }

    // Private event — cancel local record
    const user = await this.resolveUser(userUlid);

    // Capture previous status before the cancel mutates it
    const existingAttendee =
      await this.eventAttendeeService.findEventAttendeeByUserSlug(
        resolved.tenantEvent!.slug,
        user.slug,
      );
    const previousStatus = existingAttendee?.status ?? null;

    const attendee =
      await this.eventAttendeeService.cancelEventAttendanceBySlug(
        resolved.tenantEvent!.slug,
        user.slug,
      );

    this.emitAttendanceChanged(
      resolved,
      userUlid,
      null,
      'notgoing',
      previousStatus,
    );

    return {
      status: 'notgoing',
      rsvpUri: null,
      attendeeId: attendee.id,
      eventUri: null,
    };
  }

  /**
   * Check if a user is attending a public event by querying the Contrail RSVP table.
   * For public events, the Contrail RSVP table is the source of truth.
   */
  @Trace('attendance.isAttending')
  async isAttending(
    eventUri: string,
    userDid: string,
  ): Promise<{ attending: boolean; status: string | null }> {
    const rsvpRecords = await this.contrailQueryService.find(
      BLUESKY_COLLECTIONS.RSVP,
      {
        conditions: [
          { sql: "record->'subject'->>'uri' = $1", params: [eventUri] },
          { sql: 'did = $1', params: [userDid] },
        ],
        limit: 1,
      },
    );

    if (rsvpRecords.records.length === 0) {
      return { attending: false, status: null };
    }

    const record = rsvpRecords.records[0].record as any;
    const fullStatus = record.status as string;
    // Strip NSID prefix: "community.lexicon.calendar.rsvp#going" -> "going"
    const shortStatus = fullStatus.includes('#')
      ? fullStatus.split('#')[1]
      : fullStatus;

    return {
      attending: shortStatus !== 'notgoing',
      status: shortStatus,
    };
  }

  private async authorizeAttendance(
    resolved: ResolvedEvent,
    userId: number,
  ): Promise<void> {
    const event = resolved.tenantEvent;
    if (!event) return; // Foreign events are always public, no auth needed

    // Private event access control
    if (!resolved.isPublic) {
      if (event.user && event.user.id === userId) return; // Creator always allowed

      const existing =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );
      if (existing) return; // Already an attendee

      if (event.group?.id) {
        const member =
          await this.groupMemberQueryService.findGroupMemberByUserId(
            event.group.id,
            userId,
            this.request.tenantId,
          );
        if (!member) {
          throw new ForbiddenException(
            'You must be invited to RSVP to this private event',
          );
        }
      } else {
        throw new ForbiddenException(
          'You must be invited to RSVP to this private event',
        );
      }
    }

    // Group membership requirement (applies to public events too)
    if (resolved.requireGroupMembership && event.group) {
      const member = await this.groupMemberQueryService.findGroupMemberByUserId(
        event.group.id,
        userId,
        this.request.tenantId,
      );
      if (!member) {
        throw new BadRequestException(
          `You must be a member of the "${event.group.slug}" group to attend this event.`,
        );
      }
      if (member.groupRole?.name === GroupRole.Guest) {
        throw new BadRequestException(
          'Guests are not allowed to attend this event. Please contact a group admin to change your role.',
        );
      }
    }
  }

  private async resolveUser(userUlid: string) {
    const user = await this.userService.findByUlid(userUlid);
    if (!user) {
      throw new NotFoundException(`User with ULID ${userUlid} not found`);
    }
    return user;
  }

  private async getSessionAgent(
    userUlid: string,
  ): Promise<{ did: string; agent: Agent }> {
    let session;
    try {
      session = await this.pdsSessionService.getSessionForUser(
        this.request.tenantId,
        userUlid,
      );
    } catch (error) {
      if (error instanceof SessionUnavailableError) {
        throw new BadRequestException(
          'Your AT Protocol session has expired. Please link your AT Protocol account again to continue publishing.',
        );
      }
      throw error;
    }

    if (!session) {
      throw new BadRequestException(
        'User has no AT Protocol identity. Link an AT Protocol account to RSVP to public events.',
      );
    }

    return { did: session.did, agent: session.agent };
  }

  private emitAttendanceChanged(
    resolved: ResolvedEvent,
    userUlid: string,
    userDid: string | null,
    status: string,
    previousStatus: string | null = null,
  ): void {
    this.eventEmitter.emit('attendance.changed', {
      status,
      previousStatus,
      eventUri: resolved.uri,
      eventId: resolved.tenantEvent?.id ?? null,
      eventSlug: resolved.tenantEvent?.slug ?? null,
      userUlid,
      userDid,
      tenantId: this.request.tenantId,
    } satisfies AttendanceChangedEvent);
  }
}
