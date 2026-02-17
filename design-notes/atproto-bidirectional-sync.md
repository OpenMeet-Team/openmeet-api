# AT Protocol Bidirectional Sync Design

**Date**: 2026-02-15
**Status**: Approved
**Related issues**: om-kopd (event update does not auto-sync to ATProto)
**Supersedes**: `bsky-event-sync.md` (deprecated)
**Amends**: `atprotocol-design.md` (source of truth model), `atprotocol-rsvp-integration.md` (RSVP sync direction)

## Principle

**The user's PDS record is the source of truth.** OpenMeet DB is a cache of the authoritative ATProto record. When in doubt, PDS wins.

Scope:
- **Public events/RSVPs published to ATProto**: PDS is truth, DB is cache.
- **Private/unlisted events**: PostgreSQL is authoritative (cannot exist on PDS — ATProto repos are public). No sync conflict possible.
- **Events not yet published**: Exist only in DB until first publish.

## Multi-Editor Model

ATProto ownership is individual — only the DID owner can write to their repo. OpenMeet allows multiple editors (group admins, co-hosts).

**Resolution**: When any authorized editor (owner or group admin) edits an event on OpenMeet, publish to the owner's PDS using the owner's custodial session. This works because OpenMeet manages custodial PDS accounts.

- **Custodial users**: OpenMeet holds credentials, can publish on behalf of the owner anytime.
- **OAuth users**: Requires active OAuth session. If expired, event stays pending sync until session is refreshed or owner triggers manual sync.

This eliminates the "multi-editor gap" — all authorized edits flow to PDS immediately (or as soon as a session is available).

## Current State (~70% complete)

### Working
- Outbound publish (OpenMeet → PDS via `putRecord`)
- CID captured and stored (`atprotoCid` on EventEntity)
- Inbound receive (firehose → RabbitMQ → `event-integration.service`)
- CID available in firehose messages (`message.commit.cid`)
- Deduplication on ingest (3-layer: sourceId, sourceUrl, slug extraction)
- Change detection (`updatedAt > atprotoSyncedAt`)

### Missing
- `swapRecord` on outbound (no optimistic concurrency)
- CID comparison on inbound (no conflict detection)
- Loop prevention
- Retry mechanism for failed publishes (5-minute scanner)
- Error resilience in update handler (om-kopd)

## Design

### Data Flow

```
User edits on OpenMeet (any authorized editor):
  1. Save to DB (optimistic — like a local commit)
  2. Publish to owner's PDS with swapRecord CID check
     ├─ Success → store new CID, in sync
     ├─ Conflict (409) → fetch PDS version, overwrite local DB
     └─ PDS down → event stays pending, retry in ≤5 min

Remote edit via ATProto client:
  1. Firehose delivers update with new CID
  2. CID === stored atprotoCid? → skip (our own echo)
  3. CID !== stored atprotoCid? → accept, update local DB (PDS is truth)
```

### Component Changes

#### 1. Outbound: Optimistic Concurrency (`bluesky.service.ts`)

Add `swapRecord` to `putRecord` calls for updates (not creates):

```typescript
const result = await agent.com.atproto.repo.putRecord({
  repo: did,
  collection: standardEventCollection,
  rkey,
  record: recordData,
  // Optimistic concurrency: reject if record changed since our last sync
  ...(event.atprotoCid ? { swapRecord: event.atprotoCid } : {}),
});
```

On 409 Conflict response:
- Fetch current PDS record via `getRecord`
- Update local DB with PDS version (PDS is truth)
- Log warning so operator knows a local edit was superseded
- Return a `{ action: 'conflict' }` result

#### 2. Outbound: Error Resilience (`event-management.service.ts`)

Wrap ATProto publish block in try-catch during event updates:

```typescript
try {
  const publishResult = await this.atprotoPublisherService.publishEvent(...);
  // handle result...
} catch (error) {
  this.logger.error(`ATProto publish failed for event ${slug}, will retry`, {
    error: error.message,
  });
  // Event stays marked as pending sync (updatedAt > atprotoSyncedAt)
}
```

Log ALL error actions, not just validation errors.

