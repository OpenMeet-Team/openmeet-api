# ATProtocol RSVP Integration

This document outlines the RSVP integration between OpenMeet and the ATProtocol (Bluesky).

## Community Lexicon Format

RSVPs use the `community.lexicon.calendar.rsvp` lexicon:

```json
{
  "$type": "community.lexicon.calendar.rsvp",
  "subject": {
    "uri": "at://did:plc:xxx/community.lexicon.calendar.event/tid123",
    "cid": "bafyreid..."
  },
  "status": "community.lexicon.calendar.rsvp#going",
  "createdAt": "2024-01-15T12:00:00.000Z"
}
```

**Key Fields:**
- `subject`: StrongRef (uri + cid) pointing to the event - **NOT `event`**
- `status`: One of:
  - `community.lexicon.calendar.rsvp#going` (default)
  - `community.lexicon.calendar.rsvp#interested`
  - `community.lexicon.calendar.rsvp#notgoing`
- `createdAt`: ISO timestamp of original RSVP creation

**Record Key**: Uses TID (timestamp-based ID) for idempotent updates.

## Current Implementation State

### What Works

1. **Firehose Consumption** (bsky-firehose-consumer)
   - Collects RSVPs from `community.lexicon.calendar.rsvp` collection
   - Pushes to RabbitMQ for processing

2. **RSVP Processing** (bsky-event-processor)
   - `RsvpProcessorService` processes incoming RSVPs
   - Sends to OpenMeet API at `/api/integration/rsvps`

3. **Inbound RSVP Integration** (openmeet-api)
   - `RsvpIntegrationService` creates/updates attendance records
   - Creates shadow accounts for Bluesky users
   - Maps status values (going → Confirmed, interested → Maybe)

4. **Outbound RSVP Creation** (openmeet-api)
   - `BlueskyRsvpService` creates RSVPs in user's PDS
   - Integrated with `EventAttendeeService` for sync

### Resolved Issues

The following issues have been identified and fixed in the current implementation:

#### 1. ✅ Field Name in RSVP Processor
**File**: `bsky-event-processor/src/processor/rsvp-processor.service.ts`
**Status**: Fixed - correctly uses `record.subject` per community lexicon spec.

#### 2. ✅ CID in Subject (StrongRef)
**File**: `openmeet-api/src/bluesky/bluesky-rsvp.service.ts:144-146`
**Status**: Fixed - includes CID when available: `...(eventCid && { cid: eventCid })`

#### 3. ✅ Deterministic rkey
**File**: `openmeet-api/src/bluesky/bluesky-rsvp.service.ts:29-31`
**Status**: Fixed - uses SHA256 hash of event URI:
```typescript
private generateRsvpRkey(eventUri: string): string {
  return createHash('sha256').update(eventUri).digest('hex').substring(0, 13);
}
```

Benefits:
- Same event always produces same rkey
- Updates are idempotent (PUT replaces existing)
- No duplicate RSVPs possible

#### 4. ✅ Status Values with NSID Prefix
**File**: `openmeet-api/src/bluesky/BlueskyTypes.ts:55-59`
**Status**: Fixed - `RSVP_STATUS` constant provides full NSID-prefixed values:
- `community.lexicon.calendar.rsvp#going`
- `community.lexicon.calendar.rsvp#interested`
- `community.lexicon.calendar.rsvp#notgoing`

## Best Practices from Reference Implementations

### 1. Deterministic Record Keys
Use a hash of the event URI for the rkey. This ensures the same event always produces the same rkey, making updates idempotent.

### 2. Preserve Original createdAt
When status changes, keep the original `createdAt` timestamp. The user's initial engagement time should persist across status updates.

### 3. StrongRef with CID
Always include CID in subject reference. This links the RSVP to a specific version of the event.

### 4. RSVP Acceptance (Future Feature)
Advanced acceptance workflow for ticketed/private events:
- Event organizer can "accept" an RSVP
- Creates cryptographic proof of acceptance
- Useful for ticketed/private events

**Consider for Phase 2**.

### 5. Status Change Invalidates Validation
When RSVP status changes, clear any validation/signatures since the user agreed to attend under different conditions.

### 6. Event Version Change
When event is updated, consider clearing RSVP validations since attendees agreed to a different version of the event.

## Implementation Plan

### Phase 1: Fix Core Issues (Critical)

#### Task 1: Fix RSVP Processor Field Mapping
**File**: `bsky-event-processor/src/processor/rsvp-processor.service.ts`

1. Change `record.event` to `record.subject`
2. Extract both `uri` and `cid` from subject
3. Handle both string and object subject formats

#### Task 2: Add CID to Outbound RSVPs
**File**: `openmeet-api/src/bluesky/bluesky-rsvp.service.ts`

1. Fetch event CID from sourceData
2. Include in subject StrongRef
3. Store event CID in attendance metadata

#### Task 3: Implement Deterministic rkey
**File**: `openmeet-api/src/bluesky/bluesky-rsvp.service.ts`

1. Create hash function for event URI
2. Generate consistent 13-char TID
3. Update existing RSVP lookup logic

#### Task 4: Fix Status Value Format
**Files**: Both API and processor

1. Use full NSID prefix for status
2. Update status mapping in both directions

### Phase 2: Enhancements

#### Task 5: Preserve createdAt Across Updates
1. Check for existing RSVP before creating
2. Preserve original `createdAt` on status change
3. Track status history in metadata

#### Task 6: Track Event Version
1. Store event CID at time of RSVP
2. Flag when event has changed since RSVP
3. Consider UI indicator for "event updated"

### Phase 3: Future Features

#### Task 7: RSVP Acceptance Workflow
For ticketed/private events:
1. Create `openmeet.calendar.acceptance` lexicon
2. Implement acceptance record creation
3. Add validation tracking to attendance

## Database Schema Updates

### Event Attendee Metadata
```typescript
interface AttendeeMetadata {
  // Existing
  sourceId?: string;      // RSVP AT-URI
  sourceType?: string;    // 'bluesky'
  lastSyncedAt?: Date;

  // New fields
  blueskyRsvpUri?: string;
  blueskyRsvpCid?: string;
  eventCidAtRsvp?: string;     // Event CID when RSVP was created
  originalCreatedAt?: string;   // Preserve across status changes
  validatedAt?: Date;           // Future: acceptance validation
}
```

## Testing Checklist

### Unit Tests
- [ ] RSVP processor correctly parses subject field
- [ ] Deterministic rkey generates consistent values
- [ ] Status values use correct NSID format
- [ ] CID included in outbound RSVPs

### Integration Tests
- [ ] Inbound RSVP creates attendance record
- [ ] Outbound RSVP syncs to Bluesky PDS
- [ ] Status updates preserve createdAt
- [ ] RSVP deletion cancels attendance

### E2E Tests
- [ ] User RSVPs via OpenMeet → appears in Bluesky
- [ ] User RSVPs via Bluesky → appears in OpenMeet
- [ ] Status change syncs bidirectionally
- [ ] Cancellation syncs correctly

## Metrics

### Existing Metrics
- `bluesky_rsvp_operations_total{tenant, operation, status}`
- `bluesky_rsvp_processing_duration_seconds{tenant, operation}`
- `rsvp_integration_processed_total{tenant, source_type, operation}`

### Recommended Additions
- `rsvp_sync_errors_total{direction, error_type}`
- `rsvp_version_mismatch_total{tenant}` (event changed since RSVP)

## References

- [Community Lexicon - RSVP](https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/rsvp.json)
- [ATProto Deleted Records Discussion](https://github.com/bluesky-social/atproto/discussions/2686)
