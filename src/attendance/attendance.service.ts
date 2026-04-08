import {
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
import { EventVisibility } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ContrailQueryService } from '../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../atproto-enrichment/atproto-enrichment.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';
import { BLUESKY_COLLECTIONS } from '../bluesky/BlueskyTypes';
import { ResolvedEvent } from './types';
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
    private readonly eventAttendeeService: EventAttendeeService,
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
}
