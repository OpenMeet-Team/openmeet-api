# Bluesky Integration Implementation Plan

> **NOTE**: This document contains implementation details for ATProtocol integration. For the authoritative and comprehensive design documentation, please refer to [ATProtocol Design](/design-notes/atprotocol-design.md).

This document outlines the high-level implementation strategy for integrating OpenMeet's event series capabilities with Bluesky's ATProtocol, maintaining PDS as the source of truth when appropriate.

## Architecture Components

### Data Platforms

1. **OpenMeet Platform (Local Data)**
   - EventSeries: Defines recurring event patterns and metadata
   - Event Occurrences: Individual instances of series events
   - User Accounts: OpenMeet user profiles and preferences
   - RSVPs/Attendance: User attendance status for events

2. **ATProtocol Platform (PDS Data)**
   - Single Events: Individual calendar events (no native series support)
   - Event RSVPs: User attendance status records
   - User DIDs: Decentralized identifiers for Bluesky users
   - Records: Immutable data stored in repositories

### Integration Components

1. **Ingestion Pipeline (PDS → OpenMeet)**
   - Bluesky Firehose Consumer: Captures event operations from network
   - Event Processor: Maps and forwards events to OpenMeet API
   - Series Detection: Identifies potential recurring patterns
   - Shadow Account Service: Creates provisional accounts for Bluesky users

2. **Publishing Pipeline (OpenMeet → PDS)**
   - Event Publishing Service: Selects and formats events for Bluesky
   - BskyClient: Handles authentication and API communication
   - Series Publisher: Manages which occurrence to publish
   - Deduplication Service: Prevents duplicate events

3. **Synchronization Services**
   - Conflict Detection: Identifies data inconsistencies between platforms
   - Conflict Resolution: Applies rules to resolve conflicts
   - Reconciliation Service: Periodic verification of data consistency
   - Monitoring: Tracks sync quality and performance metrics

## 1. Source of Truth Management

### Principles

* Bluesky (PDS) is always the source of truth for conflicting data
* Events on OpenMeet with Bluesky origin always defer to Bluesky data
* Automatic publishing to Bluesky PDS when events are created in OpenMeet
* All events from Bluesky are public by default in OpenMeet

### Implementation

#### Using Existing Database Fields

Leverage the existing source tracking fields without schema changes:

```typescript
// Existing SourceFields interface
interface SourceFields {
  sourceType: EventSourceType; // Already includes BLUESKY
  sourceId: string;   // Store Bluesky DID
  sourceUrl: string;  // Store link to Bluesky event
  sourceData: any;    // Store additional metadata in JSON
  lastSyncedAt: Date; // Track last sync time
}
```

The `sourceData` JSONB field can store additional metadata needed for sync:

```typescript
// Example sourceData structure for Bluesky events
{
  "rkey": "unique-record-key",
  "cid": "content-identifier",
  "isSourceOfTruth": true,
  "originPlatform": "bluesky",
  "syncStatus": "IN_SYNC", // Can be: IN_SYNC, NEEDS_SYNC, CONFLICT, SYNC_FAILED
  "lastSyncError": null,
  "publishedOccurrenceId": "for-series-only"
}
```

#### Service Enhancements

```typescript
// Additional methods for EventService and EventSeriesService
async syncWithBluesky(eventId: string): Promise<Event>;
async checkSyncStatus(eventId: string): Promise<SyncStatus>;
async getBlueskyData(eventId: string): Promise<BlueskyEvent>;
```

## 2. Event Publishing Flow (OpenMeet → PDS)

### For One-Time Events

* Direct 1:1 mapping using existing BlueskyService
* Update `createEventRecord` to include comprehensive metadata
* Store returned AT Protocol references (URI, CID) in the event entity

### For Recurring Events (Series)

Given AT Protocol's current lack of native recurring event support:

```typescript
// EventPublishingService (new)
class EventPublishingService {
  // Publish a single occurrence to Bluesky
  async publishOccurrence(occurrenceId: string): Promise<void>;
  
  // Publish next upcoming occurrence from a series
  async publishNextSeriesOccurrence(seriesId: string): Promise<void>;
  
  // Determine if new occurrence should be published based on date
  async checkAndPublishNextOccurrence(seriesId: string): Promise<boolean>;
  
  // Called by cron job to handle series that need next occurrence published
  async processSeriesPublishingQueue(): Promise<void>;
}
```

#### Occurrence Selection Algorithm

1. Find the closest upcoming occurrence for the series
2. If one is already published to Bluesky, check if it's in the past
3. If in the past, publish the next upcoming occurrence (keeping past occurrences)
4. Update series metadata to track which occurrence is currently published

#### Metadata Enhancement

For series occurrences published to Bluesky:

* Include a link to the full series on OpenMeet
* Add descriptive text indicating it's part of a series (e.g., "This is part of a recurring event series")
* Include a note about the frequency (e.g., "Occurs weekly on Tuesdays")

## 3. Event Ingestion Flow (PDS → OpenMeet)

### Components Enhancement

#### 1. Firehose Consumer Enhancements

```typescript
// Add event filtering for calendar collections
// Enhance error handling and retries
// Add sequence tracking for gap detection
```

#### 2. Event Processor Enhancements

```typescript
// Add series detection capabilities
// Improve mapping between AT Protocol and OpenMeet formats
// Enhance error handling with dead letter queue
```

#### 3. New Series Detection Service

```typescript
class SeriesDetectionService {
  // Analyze events for recurring patterns
  async detectPotentialSeries(events: ExternalEvent[]): Promise<PotentialSeries[]>;
  
  // Score event similarity for grouping
  private calculateSimilarityScore(event1: ExternalEvent, event2: ExternalEvent): number;
  
  // Extract potential recurrence rule from event pattern
  private extractRecurrencePattern(events: ExternalEvent[]): RecurrenceRule;
  
  // Group similar events that match a pattern
  private groupSimilarEvents(events: ExternalEvent[]): EventGroup[];
}
```

### Shadow Account Management

For events from users not yet on OpenMeet:

```typescript
// ShadowAccountService
class ShadowAccountService {
  // Create or find shadow account by DID
  async findOrCreateShadowAccount(did: string, handle: string): Promise<User>;
  
  // Claim a shadow account when user logs in with Bluesky
  async claimShadowAccount(userId: string, did: string): Promise<User>;
  
  // Transfer ownership of events from shadow to real account
  private transferEventOwnership(shadowId: string, userId: string): Promise<void>;
}
```

## 4. Deduplication & Consistency

### Deduplication Strategy

```typescript
// DeduplicationService
class DeduplicationService {
  // Check if an event from Bluesky already exists in OpenMeet
  async checkForDuplicate(externalEvent: ExternalEvent): Promise<Event | null>;
  
  // Generate checksum for event content comparison
  private generateEventChecksum(event: Event | ExternalEvent): string;
  
  // Handle case where we receive our own published event back
  async handleSelfPublishedEvent(externalEvent: ExternalEvent): Promise<void>;
}
```

### Reconciliation Process

```typescript
// ReconciliationService
class ReconciliationService {
  // Scheduled job to verify consistency between systems
  async reconcileBlueskyEvents(): Promise<ReconciliationReport>;
  
  // Check for events that should be synced but aren't
  async findUnpublishedEvents(): Promise<Event[]>;
  
  // Check for events from Bluesky we're missing
  async findMissingExternalEvents(): Promise<ExternalEvent[]>;
  
  // Repair inconsistencies automatically when possible
  async autoRepairInconsistencies(): Promise<RepairReport>;
}
```

## 5. Conflict Resolution

### Conflict Resolution Strategy

