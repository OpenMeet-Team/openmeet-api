# Bluesky Integration for Event Series Model

This document outlines the integration between OpenMeet's Event Series model and Bluesky's ATProtocol for events and RSVPs.

## 1. Overview

OpenMeet will implement bidirectional synchronization between our Event Series model and Bluesky's ATProtocol lexicon for events and RSVPs. This enables:

- Events created in OpenMeet to appear on Bluesky
- Events from Bluesky to be imported into OpenMeet
- RSVPs/attendance to be synchronized between platforms
- Series and occurrences to be properly represented

### 1.1 Core Principles

Following our existing design documents, this integration adheres to these principles:

- **Source of Truth**: For Bluesky-originated events, Bluesky is the source of truth; for OpenMeet-originated events, OpenMeet is the source
- **Secure Storage**: User credentials stored in Redis with appropriate expiration
- **Graceful Degradation**: Continue with local operations if Bluesky API fails
- **Token Management**: Automatic refresh and cleanup of expired tokens

### 1.2 Implementation Strategy

We'll implement the Event Series model as described in the unified design document, while being open to improvements based on our current implementation:

- **Back out recent migrations**: The last two migrations will be re-evaluated and replaced as needed
- **Leverage existing microservices**: Build on the `bsky-firehose-consumer` and `bsky-event-processor` services
- **Simplify where possible**: Look for opportunities to streamline the design while maintaining functionality
- **Iterative approach**: Implement core functionality first, then enhance with additional features

## 2. ATProtocol Lexicon Analysis

### 2.1 Event Lexicon (`community.lexicon.calendar.event`)

The current Bluesky event lexicon supports:

- Basic event properties (name, description, times, locations)
- Event status tracking (scheduled, cancelled, etc.)
- Multiple locations and URI references

**Note**: Recurrence support in the ATProtocol lexicon is currently only a proposed change and not yet implemented. The proposed features would include:
- `rrule`: Full recurrence specification (frequency, interval, etc.)
- `exdate`: Exception dates excluded from pattern
- `rdate`: Additional dates included in pattern

### 2.2 RSVP Lexicon (`community.lexicon.calendar.rsvp`)

The RSVP lexicon provides:

- Subject reference to an event
- Status options:
  - `interested`: User is interested in the event
  - `going`: User is attending the event
  - `notgoing`: User is not attending the event

## 3. Data Flow Architecture

### 3.1 Ingestion Flow (Bluesky → OpenMeet)

```
Bluesky Firehose → bsky-firehose-consumer → RabbitMQ → bsky-event-processor → OpenMeet API → Database
```

- **Event Processing**: Bluesky events processed into EventSeries with occurrences
- **RSVP Processing**: Bluesky RSVPs mapped to attendance records
- **Microservice Architecture**: Separation of concerns between collection and processing

The existing `bsky-firehose-consumer` service already:
- Connects to Bluesky network firehose via WebSocket
- Filters for calendar event and RSVP collections
- Publishes to RabbitMQ with routing keys (event.create, etc.)
- Implements buffering and reconnection logic

The existing `bsky-event-processor` service already:
- Consumes messages from RabbitMQ
- Maps Bluesky data to API format
- Handles create, update, delete operations
- Implements error handling and retries

### 3.2 Publishing Flow (OpenMeet → Bluesky)

```
OpenMeet API → BskyClient Service → Bluesky API → Bluesky Firehose → Reingestion
```

- **Event Publishing**: EventSeries published as Bluesky events with recurrence
- **Attendance Publishing**: Attendance records published as Bluesky RSVPs
- **Deduplication**: Events published by OpenMeet and reingested via firehose are recognized

### 3.3 User Authentication Flow

The Bluesky login flow provides the necessary credentials for our integration:

1. **Authorization**:
   - User logs in via OAuth redirect flow (per updated Bluesky login flow design)
   - ATProtocol PDS returns accessJwt and refreshJwt tokens

2. **Credential Storage**:
   - Tokens stored in Redis with appropriate expiration (1 hour)
   - Key pattern: `bluesky:credentials:${user.id}`

3. **Token Management**:
   - Automatic refresh of tokens when needed
   - Cleanup of expired tokens
   - Session maintenance for recurring operations

## 4. Data Model Enhancements

### 4.1 EventSeries Additions

