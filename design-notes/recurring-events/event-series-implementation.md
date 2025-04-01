# EventSeries Implementation for Recurring Events

## Current State

Our current implementation of recurring events extends the Event entity with recurrence fields:
- Added fields to the `events` table for `recurrenceRule`, `recurrenceExceptions`, `timeZone`, etc.
- Implemented a `RecurrenceService` to handle pattern generation and timezone adjustments
- Created basic UI components for creating and viewing recurring events
- Started implementing series modification with splitting functionality

## New Direction

After reviewing the consolidated implementation plan and current needs, we've decided to:

1. Move to a dedicated EventSeries model that acts as a container for occurrences
2. Remove series splitting in favor of individual occurrence materialization
3. Focus on template propagation to unmaterialized occurrences
4. Maintain compatibility with ATProtocol through pragmatic syncing

## Database Schema

```sql
-- Event Series Table
CREATE TABLE event_series (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  time_zone VARCHAR(50),
  recurrence_rule JSONB,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add Series Reference to Events Table
ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES event_series(id);
ALTER TABLE events ADD COLUMN materialized BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN original_occurrence_date TIMESTAMP;
```

## URL Structure

- Series: `/event-series/{series-slug}`
- Occurrence: `/event-series/{series-slug}/{occurrence-date}`
  - Example: `/event-series/waterfront-wednesday/2025-06-01-12-15`
  - When occurrence dates change, we still reference by original occurrence date

## Materialization Rules

Events are materialized (created as concrete entities) when:
1. A user with leadership role edits a specific occurrence
2. Users attend or start a discussion on an occurrence 
3. The current next event is completed (auto-materialize the new "next" occurrence)

Changes to the series template:
- Affect all future unmaterialized occurrences
- Time changes to materialized occurrences maintain existing attendees and trigger notifications

## ATProtocol Integration

Until ATProtocol supports native recurrence:
1. Populate occurrences 2 months into the future in Bluesky
2. Include link back to series in each event's description
3. Update occurrences as they're modified
4. For Bluesky→OpenMeet events: import as individual events initially with heuristics to detect potential series patterns

## Next Implementation Steps

1. Create EventSeries entity
2. Implement occurrence materialization service 
3. Add API endpoints for series and occurrence management
4. Update UI with Quasar calendar integration
5. Implement ATProtocol integration for recurring events

## UI Considerations

- Calendar shows occurrences on their planned or actual date (if materialized)
- Clear visual distinction between series templates and individual occurrences
- Navigation paths to move between series and specific occurrences
- Template modification interface shows propagation options