```typescript
// ConflictResolutionService
class ConflictResolutionService {
  // Detect conflicts between local and external data
  async detectConflict(event: Event, externalEvent: ExternalEvent): Promise<boolean>;
  
  // Apply Bluesky-first resolution policy
  async resolveConflict(event: Event, externalEvent: ExternalEvent): Promise<Event>;
  
  // Apply Bluesky data with special handling for certain fields
  private applyBlueskyData(event: Event, externalEvent: ExternalEvent): Event;
}
```

### Field-Specific Policies

1. **Attendance Status**: Always synchronize bidirectionally between platforms
2. **Event Details**: Always prefer Bluesky data when conflicts occur
3. **Start/End Times**: Use Bluesky values if they differ from OpenMeet
4. **Location Data**: Replace with Bluesky data for conflicting fields

## 6. API Endpoints

```
# Event Synchronization
POST   /api/events/:slug/sync           - Trigger sync for an event
POST   /api/events/series/:slug/sync    - Trigger sync for a series

# Series Detection
GET    /api/events/detect-series        - Get potential series from existing events
POST   /api/events/create-series        - Create series from detected pattern

# Shadow Account Management  
POST   /api/auth/bluesky/claim-account  - Claim shadow account after login

# Conflict Management
GET    /api/events/:slug/conflicts      - Check for sync conflicts
POST   /api/events/:slug/resolve        - Resolve a sync conflict

# Admin Tools
GET    /api/admin/bluesky/sync-status   - Get sync status report
POST   /api/admin/bluesky/reconcile     - Trigger reconciliation process
```

## 7. User Experience

### User Preferences

User preferences for Bluesky integration:

```typescript
// Add to UserPreferences
interface UserPreferences {
  // Existing fields
  // ...
  
  // Bluesky connection status
  bluesky: {
    connected: boolean;
    did: string;
    handle: string;
    connectedAt: Date;
  }
}
```

### UI Components

1. Bluesky Connection Status:
   - Indicator showing if user's Bluesky account is connected
   - Option to connect/disconnect Bluesky account
   - Message indicating that all events will be published to Bluesky when connected

2. Event Bluesky Status:
   - Indicator showing if event is published to Bluesky
   - Link to view on Bluesky when published
   - RSVP sync status
   - Last sync timestamp

3. Series UI Enhancements:
   - Indicator showing which occurrence is published to Bluesky
   - Link to view on Bluesky when published

## 8. Monitoring & Metrics

```typescript
// New metrics to track
interface BlueskyMetrics {
  eventsPublished: Counter;
  eventsConsumed: Counter;
  syncConflicts: Counter;
  reconciliationErrors: Counter;
  syncLatency: Histogram;
  eventPublishDuration: Histogram;
  seriesDetectionAccuracy: Gauge;
}
```

Implement Prometheus metrics and dashboards for:
- Sync quality (% events in sync)
- Latency between platforms
- Conflict frequency and resolution time
- Shadow account creation and claiming

## 9. Implementation Phases

### Phase 1: Core Integration Enhancement (2 weeks)
- Enhance existing firehose consumer with better error handling and logging
- Expand the existing BlueskyService to handle bidirectional sync
- Implement conflict detection and resolution with Bluesky as source of truth
- Update the sourceData structure to store additional sync metadata

### Phase 2: Series Support (3 weeks)
- Implement next-occurrence publishing for event series
- Create the scheduler for publishing future occurrences
- Add series links and descriptive metadata to Bluesky events
- Build the logic to track which occurrence is currently published

### Phase 3: Bluesky-to-OpenMeet Sync (2 weeks)
- Improve series detection for events from Bluesky
- Implement shadow account provisioning for Bluesky users
- Add deduplication logic to prevent duplicate events
- Build the reconciliation process for catching missed events

### Phase 4: UI & Monitoring (1 week)
- Add Bluesky status indicators to UI
- Implement enhanced logging and metrics
- Create monitoring dashboards
- Add admin tools for manual intervention when needed

## 10. Profile Integration & Session Management

### Bluesky Profile Display Enhancement

