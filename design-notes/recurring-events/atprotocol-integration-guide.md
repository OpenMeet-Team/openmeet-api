# ATProtocol Integration Guide

This document provides a technical guide for integrating OpenMeet's Event Series with Bluesky's ATProtocol.

## Current State & Limitations

### ATProtocol Event Lexicon

ATProtocol's current `community.lexicon.calendar.event` lexicon supports:
- Basic event properties (name, description, times, locations)
- Event status tracking (scheduled, cancelled, etc.)
- Multiple locations and URI references

Key limitation: **No native support for recurring events**. The proposed extension would add:
- `rrule`: Recurrence specification (frequency, interval, etc.)
- `exdate`: Exception dates excluded from pattern
- `rdate`: Additional dates included in pattern

### Integration Architecture

```
┌────────────────────────────────────┐       ┌────────────────────────────────┐
│                                    │       │                                │
│            OpenMeet                │       │         Bluesky                │
│                                    │       │                                │
│  ┌─────────────┐   ┌────────────┐  │       │  ┌──────────────┐             │
│  │             │   │            │  │       │  │              │             │
│  │ EventSeries ├───┤ Occurrence │  │       │  │ Single Event │             │
│  │             │   │            │  │       │  │              │             │
│  └─────────────┘   └────────────┘  │       │  └──────────────┘             │
│                                    │       │                                │
└────────────────┬───────────────────┘       └───────────────┬────────────────┘
                 │                                           │
                 └───────────────┬───────────────────────────┘
                                 │
                         ┌───────┴──────┐
                         │              │
                         │  Sync Layer  │
                         │              │
                         └──────────────┘
```

## Data Flow Components

### 1. Ingestion Flow (Bluesky → OpenMeet)

The event ingestion uses these services:

1. **bsky-firehose-consumer**:
   - Connects to Bluesky network firehose via WebSocket
   - Filters for calendar event and RSVP collections
   - Publishes to RabbitMQ with routing keys (event.create, etc.)
   - Implements buffering and reconnection logic

2. **bsky-event-processor**:
   - Consumes messages from RabbitMQ
   - Maps Bluesky data to API format
   - Handles create, update, delete operations
   - Implements error handling and retries

3. **Series Detection Service**:
   - Analyzes events for recurring patterns
   - Groups related events into potential series
   - Suggests series creation when patterns detected

### 2. Publishing Flow (OpenMeet → Bluesky)

1. **BskyClient Service**:
   - Manages authentication with Bluesky API
   - Handles token refresh and session management
   - Publishes events and RSVPs to Bluesky

2. **EventPublishingService**:
   - Selects which occurrences to publish
   - Formats event data for Bluesky compatibility
   - Tracks external references for synchronization

3. **DeduplicationService**:
   - Prevents duplicate events from being created
   - Matches self-published events with firehose events
   - Implements checksum validation for event matching

## Implementation Strategy

### 1. Pragmatic Recurrence Approach

Until ATProtocol supports native recurrence:

#### OpenMeet → Bluesky:
- Publish only the next upcoming occurrence to Bluesky
- Include a link to the full series on OpenMeet
- Add descriptive text in the event indicating it's part of a series
- After an occurrence completes, publish the next one

#### Bluesky → OpenMeet:
- Import events as standalone one-off events initially
- Store the external reference (URI, CID) for future sync
- Implement heuristics to detect potential series patterns
- Connect related events as part of a series when appropriate

### 2. Shadow Account Management

For events discovered from users who haven't joined OpenMeet:

1. **Shadow Account Creation**:
   - Create lightweight accounts using Bluesky DIDs as identifiers
   - Store minimal user information (handle, display name)
   - Flag these accounts as external/provisional
   - Apply proper access control to prevent impersonation

2. **Event Permissions**:
   - Make events fully functional with complete visibility
   - Allow OpenMeet users to RSVP (sync back to Bluesky)
   - Enable discussions on these events
   - Include clear indication of the Bluesky source

3. **Account Claiming**:
   - When a Bluesky user logs in, automatically transfer ownership of their events
   - Match users based on DID identifiers
   - Merge shadow account data with the new full account
   - Preserve all event relationships and interactions

### 3. User Authentication Flow