```typescript
interface EventSeries {
  // Existing fields...
  
  // External tracking
  externalId?: string;       // Bluesky URI
  externalCid?: string;      // Bluesky CID
  externalSource?: string;   // 'bluesky', 'openmeet', etc.
  externalData?: any;        // Store original Bluesky data
  isReadOnly?: boolean;      // True if we shouldn't push changes back
}
```

### 4.2 Event (Occurrence) Additions

```typescript
interface Event {
  // Existing fields...
  
  // External reference (for modified occurrences)
  externalId?: string;      // Bluesky URI for this specific occurrence
  externalCid?: string;     // Bluesky CID
}
```

### 4.3 Group Enhancements

```typescript
interface Group {
  // Existing fields...
  
  // Bluesky integration
  blueskyMetadata?: {
    externalId?: string;       // Bluesky URI
    externalCid?: string;      // Bluesky CID
    externalSource?: string;   // 'bluesky', 'openmeet', etc.
    syncEnabled?: boolean;     // Whether to sync group to Bluesky
    promotionLevel?: string;   // 'private', 'members', 'public'
    backupAdminDid?: string;   // Backup admin's Bluesky DID
  };
}
```

### 4.4 GroupMember Enhancements

```typescript
interface GroupMember {
  // Existing fields...
  
  // Bluesky integration
  externalId?: string;        // Bluesky URI for membership record
  externalDid?: string;       // Member's Bluesky DID
  syncEnabled?: boolean;      // Whether to sync membership to Bluesky
}
```

## 5. Implementation Details

### 5.1 Migration from Current Implementation

Before implementing the new EventSeries model, we'll need to back out the recent migrations that haven't been deployed to production:

1. **Migration `1743392858448-AddRecurrenceSplitPointField.ts`** - Reverts the addition of the recurrence split point functionality
2. **Migration `1743371499235-AddRecurringEventFields.ts`** - Reverts the current recurring event fields 

These migrations will be replaced with new ones that implement the EventSeries schema as described in the unified design document.

### 5.2 Service Components

#### 5.2.1 BskyClient Service

We'll implement a dedicated service for Bluesky API interactions following patterns established in our existing codebase:

**Key Features:**
- Secure credential retrieval from Redis/ElastiCache
- Agent creation and session management
- Methods for creating and updating events with recurrence
- Methods for managing RSVPs to events
- Error handling and retry logic

**Main Methods:**
- `getAgentForUser(user)`: Creates an authenticated agent for Bluesky API calls
- `createEventSeries(user, seriesData)`: Creates a recurring event in Bluesky
- `updateEventSeries(user, seriesData)`: Updates an existing event series
- `createOrUpdateRsvp(user, eventUri, status)`: Manages RSVPs to events

#### 5.2.2 Firehose Consumer Enhancement

We'll enhance the existing `bsky-firehose-consumer` service to support our EventSeries model:

**Key Enhancements:**
- Continue capturing standard event fields as currently implemented
- Prepare for eventual recurrence field support once Bluesky implements it
- Add correlation between multiple individual events that may be part of the same series
- Implement heuristics to identify potential recurring events based on naming patterns, timing, and other signals

#### 5.2.3 Event Processor Enhancement

We'll update the existing `bsky-event-processor` service to work with our new EventSeries model:

**Key Enhancements:**
- Add heuristic analysis to detect and group related events that may be part of a series
- Implement pattern recognition for identifying recurring events (e.g., events with similar names scheduled at regular intervals)
- Create EventSeries entities when we detect multiple related events
- Map single Bluesky events to either standalone events or occurrences within a series
- Implement series-based indexing for faster event retrieval

#### 5.2.4 Status Mapping

We'll implement the following mappings between OpenMeet attendance statuses and Bluesky RSVP statuses:

**OpenMeet to Bluesky:**
- `attending` → `community.lexicon.calendar.rsvp#going`
- `interested` → `community.lexicon.calendar.rsvp#interested`
- `declined` → `community.lexicon.calendar.rsvp#notgoing`
- `pending` → No direct equivalent, not synced

**Bluesky to OpenMeet:**
- `community.lexicon.calendar.rsvp#going` → `attending`
- `community.lexicon.calendar.rsvp#interested` → `interested`
- `community.lexicon.calendar.rsvp#notgoing` → `declined`

### 5.3 User and Event Synchronization

Given the limitation that Bluesky doesn't support recurring events natively, and considering the integration with users who may or may not have OpenMeet accounts, we'll implement the following strategies:

#### 5.3.1 Bluesky User Login and Event Import

