# ATProtocol RSVP Integration Plan

This document outlines the plan for integrating RSVPs between OpenMeet and the ATProtocol (Bluesky). The goal is to ensure that when users click the "Attend" button in the OpenMeet UI, an RSVP record is created in their Bluesky PDS, and when users RSVP to events via Bluesky, those RSVPs are properly tracked in OpenMeet.

## Current State

1. **Inbound RSVP Integration (Bluesky → OpenMeet)**
   - RSVP Integration API endpoint exists (`/integration/rsvps`)
   - RsvpIntegrationService implemented with ability to:
     - Process incoming RSVPs from external sources
     - Map status values (going → Confirmed, interested → Maybe, etc.)
     - Create shadow accounts for Bluesky users if needed
     - Update existing attendance records
     - Handle deletion (though not fully implemented)

2. **Components Not Yet Implemented**
   - BlueskyRsvpService for creating RSVPs in users' Bluesky PDS
   - Outbound RSVP functionality (OpenMeet → Bluesky)
   - Connection between the UI's attendance buttons and Bluesky RSVP creation
   - Complete RSVP deletion handling

## Implementation Plan

### 1. Create BlueskyRsvpService

Create a new service to handle RSVP operations with the ATProtocol:

```typescript
@Injectable()
export class BlueskyRsvpService {
  private readonly logger = new Logger(BlueskyRsvpService.name);
  
  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly blueskyIdService: BlueskyIdService,
    @InjectMetric('bluesky_rsvp_operations_total')
    private readonly rsvpOperationsCounter: Counter<string>,
  ) {}
  
  /**
   * Creates or updates an RSVP in the user's Bluesky PDS
   * @param event The event to RSVP to
   * @param status The RSVP status (going, interested, or notgoing)
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  async createRsvp(
    event: EventEntity, 
    status: 'going' | 'interested' | 'notgoing', 
    did: string,
    tenantId: string
  ): Promise<{ success: boolean; rsvpUri: string }> {
    try {
      // Get the event's Bluesky URI
      if (!event.sourceData?.rkey || event.sourceType !== EventSourceType.BLUESKY) {
        throw new Error('Event does not have Bluesky source information');
      }
      
      // Create AT Protocol URI for the event
      const eventCreatorDid = event.sourceData.did;
      const eventUri = this.blueskyIdService.createUri(
        eventCreatorDid, 
        'community.lexicon.calendar.event', 
        event.sourceData.rkey
      );
      
      // Get Bluesky agent for the user
      const agent = await this.blueskyService.resumeSession(tenantId, did);
      
      // Create the RSVP record
      const recordData = {
        $type: 'community.lexicon.calendar.rsvp',
        subject: {
          $type: 'community.lexicon.calendar.event',
          uri: eventUri,
        },
        status,
        createdAt: new Date().toISOString(),
      };
      
      // Generate an rkey for the RSVP
      const rkey = `${event.sourceData.rkey}-rsvp-${Date.now()}`;
      
      // Create the RSVP record in the user's PDS
      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
        rkey,
        record: recordData,
      });
      
      // Increment metrics
      this.rsvpOperationsCounter.inc({
        tenant: tenantId,
        operation: 'create',
        status,
      });
      
      this.logger.debug(`Created RSVP for event ${event.name} with status ${status}`, {
        eventUri,
        did,
        rkey,
        cid: result.data.cid,
      });
      
      return {
        success: true,
        rsvpUri: this.blueskyIdService.createUri(did, 'community.lexicon.calendar.rsvp', rkey),
      };
    } catch (error) {
      this.logger.error(`Failed to create Bluesky RSVP: ${error.message}`, error.stack);
      throw new Error(`Failed to create Bluesky RSVP: ${error.message}`);
    }
  }
  
  /**
   * Deletes an RSVP from the user's Bluesky PDS
   * @param rsvpUri The URI of the RSVP to delete
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  async deleteRsvp(
    rsvpUri: string,
    did: string,
    tenantId: string
  ): Promise<{ success: boolean }> {
    try {
      // Parse the RSVP URI
      const parsedUri = this.blueskyIdService.parseUri(rsvpUri);
      
      // Get Bluesky agent for the user
      const agent = await this.blueskyService.resumeSession(tenantId, did);
      
      // Delete the RSVP record
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
        rkey: parsedUri.rkey,
      });
      
      // Increment metrics
      this.rsvpOperationsCounter.inc({
        tenant: tenantId,
        operation: 'delete',
      });
      
      this.logger.debug(`Deleted RSVP ${rsvpUri}`, {
        did,
        rkey: parsedUri.rkey,
      });
      
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete Bluesky RSVP: ${error.message}`, error.stack);
      throw new Error(`Failed to delete Bluesky RSVP: ${error.message}`);
    }
  }
  
  /**
   * Lists all RSVPs by a user in their Bluesky PDS
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  async listRsvps(did: string, tenantId: string): Promise<any[]> {
    try {
      // Get Bluesky agent for the user
      const agent = await this.blueskyService.resumeSession(tenantId, did);
      
      // List RSVP records
      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
      });
      
      return response.data.records;
    } catch (error) {
      this.logger.error(`Failed to list Bluesky RSVPs: ${error.message}`, error.stack);
      throw new Error(`Failed to list Bluesky RSVPs: ${error.message}`);
    }
  }
}
```

### 2. Update EventAttendeeService

Enhance the event attendee service to handle Bluesky RSVPs:

```typescript
// Add to EventAttendeeService
@Injectable()
export class EventAttendeeService {
  // ... existing code

  constructor(
    private readonly blueskyRsvpService: BlueskyRsvpService,
    private readonly userService: UserService,
    // ... existing dependencies
  ) {}

  /**
   * Create an event attendee record and sync to Bluesky if applicable
   */
  async create(data: CreateEventAttendeeDto): Promise<EventAttendeesEntity> {
    const attendee = await this.eventAttendeeRepository.save(data);
    
    // After creating the attendance record, sync to Bluesky if:
    // 1. The event has a Bluesky source
    // 2. The user has a connected Bluesky account
    // 3. Bluesky syncing is not specifically disabled
    if (
      !data.skipBlueskySync && 
      data.event.sourceType === EventSourceType.BLUESKY &&
      data.event.sourceData?.rkey
    ) {
      try {
        // Get the user's Bluesky preferences
        const user = await this.userService.findById(data.user.id);
        
        if (user.preferences?.bluesky?.connected && user.preferences?.bluesky?.did) {
          // Map OpenMeet status to Bluesky status
          const statusMap = {
            [EventAttendeeStatus.Confirmed]: 'going',
            [EventAttendeeStatus.Maybe]: 'interested',
            [EventAttendeeStatus.Cancelled]: 'notgoing',
            [EventAttendeeStatus.Pending]: 'interested',
            [EventAttendeeStatus.Waitlist]: 'interested',
          };
          
          const blueskyStatus = statusMap[data.status] || 'interested';
          
          // Create RSVP in Bluesky
          const result = await this.blueskyRsvpService.createRsvp(
            data.event,
            blueskyStatus,
            user.preferences.bluesky.did,
            user.tenantId
          );
          
          // Store the RSVP URI in the attendance record's metadata
          if (result.success) {
            await this.eventAttendeeRepository.update(attendee.id, {
              metadata: {
                ...attendee.metadata,
                blueskyRsvpUri: result.rsvpUri,
              },
            });
          }
        }
      } catch (error) {
        // Log but don't fail if Bluesky sync fails
        this.logger.error(`Failed to sync attendance to Bluesky: ${error.message}`, error.stack);
      }
    }
    
    return attendee;
  }

  /**
   * Cancel an attendee's attendance and update Bluesky if applicable
   */
  async cancelEventAttendance(eventId: number, userId: number): Promise<UpdateResult> {
    const attendee = await this.findEventAttendeeByUserId(eventId, userId);
    
    // Update the attendance status
    const result = await this.eventAttendeeRepository.update(
      { id: attendee.id },
      { status: EventAttendeeStatus.Cancelled }
    );
    
    // After cancelling, update Bluesky RSVP if:
    // 1. The attendee has a Bluesky RSVP URI in metadata
    // 2. The user has a connected Bluesky account
    if (attendee.metadata?.blueskyRsvpUri) {
      try {
        // Get the user's Bluesky preferences
        const user = await this.userService.findById(userId);
        
        if (user.preferences?.bluesky?.connected && user.preferences?.bluesky?.did) {
          // Check whether to create a "notgoing" RSVP or delete the RSVP
          const shouldCreateNotgoing = true; // Could be a config option
          
          if (shouldCreateNotgoing) {
            // Get the event to pass to createRsvp
            const event = await this.eventRepository.findOne({ where: { id: eventId } });
            
            // Create a "notgoing" RSVP
            await this.blueskyRsvpService.createRsvp(
              event,
              'notgoing',
              user.preferences.bluesky.did,
              user.tenantId
            );
          } else {
            // Delete the RSVP completely
            await this.blueskyRsvpService.deleteRsvp(
              attendee.metadata.blueskyRsvpUri,
              user.preferences.bluesky.did,
              user.tenantId
            );
          }
        }
      } catch (error) {
        // Log but don't fail if Bluesky sync fails
        this.logger.error(`Failed to sync cancellation to Bluesky: ${error.message}`, error.stack);
      }
    }
    
    return result;
  }

  // ... existing code
}
```

### 3. Update RsvpIntegrationService for Deletion

Improve the RSVP integration service to better handle RSVP deletions:

```typescript
// Update the existing deleteExternalRsvp method to be more targeted
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
    // Extract components from the sourceId if it's in AT Protocol URI format
    if (sourceId.startsWith('at://')) {
      try {
        // Parse the AT Protocol URI
        const parsedUri = this.blueskyIdService.parseUri(sourceId);
        const userDid = parsedUri.did;
        
        // Find the user by DID
        const user = await this.userService.findByExternalId(userDid, tenantId);
        
        if (!user) {
          this.logger.warn(`No user found with DID ${userDid}`);
          return {
            success: false,
            message: `No user found with DID ${userDid}`,
          };
        }
        
        // Find attendance records with matching Bluesky RSVP URI
        const attendees = await this.eventAttendeeService.findByMetadata(
          'blueskyRsvpUri', 
          sourceId,
          user.id
        );
        
        if (!attendees || attendees.length === 0) {
          // Try to find by user ID as a fallback
          const userAttendees = await this.eventAttendeeService.findByUserId(user.id);
          
          if (!userAttendees || userAttendees.length === 0) {
            this.logger.warn(`No attendee records found for user ${user.id} (DID: ${userDid})`);
            return {
              success: false,
              message: `No attendee records found for the given user`,
            };
          }
          
          // Cancel all attendee records for the user
          let cancelledCount = 0;
          for (const attendee of userAttendees) {
            if (attendee.status !== EventAttendeeStatus.Cancelled) {
              await this.eventAttendeeService.updateEventAttendee(
                attendee.id,
                { status: EventAttendeeStatus.Cancelled }
              );
              cancelledCount++;
            }
          }
          
          timer();
          return {
            success: true,
            message: `Cancelled ${cancelledCount} attendance records based on user ID`,
          };
        }
        
        // Cancel the specific attendance records found by RSVP URI
        let cancelledCount = 0;
        for (const attendee of attendees) {
          if (attendee.status !== EventAttendeeStatus.Cancelled) {
            await this.eventAttendeeService.updateEventAttendee(
              attendee.id,
              { status: EventAttendeeStatus.Cancelled }
            );
            cancelledCount++;
          }
        }
        
        timer();
        return {
          success: true,
          message: `Cancelled ${cancelledCount} attendance records based on RSVP URI`,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to parse sourceId as AT Protocol URI: ${sourceId}`,
          error.stack
        );
        // Fall back to the generic approach if parsing fails
      }
    }
    
    // Original implementation as fallback
    // ...
    
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
```

### 4. Add Event Attendee Metadata Query Method

Add a method to find attendees by metadata:

```typescript
// Add to EventAttendeeService
async findByMetadata(
  key: string,
  value: any,
  userId?: number
): Promise<EventAttendeesEntity[]> {
  // Create base query
  const query = this.eventAttendeeRepository
    .createQueryBuilder('eventAttendee')
    .leftJoinAndSelect('eventAttendee.event', 'event')
    .leftJoinAndSelect('eventAttendee.user', 'user')
    .where(`eventAttendee.metadata->>'${key}' = :value`, { value });
  
  // Add user ID filter if provided
  if (userId) {
    query.andWhere('eventAttendee.user.id = :userId', { userId });
  }
  
  return query.getMany();
}
```

### 5. Update Bluesky Module

Update the Bluesky module to include the new service:

```typescript
@Module({
  imports: [
    // ... existing imports
  ],
  providers: [
    BlueskyService,
    BlueskyIdService,
    BlueskyRsvpService, // Add the new service
  ],
  exports: [
    BlueskyService,
    BlueskyIdService,
    BlueskyRsvpService, // Export the new service
  ],
})
export class BlueskyModule {}
```

### 6. Update Metrics Configuration

Add RSVP-specific metrics:

```typescript
// In metrics.module.ts or appropriate location
export const metricsProviders = [
  // ... existing metrics
  {
    provide: 'bluesky_rsvp_operations_total',
    useFactory: () => new Counter({
      name: 'bluesky_rsvp_operations_total',
      help: 'Total number of Bluesky RSVP operations',
      labelNames: ['tenant', 'operation', 'status'] as const,
    }),
  },
];
```

## Testing Plan

1. **Unit Tests**
   - Test BlueskyRsvpService methods
   - Test EventAttendeeService Bluesky integration
   - Test RsvpIntegrationService deletion improvements

2. **Integration Tests**
   - Test bidirectional RSVP syncing
   - Test shadow account RSVP handling
   - Test conflict resolution

3. **E2E Tests**
   - Test full attendee flow from UI to Bluesky and back
   - Test RSVP cancellation flow

## Rollout Plan

1. **Phase 1: Server-Side Implementation**
   - Create BlueskyRsvpService
   - Update EventAttendeeService
   - Add unit tests
   - Deploy to dev environment

2. **Phase 2: Testing and Metrics**
   - Add comprehensive metrics
   - Monitor success rates
   - Fix any issues found

3. **Phase 3: Production Deployment**
   - Deploy to production
   - Monitor closely
   - Document behavior for users

## Considerations

1. **Error Handling**
   - Gracefully handle Bluesky connection issues
   - Don't prevent local attendance if Bluesky sync fails
   - Add proper logging for sync issues

2. **Performance**
   - Make Bluesky API calls asynchronously when possible
   - Use background processing for bulk operations
   - Ensure database queries are optimized

3. **Security**
   - Ensure proper token handling
   - Validate event and user relationships
   - Respect user privacy settings

4. **User Experience**
   - Consider adding UI feedback about Bluesky sync status
   - Show Bluesky connection status in the attendance flow
   - Document the behavior for users