1. **Profile Data Sync**
   - Sync Bluesky profile data (avatar, bio, display name) to OpenMeet user profiles
   - Enable displaying Bluesky handle and link on user profiles
   - Add "Verified via Bluesky" indicator

2. **UI Implementation**
   ```typescript
   interface BlueskyProfileData {
     handle: string;
     displayName: string;
     avatar: string;
     bio: string;
     followersCount: number;
     followingCount: number;
     isVerified: boolean;
   }
   
   // UserProfileService enhancement
   class UserProfileService {
     // Existing methods...
     
     // New methods
     async getBlueskyProfile(userId: string): Promise<BlueskyProfileData | null>;
     async refreshBlueskyProfile(userId: string): Promise<BlueskyProfileData | null>;
   }
   ```

3. **Profile View Components**
   - Add Bluesky section to user profile page
   - Display Bluesky stats (followers, posts, etc.)
   - Show event publishing status

### Session Management Improvements

1. **Session Tracking & Renewal**
   ```typescript
   class BlueskySessionManager {
     // Get active session for user
     async getActiveSession(userId: string): Promise<BlueskySession | null>;
     
     // Validate if session is still active with Bluesky
     async validateSession(session: BlueskySession): Promise<boolean>;
     
     // Force refresh session token
     async refreshSession(userId: string): Promise<BlueskySession>;
     
     // Reset session and require re-authentication
     async resetSession(userId: string): Promise<void>;
   }
   ```

2. **Error Handling Enhancements**
   - Add specific error types for session-related issues
   - Implement automatic retry with exponential backoff
   - Add circuit breaker pattern for Bluesky API calls

3. **Admin Tools**
   - Add admin endpoint to view and manage user sessions
   - Provide manual session reset functionality
   - Implement batch session refresh operation

## 11. Testing Strategy

### Unit Testing

1. **BlueskyService Tests**
   - Mock AT Protocol client responses
   - Test different session states and error conditions
   - Verify conflict resolution logic works correctly

2. **Event Publishing Tests**
   - Verify correct publishing of one-time events
   - Test series occurrence selection algorithm
   - Ensure proper error handling and retries

### Integration Testing

1. **Mock Firehose Tests**
   - Create mock Bluesky firehose data generator
   - Test consumer event filtering and processing
   - Verify proper RabbitMQ message formatting

2. **End-to-End Testing**
   - Use test PDS instances with controlled data
   - Test full publication and consumption cycles
   - Verify bidirectional sync of events and RSVPs

3. **Session Management Tests**
   - Test session expiration and refresh flows
   - Verify error handling for connection issues
   - Test user reconnection scenarios

### Test Fixtures

1. **Mock PDS Server**
   - Implement simplified PDS mock for testing
   - Support basic AT Protocol operations
   - Simulate various error conditions

2. **Bluesky Event Generator**
   ```typescript
   // Test utility to generate Bluesky events
   class BlueskyEventGenerator {
     // Generate event create operation
     createEvent(opts?: Partial<BlueskyEventOpts>): BlueskyEvent;
     
     // Generate event update operation
     updateEvent(event: BlueskyEvent, changes: Partial<BlueskyEventOpts>): BlueskyEvent;
     
     // Generate event delete operation
     deleteEvent(event: BlueskyEvent): BlueskyDeleteOperation;
     
     // Generate series of related events with pattern
     createEventSeries(pattern: RecurrencePattern, count: number): BlueskyEvent[];
   }
   ```

3. **User Session Simulator**
   - Create test utilities for simulating user sessions
   - Support various authentication states
   - Provide methods for testing error conditions

## Next Steps

1. Review the existing BlueskyService implementation and identify areas for enhancement
2. Develop test fixtures for mocking PDS and firehose for local testing
3. Implement session validation and refresh improvements
4. Create prototype for enhanced profile display
5. Set up integration tests for series publication
6. Develop metrics and monitoring for session health