When a Bluesky user logs into OpenMeet:

1. **Complete Event Import**:
   - Import all the user's Bluesky events immediately
   - Create EventSeries entities for detected recurring patterns
   - Link events to the authenticated user account

2. **Conflict Resolution**:
   - For events already in our system (discovered via firehose):
     - Associate the events with the authenticated user
     - Update event details based on latest data
     - Preserve any existing RSVPs or comments

3. **Ongoing Synchronization**:
   - Maintain a link between the Bluesky DID and OpenMeet user ID
   - Continue listening to firehose for updates to their events
   - Apply changes while preserving local enhancements (series detection, etc.)

#### 5.3.2 Handling Events from Non-OpenMeet Users

For events discovered through the firehose from users who haven't joined OpenMeet:

1. **Shadow Account Creation**:
   - Create light "shadow" accounts using Bluesky DIDs as identifiers
   - Store minimal user information (handle, display name)
   - Flag these accounts as external/provisional
   - Apply proper access control to prevent impersonation

2. **Event Permissions**:
   - Make events fully functional with complete visibility
   - Allow OpenMeet users to RSVP (sync back to Bluesky)
   - Enable discussions on these events
   - Include clear indication of the Bluesky source 

3. **Event Ownership Claims**:
   - When a Bluesky user logs in, automatically transfer ownership of their events
   - Match users based on DID identifiers
   - Merge shadow account data with the new full account
   - Preserve all event relationships and interactions

#### 5.3.3 Event Processing and Updates

For processing events from the firehose:

```typescript
// Basic event processing logic
async function processBlueskyEvent(eventMsg) {
  const event = eventMsg.payload;
  const creatorDid = event.repo; // Bluesky DID
  
  // Find or create shadow user account
  let owner = await userRepository.findByExternalId(creatorDid);
  if (!owner) {
    owner = await createShadowAccount(creatorDid, event);
  }
  
  // Check for existing event
  const existingEvent = await findEventByExternalId(event.uri);
  
  if (existingEvent) {
    // Update existing event
    await updateEvent(existingEvent, event, owner);
  } else {
    // Create new event
    const newEvent = await createEventFromBluesky(event, owner);
    
    // Check if it might be part of a series
    await evaluateForSeriesMembership(newEvent);
  }
}
```

#### 5.3.4 Event Presentation

In the OpenMeet UI:

1. **Visual Indicators**:
   - Add a Bluesky badge to events sourced from Bluesky
   - Indicate events that are part of a detected series
   - Show ownership status (OpenMeet user vs. external Bluesky user)

2. **Search and Discovery**:
   - Include Bluesky events in default search results
   - Allow filtering by source (OpenMeet/Bluesky/All)
   - Apply consistent ranking algorithms across all events

### 5.4 RSVP Processing Strategy

For handling RSVPs between Bluesky and OpenMeet, we'll implement:

#### 5.4.1 Handling Bluesky RSVPs

When an RSVP comes in from the Bluesky firehose:

1. **User Resolution**:
   - If the user already exists in OpenMeet, use their account
   - If not, create a shadow account based on their Bluesky DID
   - This ensures we can process RSVPs from any Bluesky user

2. **Event Association**:
   - Link the RSVP to the appropriate event or occurrence
   - Handle cases where the event is part of a series
   - Store the external reference for bidirectional sync

3. **Status Handling**:
   - Map Bluesky RSVP status to OpenMeet attendance status
   - Apply appropriate permissions based on the status
   - For series events, consider suggesting series following

#### 5.4.2 Publishing OpenMeet RSVPs to Bluesky

When an OpenMeet user RSVPs to an event:

1. **Eligibility Check**:
   - Verify the user has connected their Bluesky account
   - Check if the event has a Bluesky external reference
   - Determine if the RSVP should be synced based on user preferences

2. **Status Mapping**:
   - Convert OpenMeet attendance status to Bluesky RSVP status
   - Handle special cases like waitlist or pending approvals

3. **Publishing Process**:
   - Use BskyClient to create or update the RSVP in Bluesky
   - Store the external reference for future updates
   - Implement retry mechanism for failed sync attempts

### 5.5 Pragmatic Approach to Bluesky Integration

Until the Bluesky lexicon natively supports recurring events, we'll implement a simplified approach:

#### 5.5.1 One-Off Event Model

For integration between OpenMeet's EventSeries and Bluesky:

