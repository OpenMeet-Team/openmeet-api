# EventSeries Implementation for Recurring Events

## random notes and questions to be resolved

when we create new event series using the page at event-series/create we are only setting recurring info.  I think we should remove the button for "create event series" and the menu item for turning an event into a recuring event.  and the backing pages for the series only.  for now, the only way using the ui to create recuring event serirs is to create an event and set recurring rule.  how do we delete the future series? 


## Current State

Our current implementation of recurring events extends the Event entity with recurrence fields:
- Added fields to the `events` table for `recurrenceRule`, `recurrenceExceptions`, `timeZone`, etc.
- Implemented a `RecurrenceService` to handle pattern generation and timezone adjustments
- Created basic UI components for creating and viewing recurring events
- Started implementing series modification with splitting functionality

### Safeguards and Restrictions
- **Nested Series Prevention**: The system prevents events that are already part of a series from being turned into recurring events themselves (double recurrence). This protection is implemented at multiple levels:
  - In the EventFormBasicComponent: The recurrence checkbox is disabled when an event has a seriesSlug
  - In the PromoteToSeriesComponent: Validation prevents promoting events that already belong to a series
  - In the RecurrenceManagementComponent: "Convert to Series" button is disabled for events in a series
  - Informative UI messages explain why an event can't be made recurring again

### Known Limitations
- When editing an event that belongs to a series, all recurrence controls are disabled to prevent creating nested series
- Series-wide changes require using the dedicated series management interface rather than individual event editing
- Template events must have all necessary fields (location, end date, etc.) when creating a series for proper propagation to future occurrences
- When migrating from the old recurrence model to EventSeries, special handling is required for existing recurring events

### Data Flow
- Creating a recurring event requires two primary objects:
  - A series object with metadata and recurrence pattern
  - A template event with complete event details
- The template event must include all fields that would be required for a standalone event 
- Fields missing from the template event will not be properly propagated to future occurrences
- Debug logging has been added to trace template event data flow during series creation

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
ALTER TABLE events ADD COLUMN original_occurrence_date TIMESTAMP;
```

Note: After implementation testing, we determined that the `materialized` column was unnecessary and has been removed. Any event record with a `series_id` that exists in the database is considered materialized by definition.

## URL Structure

- Series: `/event-series/{series-slug}`
- Occurrence: `/event-series/{series-slug}/{occurrence-date}`
  - Example: `/event-series/waterfront-wednesday/2025-06-01-12-15`
  - When occurrence dates change, we still reference by original occurrence date

## Materialization Rules

Events are considered materialized when they have an actual database record in the events table with a series_id reference. Materialization happens when:
1. A user with leadership role edits a specific occurrence
2. Users attend or start a discussion on an occurrence 
3. The current next event is completed (auto-materialize the new "next" occurrence)

Changes to the series template:
- Affect all future occurrences that don't yet exist in the database
- Time changes to existing occurrences maintain existing attendees and trigger notifications

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

- Calendar shows occurrences on their planned or actual date (if they exist in the database)
- Clear visual distinction between series templates and individual occurrences
- Navigation paths to move between series and specific occurrences
- Template modification interface shows propagation options

## Event Series Implementation Notes

## Overview
Event series in OpenMeet are implemented with a dedicated series entity that manages recurring events. The series maintains an ordered list of events and references a current template event that serves as the blueprint for future occurrences.

## Database Schema

### Event Series Entity
- id, name, description, slug
- recurrenceRule, recurrenceDescription
- currentTemplateEventId (reference to template event)
- timeZone, user, group, image references
- source tracking (ATProtocol, etc.)
- matrixRoomId (for integrations)

### Event Entity (extended)
- seriesId (foreign key to event_series)
- isTemplate (boolean to identify template events)
- originalOccurrenceDate (timestamp, tracks which date the event was generated for)

## Series-Event Relationship
- Series maintains an ordered list of event IDs
- Series has a pointer to the current template event
- Events can determine they're part of a series via seriesId
- Series and event properties are independent (no inheritance)

## Implementation Details

### Creating a Series
1. Create series with name, description, recurrence rule
2. Create first event with provided properties
3. Mark first event as template (isTemplate = true)
4. Set first event as current template for series
5. Add first event to series' ordered list

### Template Event Management
1. When updating "this and all future events":
   - Update specified event with new properties
   - Mark this event as a template (isTemplate = true)
   - Update series to reference this event as the current template
   - Update all future occurrences using properties from new template

2. When editing a single occurrence:
   - Only update that specific occurrence
   - Current template remains unchanged
   - Future occurrences continue using current template

### Occurrence Generation
1. When materializing an occurrence:
   - Use properties from current template event
   - Create a database record for the occurrence
   - Add to series' ordered list

2. Occurrence management:
   - Generate virtual occurrences 2 months in advance for display
   - Create actual database records only when needed
   - Use current template event for new occurrences

## Test Cases

### Basic Series Creation and Template
1. Create a weekly book club series starting March 21st:
   - First event becomes template with location "Library A"
   - Series points to first event as current template
   - March 28th occurrence uses Library A location
   - April 4th occurrence uses Library A location

### Template Changes
1. Update April 4th and all future events:
   - April 4th event becomes new template with location "Library B"
   - Series updates currentTemplateEventId to April 4th
   - April 4th occurrence uses Library B location
   - April 11th occurrence uses Library B location
   - March 28th occurrence keeps Library A location

### Single Occurrence Updates
1. Edit March 28th event only:
   - March 28th uses "Library C" location
   - April 4th and future events still use Library B location
   - Current template remains unchanged

### Multiple Template Changes
1. Series timeline with multiple templates:
   - March 21st: First template (Library A)
   - April 4th: Second template (Library B) - series points to this
   - May 2nd: Third template (Library C) - series points to this
   - Each template affects only its date and future dates

### Edge Cases
1. Timezone handling:
   - Series in America/New_York
   - Template change at 11:59 PM
   - Next occurrence at 12:01 AM
   - Verify correct template is used

2. Cancellation and rescheduling:
   - Cancel April 4th event (mark as cancelled)
   - April 11th still uses current template
   - Reschedule April 11th to April 12th (set rescheduled = true)
   - Still uses current template

## Future Improvements

### Optimization
- Consider caching template properties
- Batch generation of future occurrences
- Efficient query patterns for large series

### Consistency
- Ensure timezone consistency across series
- Validation for template changes
- Handling of series spanning DST changes

### User Experience
- Provide clear indication of template status
- Show which template applies to which occurrences
- Allow viewing template history
