# Event Series Deletion: Selective Future Occurrence Handling

## Overview

When deleting an event series in OpenMeet, the system should preserve past events while only removing future occurrences. This document outlines the implementation design and rationale for this behavior.

## Current Implementation

Previously, when an event series was deleted:
1. All events in the series were identified and retrieved
2. Each event was deleted using the EventManagementService, regardless of its date
3. After all events were deleted, the series itself was removed

This approach had a drawback: historical events and their associated data (attendance records, discussions, etc.) were lost when a series was deleted.

## New Implementation

The updated implementation preserves past events while only deleting future occurrences:

1. When a series is deleted, events are split into two categories:
   - Past events (startDate < current date)
   - Future events (startDate >= current date)

2. Future events handling:
   - All future events are deleted using the standard event deletion mechanism
   - This includes cleanup of related resources (chat rooms, invitations, etc.)

3. Past events handling:
   - Past events are preserved in the database
   - Their association with the series is removed (seriesSlug = undefined)
   - They become standalone events, no longer part of a recurring series

4. Series removal:
   - After handling all events, the series entity itself is deleted

## Implementation Details

### Key Steps in the Process:

1. **Event Filtering**:
   ```typescript
   const now = new Date();
   const futureEvents = events.filter((event) => event.startDate >= now);
   const pastEvents = events.filter((event) => event.startDate < now);
   ```

2. **Future Event Deletion**:
   ```typescript
   for (const event of futureEvents) {
     await this.eventManagementService.remove(event.slug);
   }
   ```

3. **Past Event Preservation**:
   ```typescript
   for (const event of pastEvents) {
     await this.eventManagementService.update(
       event.slug,
       { seriesSlug: undefined },
       userId
     );
   }
   ```

4. **Series Deletion**:
   ```typescript
   await this.eventSeriesRepository.delete(series.id);
   ```

### Helper Methods:

A dedicated method `updatePastEventForSeriesRemoval` handles the update of past events to remove their series association while preserving the event itself.

## Rationale

1. **Data Preservation**: Past events often contain valuable historical data including attendance records, discussions, and content that should be preserved even when a series is discontinued.

2. **User Expectations**: Users generally expect that canceling future events shouldn't erase evidence that past events occurred.

3. **Analytics Integrity**: Preserving past events maintains the integrity of analytics and reporting features that rely on historical event data.

4. **Reduced Data Loss Risk**: This approach minimizes the risk of accidental data loss when managing recurring events.

## Edge Cases

1. **Events happening now**: Events that are currently in progress (started but not ended) are considered "future" events and will be deleted along with the series.

2. **Time zone considerations**: The current date is determined by the server's time zone, which may differ from the user's or event's time zone.

3. **Series restored**: If a user needs to restore a deleted series, only future occurrences would need to be recreated. Past occurrences would remain as standalone events.

## UI Considerations

1. When a user attempts to delete a series, a confirmation dialog should clarify:
   - Future events will be deleted
   - Past events will be preserved as standalone events
   - This action cannot be easily undone

2. After deletion, past events from the series should appear in event listings without any indication that they were once part of a series.

## Future Improvements

1. **Soft deletion**: Consider implementing soft deletion for series and events, allowing for potential restoration.

2. **Event status transitions**: Provide options to mark future occurrences as "cancelled" rather than deleting them entirely.

3. **Selective retention**: Allow users to choose which future occurrences to delete and which to preserve.

4. **Batch processing**: For very large series, implement batch processing to handle deletion efficiently. 