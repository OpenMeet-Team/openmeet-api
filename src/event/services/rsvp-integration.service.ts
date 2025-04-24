import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ExternalRsvpDto } from '../dto/external-rsvp.dto';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../../core/constants/constant';
import { Trace } from '../../utils/trace.decorator';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class RsvpIntegrationService {
  private readonly logger = new Logger(RsvpIntegrationService.name);

  constructor(
    private readonly tenantService: TenantConnectionService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventRoleService: EventRoleService,
    @InjectMetric('rsvp_integration_processed_total')
    private readonly processedCounter: Counter<string>,
    @InjectMetric('rsvp_integration_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
  ) {}

  /**
   * Process an external RSVP and create or update attendance record
   * @param rsvpData External RSVP data
   * @param tenantId Tenant ID where the attendance record should be stored
   */
  @Trace('rsvp-integration.processExternalRsvp')
  async processExternalRsvp(rsvpData: ExternalRsvpDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(`Processing external RSVP for tenant ${tenantId}`);

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: rsvpData.eventSourceType,
      operation: 'process',
    });

    try {
      // Get the tenant connection - needed for shadow account service
      await this.tenantService.getTenantConnection(tenantId);

      // Find the event by source attributes
      const events = await this.eventQueryService.findBySourceAttributes(
        rsvpData.eventSourceId,
        rsvpData.eventSourceType,
        tenantId,
      );

      if (!events.length) {
        throw new Error(
          `Event with source ID ${rsvpData.eventSourceId} not found`,
        );
      }

      const event = events[0];

      // Create or find shadow account for the user
      const user = await this.shadowAccountService.findOrCreateShadowAccount(
        rsvpData.userDid,
        rsvpData.userHandle,
        AuthProvidersEnum.bluesky,
        tenantId,
        {
          bluesky: {
            did: rsvpData.userDid,
            handle: rsvpData.userHandle,
          },
        },
      );

      // Map Bluesky status to OpenMeet status
      const statusMap = {
        interested: EventAttendeeStatus.Maybe,
        going: EventAttendeeStatus.Confirmed,
        notgoing: EventAttendeeStatus.Cancelled,
      };

      const status = statusMap[rsvpData.status] || EventAttendeeStatus.Pending;

      // Find existing attendee record
      const existingAttendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          user.id,
        );

      // Get participant role
      const participantRole = await this.eventRoleService.getRoleByName(
        EventAttendeeRole.Participant,
      );

      // Increment the processed counter
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: rsvpData.eventSourceType,
        operation: existingAttendee ? 'update' : 'create',
      });

      if (existingAttendee) {
        this.logger.debug(
          `Found existing attendance record with ID ${existingAttendee.id}, updating it`,
        );

        // Update existing record
        await this.eventAttendeeService.updateEventAttendee(
          existingAttendee.id,
          { status, role: EventAttendeeRole.Participant },
        );

        // Get the updated record
        const updatedAttendee = await this.eventAttendeeService.findOne({
          id: existingAttendee.id,
        });

        timer();
        return updatedAttendee;
      } else {
        this.logger.debug(
          'No existing attendance record found, creating a new one',
        );

        // Create new attendee record
        const newAttendee = await this.eventAttendeeService.create({
          event,
          user,
          status,
          role: participantRole,
        });

        timer();
        return newAttendee;
      }
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(
        `Error processing external RSVP: ${error.message}`,
        error.stack,
      );

      throw error;
    }
  }
}
