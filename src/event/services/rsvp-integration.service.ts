import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ExternalRsvpDto } from '../dto/external-rsvp.dto';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { UserService } from '../../user/user.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../../core/constants/constant';
import { Trace } from '../../utils/trace.decorator';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';

@Injectable()
export class RsvpIntegrationService {
  private readonly logger = new Logger(RsvpIntegrationService.name);

  constructor(
    private readonly tenantService: TenantConnectionService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventRoleService: EventRoleService,
    private readonly userService: UserService,
    private readonly blueskyIdService: BlueskyIdService,
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

        // Update existing record with status and role
        await this.eventAttendeeService.updateEventAttendee(
          existingAttendee.id,
          { 
            status, 
            role: existingAttendee.role.name,
          }
        );
        
        // Now update the metadata separately
        const attendeeToUpdate = await this.eventAttendeeService.findOne({
          where: { id: existingAttendee.id }
        });
        
        if (attendeeToUpdate) {
          // Update the metadata
          attendeeToUpdate.metadata = {
            ...(attendeeToUpdate.metadata || {}),
            sourceId: rsvpData.sourceId,
            sourceType: rsvpData.eventSourceType,
          };
          
          // Save the updated entity
          await this.eventAttendeeService.save(attendeeToUpdate);
        }

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
          // Store the sourceId to track the relationship with the external RSVP
          // This will help with future updates or deletions
          metadata: {
            sourceId: rsvpData.sourceId,
            sourceType: rsvpData.eventSourceType,
          },
          // Skip syncing back to Bluesky since this RSVP came from Bluesky
          skipBlueskySync: true,
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

  /**
   * Delete an external RSVP 
   * @param sourceId Source ID of the RSVP to delete
   * @param sourceType Source type of the RSVP
   * @param tenantId Tenant ID where the RSVP is stored
   * @returns Result of the operation
   */
  @Trace('rsvp-integration.deleteExternalRsvp')
  async deleteExternalRsvp(
    sourceId: string, 
    sourceType: string, 
    tenantId: string
  ): Promise<{ success: boolean; message: string }> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(
      `Deleting external RSVP for tenant ${tenantId}: sourceId=${sourceId}, sourceType=${sourceType}`
    );

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: sourceType,
      operation: 'delete',
    });

    try {
      // First approach: Try to find attendees by metadata
      if (sourceId.startsWith('at://')) {
        try {
          // If we have a full AT Protocol URI, try to find attendees by the blueskyRsvpUri in metadata
          const attendees = await this.eventAttendeeService.findByMetadata(
            'blueskyRsvpUri',
            sourceId
          );
          
          if (attendees && attendees.length > 0) {
            this.logger.debug(`Found ${attendees.length} attendees with blueskyRsvpUri = ${sourceId}`);
            
            // Mark each attendee as cancelled
            let cancelledCount = 0;
            for (const attendee of attendees) {
              // Skip already cancelled attendees
              if (attendee.status === EventAttendeeStatus.Cancelled) {
                continue;
              }
              
              // Update the attendee status to cancelled
              await this.eventAttendeeService.updateEventAttendee(
                attendee.id,
                { 
                  status: EventAttendeeStatus.Cancelled,
                  role: attendee.role.name
                }
              );
              cancelledCount++;
              
              this.logger.debug(
                `Cancelled attendance record ${attendee.id} for user ${attendee.user.slug} on event ${attendee.event.slug}`
              );
            }
            
            // If we successfully cancelled at least one attendee, return success
            if (cancelledCount > 0) {
              // Increment the processed counter
              this.processedCounter.inc({
                tenant: tenantId,
                source_type: sourceType,
                operation: 'delete',
              });
              
              timer();
              return {
                success: true,
                message: `Successfully cancelled ${cancelledCount} attendance record(s) using RSVP URI`,
              };
            }
          }
          
          // If we didn't find any attendees by RSVP URI or couldn't cancel any, try by user DID
          const parsedUri = this.blueskyIdService.parseUri(sourceId);
          const userDid = parsedUri.did;
          this.logger.debug(`Extracted DID ${userDid} from URI ${sourceId}, trying user lookup`);
          
          // Try to find the user by DID
          const user = await this.userService.findByExternalId(userDid, tenantId);
          
          if (!user) {
            this.logger.warn(`No user found with DID ${userDid}`);
            return {
              success: false,
              message: `No user found with DID ${userDid}`,
            };
          }
          
          // Find attendees by user
          const userAttendees = await this.eventAttendeeService.findByUserSlug(user.slug);
          
          if (!userAttendees || userAttendees.length === 0) {
            this.logger.warn(`No attendee records found for user ${user.slug} (DID: ${userDid})`);
            return {
              success: false,
              message: `No attendee records found for the given user`,
            };
          }
          
          // Mark each attendee as cancelled
          let cancelledCount = 0;
          for (const attendee of userAttendees) {
            // Skip already cancelled attendees
            if (attendee.status === EventAttendeeStatus.Cancelled) {
              continue;
            }
            
            // Verify this is for a Bluesky event
            const event = attendee.event;
            if (event && event.sourceType === sourceType) {
              // Update the attendee status to cancelled
              await this.eventAttendeeService.updateEventAttendee(
                attendee.id,
                { 
                  status: EventAttendeeStatus.Cancelled,
                  role: attendee.role.name
                }
              );
              cancelledCount++;
              
              this.logger.debug(
                `Cancelled attendance record ${attendee.id} for user ${user.slug} on event ${event.slug}`
              );
            }
          }
          
          // Increment the processed counter
          this.processedCounter.inc({
            tenant: tenantId,
            source_type: sourceType,
            operation: 'delete',
          });
          
          timer();
          
          if (cancelledCount > 0) {
            return {
              success: true,
              message: `Successfully cancelled ${cancelledCount} attendance record(s) by user DID`,
            };
          } else {
            return {
              success: false,
              message: 'No relevant attendance records found to cancel',
            };
          }
        } catch (error) {
          this.logger.warn(
            `Failed while processing URI ${sourceId}: ${error.message}`,
            error.stack
          );
          // If URI processing fails, fall back to the original approach
        }
      }
      
      // Fallback approach: Try to find the user by sourceId as DID
      const userDid = sourceId.startsWith('at://') ? sourceId : sourceId;
      const user = await this.userService.findByExternalId(userDid, tenantId);
      
      if (!user) {
        this.logger.warn(`No user found with identifier ${userDid}`);
        return {
          success: false,
          message: `No user found with identifier ${userDid}`,
        };
      }
      
      // Find attendees by user
      const attendees = await this.eventAttendeeService.findByUserSlug(user.slug);
      
      if (!attendees || attendees.length === 0) {
        this.logger.warn(`No attendee records found for user ${user.slug}`);
        return {
          success: false,
          message: `No attendee records found for the given user`,
        };
      }
      
      // Mark each attendee as cancelled
      let cancelledCount = 0;
      for (const attendee of attendees) {
        // Skip already cancelled attendees
        if (attendee.status === EventAttendeeStatus.Cancelled) {
          continue;
        }
        
        // Verify this is for a Bluesky event
        const event = attendee.event;
        if (event && event.sourceType === sourceType) {
          // Update the attendee status to cancelled
          await this.eventAttendeeService.updateEventAttendee(
            attendee.id,
            { 
              status: EventAttendeeStatus.Cancelled,
              role: attendee.role.name
            }
          );
          cancelledCount++;
          
          this.logger.debug(
            `Cancelled attendance record ${attendee.id} for user ${user.slug} on event ${event.slug}`
          );
        }
      }

      // Increment the processed counter
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: sourceType,
        operation: 'delete',
      });

      timer();
      
      if (cancelledCount > 0) {
        return {
          success: true,
          message: `Successfully cancelled ${cancelledCount} attendance record(s)`,
        };
      } else {
        return {
          success: false,
          message: 'No relevant attendance records found to cancel',
        };
      }
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(`Error deleting RSVP: ${error.message}`, error.stack);
      
      // If not found, don't treat as an error
      if (error instanceof NotFoundException) {
        return {
          success: true,
          message: 'RSVP not found for deletion - ignoring',
        };
      }
      
      throw error;
    }
  }
}