1. **Incoming Bluesky Events**:
   - Import all Bluesky events as standalone one-off events
   - Store them in our system with external references
   - Process them through our EventSeries model internally only

2. **Publishing OpenMeet Series to Bluesky**:
   - Publish only the next upcoming occurrence to Bluesky
   - Include a reference link to the full series on OpenMeet
   - Add text in the description indicating it's part of a series
   - After an occurrence completes, publish the next one

3. **Handling Updates**:
   - When a series pattern changes, update any published occurrences
   - For individual occurrence modifications, update just that instance
   - Maintain all bidirectional references for proper sync

### 5.6 Future Enhancement: Series Detection 

While we'll start with the pragmatic one-off approach, we can prepare for future improvements when recurrence is supported:

#### 5.6.1 Readiness for Recurrence Support

When Bluesky adds recurrence support to the lexicon:

1. **Transition Plan**:
   - Update our system to recognize the new recurrence fields
   - Implement parsing for Bluesky's implementation of RFC 5545
   - Create a migration path for existing events

2. **Enhanced Synchronization**:
   - Sync full recurrence rules between platforms
   - Handle exception dates and rule changes
   - Maintain consistent series identity across platforms

## 6. Deduplication and Conflict Resolution

### 6.1 Deduplication Strategy

When processing events from the Bluesky firehose, we need to identify and handle events that we ourselves published:

1. **Self-Published Event Detection**:
   - Check if the event creator is our own Bluesky DID
   - Use event metadata to identify events that originated from OpenMeet
   - Implement checksum validation to confirm events match our records

2. **Reference Management**:
   - For self-published events, update external references rather than creating duplicates
   - Store URIs and CIDs for future operations
   - Maintain a mapping between local and external IDs

### 6.2 Conflict Resolution

For event data conflicts, we'll implement these resolution rules:

1. **Source of Truth Principle**:
   - If event originates from Bluesky, treat Bluesky as source of truth
   - If event originates from OpenMeet, treat OpenMeet as source of truth
   - Record the origin in the event metadata to maintain this distinction

2. **Timestamp-Based Resolution**:
   - For conflicting updates, use the most recent change by default
   - Implement versioning to track sequence of changes

3. **Field-Specific Policies**:
   - Attendance status: Always use the latest value
   - User-generated content (descriptions, comments): Preserve manual edits
   - Start/end times: Prioritize the source of truth platform
   - Location data: Merge if both sources provide unique information

## 7. Integration with Event Visibility System

Our existing event visibility system has three levels:
- Public events (discoverable by anyone)
- Private group events (visible only to group members)
- Private invite-only events (visible only via direct link/invitation)

### 7.1 Visibility Mapping to Bluesky

When synchronizing events with Bluesky, we need to consider visibility:

1. **Public Events**:
   - Synchronize with Bluesky normally
   - Include full event details

2. **Private Group Events**:
   - Only sync if the group owner explicitly enables Bluesky integration
   - Include a note that it's a group event with link to join the group

3. **Private Invite-Only Events**:
   - Do not sync to Bluesky by default
   - If host explicitly enables sharing, create a record with minimal details and link to OpenMeet

### 7.2 Handling Bluesky-Originated Events

For events originating from Bluesky:
- Default visibility is "Public"
- When importing, create with basic public accessibility
- Allow host to change visibility after import if needed

## 8. API Endpoints

```
# Event Sync
POST   /api/events/sync-bluesky          - Sync event/series to Bluesky
POST   /api/bluesky/events/process       - Process event from RabbitMQ

# RSVP Sync
POST   /api/events/:slug/attendees/sync  - Sync attendance to Bluesky
POST   /api/bluesky/rsvps/process        - Process RSVP from RabbitMQ

# Settings
POST   /api/events/:slug/bluesky-settings - Configure Bluesky sharing options
```

## 9. Testing Strategy

### 9.1 Unit Tests

- Data mapping between models
- RRULE translation 
- Status conversions

### 9.2 Integration Tests

- Full event publication flow
- RSVP synchronization
- Deduplication logic

### 9.3 End-to-End Tests

- Create event in OpenMeet, verify in Bluesky
- Create RSVP in Bluesky, verify in OpenMeet
- Modify occurrence, verify proper sync

## 10. Implementation Timeline