#### 3. Inbound: CID Match Guard (`event-integration.service.ts`)

In `updateExistingEvent()`, before overwriting:

```typescript
// Skip if this is our own echo (CID matches what we published)
if (existingEvent.atprotoCid && incomingCid === existingEvent.atprotoCid) {
  this.logger.debug(`Skipping echo for event ${existingEvent.slug}`);
  return existingEvent;
}

// PDS is truth — accept remote version
```

#### 4. Retry: Pending Sync Scanner (new scheduled job, every 5 minutes)

Periodic job that finds events with unsynced local changes:

```sql
SELECT * FROM events
WHERE atproto_uri IS NOT NULL
  AND updated_at > atproto_synced_at
  AND source_type IS NULL
```

Republish each to PDS. Uses the same `publishEvent()` flow with `swapRecord` for conflict detection.

#### 5. Loop Prevention

Handled naturally by the CID match guard:
1. OpenMeet publishes update → PDS returns new CID → stored in DB
2. Firehose echoes the update with same CID
3. Inbound CID match check → skip

No additional mechanism needed.

## Applies to RSVPs Too

RSVP records follow the same bidirectional sync model:
- **User's own RSVPs**: PDS is truth. If a user RSVPs via an ATProto client, OpenMeet accepts it.
- **Outbound**: When user RSVPs on OpenMeet, publish to their PDS.
- **Inbound**: When firehose delivers an RSVP update with a different CID, accept it (PDS is truth).
- **CID match guard**: Same echo detection as events.

## Event Lifecycle

```
Created on OpenMeet          Created on ATProto
       │                            │
       ▼                            ▼
  Save to DB                  Firehose delivers
       │                            │
       ▼                            ▼
  Publish to PDS             Create in DB with
  (with swapRecord)          sourceType='bluesky'
       │                            │
       ▼                            ▼
  Store CID ◄──── sync ────► Store CID
       │                            │
       ▼                            ▼
  Edits flow                 Edits flow
  OpenMeet → PDS             PDS → OpenMeet
  (outbound)                 (inbound)
```

## Conflict Notification

**Silent with server-side logging.** When a conflict is resolved (local edit superseded by PDS version), log it at WARN level for operators. No user-facing notification — the user sees the PDS version next time they load the event.

## Implementation Phases

### Phase 1: Fix om-kopd (immediate)
- Wrap update handler's ATProto publish in try-catch
- Log all error actions
- No behavior change for happy path

### Phase 2: Outbound optimistic concurrency
- Add `swapRecord` to `putRecord` for updates
- Handle 409 Conflict (fetch PDS version, overwrite local)
- Add `conflict` action to PublishResult type

### Phase 3: Inbound CID guard
- CID match check in `event-integration.service.ts`
- Skip echoes, accept remote edits

### Phase 4: Pending sync retry
- Scheduled job (every 5 min) to republish stale events
- Reuses existing publish flow

### Phase 5: RSVP bidirectional sync
- Apply same CID match guard and retry pattern to RSVP records

## Testing Strategy

Each phase has its own tests:
- Phase 1: Unit tests for try-catch behavior
- Phase 2: Unit tests for swapRecord, mock 409 responses
- Phase 3: Unit tests for CID comparison in inbound path
- Phase 4: Integration test for retry scanner
- Phase 5: Unit tests for RSVP CID matching

## Reconciliation with Existing Design Docs

### `bsky-event-sync.md` — DEPRECATED
This document's "don't save locally if PDS fails" strategy is superseded. The new model saves locally first (optimistic) and publishes async. Reference this document instead.

### `atprotocol-design.md` — AMENDED
- **Lines 86-104 (Source of Truth table)**: Still correct. Private data stays PostgreSQL-authoritative. Public published data follows PDS-is-truth.
- **Lines 1384-1405 (Multi-Editor Gap)**: Resolved by publishing via owner's custodial session when any authorized editor makes changes.
- **Lines 123-126 (Bidirectional Sync)**: Now defined in this document.

### `atprotocol-rsvp-integration.md` — AMENDED
- RSVP source of truth is now defined: PDS is truth for user's own RSVPs. Same CID match guard and retry pattern as events.