The Bluesky login flow provides the necessary credentials:

1. **Authorization**:
   - User logs in via OAuth redirect flow
   - ATProtocol PDS returns accessJwt and refreshJwt tokens

2. **Credential Storage**:
   - Tokens stored in Redis with appropriate expiration (1 hour)
   - Key pattern: `bluesky:credentials:${user.id}`

3. **Token Management**:
   - Automatic refresh of tokens when needed
   - Cleanup of expired tokens
   - Session maintenance for recurring operations

### 4. Event Status Mapping

Mapping between OpenMeet attendance statuses and Bluesky RSVP statuses:

**OpenMeet to Bluesky:**
- `attending` → `community.lexicon.calendar.rsvp#going`
- `interested` → `community.lexicon.calendar.rsvp#interested`
- `declined` → `community.lexicon.calendar.rsvp#notgoing`

**Bluesky to OpenMeet:**
- `community.lexicon.calendar.rsvp#going` → `attending`
- `community.lexicon.calendar.rsvp#interested` → `interested`
- `community.lexicon.calendar.rsvp#notgoing` → `declined`

## Data Model Extensions

### EventSeries Entity

```typescript
// ATProtocol integration fields
externalId?: string;       // Bluesky URI
externalCid?: string;      // Bluesky CID
externalSource?: string;   // 'bluesky', 'openmeet', etc.
externalData?: any;        // Store original Bluesky data
isReadOnly?: boolean;      // True if we shouldn't push changes back
```

### Event (Occurrence) Entity

```typescript
// ATProtocol integration fields
externalId?: string;       // Bluesky URI for this specific occurrence
externalCid?: string;      // Bluesky CID
```

### User Entity

```typescript
// ATProtocol integration fields
blueskyDid?: string;       // Bluesky DID
blueskyHandle?: string;    // Bluesky handle
blueskyTokenExpiry?: Date; // Token expiration time
isShadowAccount?: boolean; // True if this is a provisional account
```

## Deduplication & Conflict Resolution

### Deduplication Strategy

When processing events from the Bluesky firehose:

1. **Self-Published Event Detection**:
   - Check if the event creator is our own Bluesky DID
   - Use external references (URI, CID) to match with our records
   - Implement checksum validation for additional verification

2. **Reference Management**:
   - For self-published events, update external references rather than creating duplicates
   - Store URIs and CIDs for future operations
   - Maintain bidirectional mappings between local and external IDs

### Conflict Resolution

For event data conflicts:

1. **Source of Truth Principle**:
   - If event originates from Bluesky, treat Bluesky as source of truth
   - If event originates from OpenMeet, treat OpenMeet as source of truth
   - Record the origin in the event metadata to maintain this distinction

2. **Field-Specific Policies**:
   - Attendance status: Always use the latest value
   - User-generated content: Preserve manual edits
   - Start/end times: Prioritize the source of truth platform
   - Location data: Merge if both sources provide unique information

## Series Detection Algorithm

To identify potential recurring events from Bluesky:

1. **Pattern Recognition**:
   - Analyze event names using fuzzy matching
   - Look for timing patterns (same day/time each week/month)
   - Consider location and description similarities
   - Score events based on likelihood of being part of a series

2. **Grouping Algorithm**:
   - Group events with high similarity scores
   - Verify that the grouping follows a regular pattern
   - Calculate a potential recurrence rule for the group
   - Propose series creation for events with high confidence scores

3. **User Assistance**:
   - Present potential series to users for confirmation
   - Allow manual adjustment of detected patterns
   - Provide one-click creation of series from detected events

## Integration API Endpoints

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

## Future Enhancement: Custom Group Lexicon

Until a standardized community/group lexicon is available:

1. **Custom Lexicon**:
   - Create an OpenMeet-specific lexicon for groups (`openmeet.lexicon.group`)
   - Define core properties (name, description, membership criteria)
   - Include relationship fields for events hosted by the group

2. **Group Data Ownership**:
   - Group records owned by the creator's account
   - Access control managed through membership records
   - Admin permissions distributed through role assignments

3. **Group-Event Relationships**:
   - Include relationship identifiers in both group and event records
   - Define permission inheritance from groups to events
   - Implement visibility controls for group content