| Phase | Task | Details | Timeframe |
|-------|------|---------|-----------|
| 1 | Data model enhancements | Create EventSeries schema, implement model enhancements for events, series, and groups | 1 week |
| 2 | RabbitMQ consumer implementation | Update firehose consumer and event processor for new model | 1 week |
| 3 | Bluesky publishing implementation | Implement event creation, updates, and RSVP synchronization | 1 week |
| 4 | Group synchronization | Create custom lexicon, implement group publishing and membership sync | 1-2 weeks |
| 5 | Testing and refinement | End-to-end testing, performance optimization, security auditing | 2 weeks |

## 11. Operational Considerations

### 11.1 Error Handling

- Implement dead-letter queues for failed processing
- Create alert systems for sync failures
- Implement automatic retries with exponential backoff

### 11.2 Monitoring

- Track sync success/failure rates
- Monitor message processing latency
- Detect and alert on event count discrepancies

### 11.3 Performance

- Batch similar operations when possible
- Implement rate limiting for Bluesky API
- Cache recurrence calculations

### 11.4 Security Considerations

- Protect user credentials in Redis with appropriate TTL
- Implement proper access controls for Bluesky operations
- Validate event ownership before synchronization
- Follow principle of least privilege for API operations

## 12. Group Synchronization Approach

In addition to events and RSVPs, we need to synchronize group information between OpenMeet and Bluesky:

### 12.1 Custom Lexicon for Groups

Until a standardized community/group lexicon is available in the AT Protocol:

1. **Custom Lexicon**:
   - Create an OpenMeet-specific lexicon for groups (`openmeet.lexicon.group`)
   - Define core properties (name, description, membership criteria, etc.)
   - Include relationship fields for events hosted by the group
   - Add fields for roles and permissions to support admin functions

2. **Storage in PDS**:
   - Publish group records to the creator's PDS repository
   - Add admin role references to support future ownership transfers
   - Include "backup admin" capability for continuity
   - Store membership records as separate entities linked to the group

### 12.2 Group Data Ownership Model

Since ATProtocol doesn't currently have a concept of shared ownership:

1. **Creator-Based Ownership**:
   - Group records are owned by the creator's account
   - Access control managed through membership records
   - Admin permissions distributed through role assignments
   - Future enhancements could include quorum-based decision making

2. **Asset Management**:
   - Group assets (images, files) stored in S3 buckets
   - ATProtocol records reference these assets via URLs
   - Public assets potentially mirrored to Bluesky's image hosting
   - Consider IPFS integration for future decentralized storage

### 12.3 Integration with EventSeries

The group synchronization will interact with the EventSeries model:

1. **Group-Event Relationships**:
   - Include relationship identifiers in both group and event records
   - Define permission inheritance from groups to events
   - Implement promotion levels for controlling event visibility:
     - Group-only (not synced to Bluesky)
     - Members and followers (limited visibility in Bluesky)
     - Public (full Bluesky integration)

2. **Event Attribution**:
   - When publishing an event to Bluesky, include group attribution
   - Link to the group record in the PDS
   - Add visual indicators for group-hosted events

3. **Privacy Controls**:
   - Respect the visibility settings defined by groups
   - Only publish public group events unless explicitly configured
   - Implement proper permission validation across platforms

### 12.4 Group Membership Synchronization

To maintain consistent membership records:

1. **Membership Records**:
   - Store membership status in both systems
   - Define clear source of truth for conflict resolution
   - Sync changes bidirectionally when possible

2. **Role Management**:
   - Map OpenMeet roles to appropriate Bluesky representations
   - Handle permissions consistently across platforms
   - Maintain audit trail for role changes

### 12.5 Future Compatibility

1. **Migration Path**:
   - Design our custom lexicon to be compatible with expected standards
   - Plan migration strategy for when official group lexicon becomes available
   - Ensure data portability between implementations

2. **Extensibility**:
   - Build flexibility into the implementation to accommodate ATProtocol evolution
   - Implement feature flags for enabling/disabling specific sync capabilities
   - Create backward compatibility layers for existing integrations

## 13. Conclusion

The integration between OpenMeet's Event Series model and Bluesky's event system provides a seamless experience across platforms while maintaining the rich functionality of our recurrence model. By leveraging the existing firehose and message queue architecture, we can efficiently synchronize events, RSVPs, and groups between systems with minimal latency.

This integration respects existing visibility controls and ensures users maintain appropriate control over their data across platforms. The design balances comprehensive synchronization capabilities with performance and security considerations, while remaining adaptable to evolving standards in the AT Protocol ecosystem.