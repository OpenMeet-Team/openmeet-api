import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  EventVisibility,
} from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ContrailQueryService } from '../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../atproto-enrichment/atproto-enrichment.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';
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
    private readonly identityService: UserAtprotoIdentityService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly eventRoleService: EventRoleService,
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
      isPublic: event.visibility === EventVisibility.Public,
      requiresApproval: event.requireApproval || false,
    };
  }

  @Trace('attendance.recordAttendance')
  async recordAttendance(
    slug: string,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const resolved = await this.resolveEvent(slug);

    if (!resolved.isPublic) {
      return this.recordPrivateAttendance(resolved, userUlid, status);
    }

    if (resolved.requiresApproval) {
      return this.recordPublicWithOverlay(resolved, userUlid, status);
    }

    return this.recordPublicSimple(resolved, userUlid, status);
  }

  private async recordPublicSimple(
    resolved: ResolvedEvent,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const did = await this.resolveUserDid(userUlid);

    const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
      resolved.uri!,
      status,
      did,
      this.request.tenantId,
    );

    this.emitAttendanceChanged(resolved, userUlid, did, status);

    return {
      status,
      rsvpUri: pdsResult.rsvpUri,
      attendeeId: null,
      eventUri: resolved.uri,
    };
  }

  private async recordPrivateAttendance(
    resolved: ResolvedEvent,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const event = resolved.tenantEvent!;
    const user = await this.resolveUser(userUlid);
    const attendeeStatus = this.mapToAttendeeStatus(status);
    const role = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Participant,
    );

    const attendee = await this.eventAttendeeService.create({
      event,
      user,
      status: attendeeStatus,
      role,
    } as any);

    this.emitAttendanceChanged(resolved, userUlid, null, status);

    return {
      status,
      rsvpUri: null,
      attendeeId: attendee.id,
      eventUri: null,
    };
  }

  private async recordPublicWithOverlay(
    resolved: ResolvedEvent,
    userUlid: string,
    status: RsvpStatusShort,
  ): Promise<AttendanceResult> {
    const did = await this.resolveUserDid(userUlid);

    let rsvpUri: string | null = null;
    try {
      const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
        resolved.uri!,
        status,
        did,
        this.request.tenantId,
      );
      rsvpUri = pdsResult.rsvpUri;
    } catch (error) {
      this.logger.warn(
        `[recordAttendance] PDS publish failed for approval-gated event, continuing with local record: ${error.message}`,
      );
    }

    const user = await this.resolveUser(userUlid);
    const role = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Participant,
    );

    const createDto: any = {
      event: resolved.tenantEvent!,
      user,
      status: EventAttendeeStatus.Pending,
      role,
    };

    if (!resolved.tenantEvent) {
      createDto.eventUri = resolved.uri;
    }

    const attendee = await this.eventAttendeeService.create(createDto);

    this.emitAttendanceChanged(resolved, userUlid, did, status);

    return {
      status: 'pending',
      rsvpUri,
      attendeeId: attendee.id,
      eventUri: resolved.uri,
    };
  }

  @Trace('attendance.cancelAttendance')
  async cancelAttendance(
    slug: string,
    userUlid: string,
  ): Promise<AttendanceResult> {
    const resolved = await this.resolveEvent(slug);

    if (resolved.isPublic) {
      const did = await this.resolveUserDid(userUlid);

      const pdsResult = await this.blueskyRsvpService.createRsvpByUri(
        resolved.uri!,
        'notgoing',
        did,
        this.request.tenantId,
      );

      // If a local record exists (role/approval overlay), cancel it too
      if (resolved.tenantEvent) {
        const user = await this.resolveUser(userUlid);
        try {
          await this.eventAttendeeService.cancelEventAttendanceBySlug(
            resolved.tenantEvent.slug,
            user.slug,
          );
        } catch {
          // No local record to cancel — that's fine for simple public RSVPs
        }
      }

      this.emitAttendanceChanged(resolved, userUlid, did, 'notgoing', 'going');

      return {
        status: 'notgoing',
        rsvpUri: pdsResult.rsvpUri,
        attendeeId: null,
        eventUri: resolved.uri,
      };
    }

    // Private event — cancel local record
    const user = await this.resolveUser(userUlid);
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
      attendee.status,
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

  private async resolveUser(userUlid: string) {
    const user = await this.userService.findByUlid(userUlid);
    if (!user) {
      throw new NotFoundException(`User with ULID ${userUlid} not found`);
    }
    return user;
  }

  private async resolveUserDid(userUlid: string): Promise<string> {
    const identity = await this.identityService.findByUserUlid(
      this.request.tenantId,
      userUlid,
    );
    if (!identity) {
      throw new BadRequestException(
        'User has no AT Protocol identity. Link a Bluesky account to RSVP to public events.',
      );
    }
    return identity.did;
  }

  private mapToAttendeeStatus(status: RsvpStatusShort): EventAttendeeStatus {
    switch (status) {
      case 'going':
        return EventAttendeeStatus.Confirmed;
      case 'interested':
        return EventAttendeeStatus.Maybe;
      case 'notgoing':
        return EventAttendeeStatus.Cancelled;
    }
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
