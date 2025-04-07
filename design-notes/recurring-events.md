# Recurring Events Design Notes

## Overview
Recurring events in OpenMeet are managed through event series, where each series has a recurrence pattern and uses template events to define properties for future occurrences.

## Key Concepts

### Event Series
- A container for a set of recurring events
- Contains:
  - Basic metadata (name, description, timezone)
  - Recurrence pattern (frequency, interval, rules)
  - Reference to current template event

### Template Events
- Template events define the properties for future occurrences
- Templates can change over time as the series evolves
- Each template event is valid from its date until the next template event's date
- The first event in a series becomes the initial template
- When updating "this and all future events", the updated event becomes the new template

Example timeline:
```
March 21st (First Template) → April 4th (New Template) → Future Events
- March 21st template used for March 28th
- April 4th template used for April 11th, 18th, etc.
```

### Recurrence Pattern
- Defines when events should occur
- Supports:
  - Daily, weekly, monthly, yearly frequencies
  - Intervals (every N days/weeks/months/years)
  - By weekday (for weekly recurrence)
  - By month day (for monthly recurrence)
  - Until date (end of series)

### RecurrenceRule Interfaces

#### Frontend RecurrenceRule
```typescript
export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
  interval?: number
  count?: number
  until?: string
  bysecond?: number[]
  byminute?: number[]
  byhour?: number[]
  byweekday?: string[] // Days of the week (SU, MO, TU, WE, TH, FR, SA)
  bymonthday?: number[]
  byyearday?: number[]
  byweekno?: number[]
  bymonth?: number[]
  bysetpos?: number[]
  wkst?: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'
}
```

#### Backend RecurrenceRuleDto
```typescript
export class RecurrenceRuleDto {
  @IsString()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
  frequency: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  interval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @IsOptional()
  @IsDateString()
  until?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  byweekday?: string[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  bymonth?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  bymonthday?: number[];

  @IsOptional()
  @IsString()
  @IsIn(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])
  wkst?: string;
}
```

### Utility Functions for Type Conversion

The system includes utility functions to convert between frontend and backend recurrence rule formats:

```typescript
// Convert frontend RecurrenceRule to backend RecurrenceRuleDto format
export function toBackendRecurrenceRule(rule: Partial<RecurrenceRule>): RecurrenceRuleDto {
  if (!rule) return { frequency: 'WEEKLY' }

  return {
    frequency: rule.frequency || 'WEEKLY',
    interval: rule.interval,
    count: rule.count,
    until: rule.until,
    byweekday: rule.byweekday,
    bymonth: rule.bymonth,
    bymonthday: rule.bymonthday,
    wkst: rule.wkst
  }
}

// Convert backend RecurrenceRuleDto to frontend RecurrenceRule format
export function toFrontendRecurrenceRule(dto: RecurrenceRuleDto): RecurrenceRule {
  if (!dto) return { frequency: 'WEEKLY' }

  return {
    frequency: dto.frequency as any || 'WEEKLY',
    interval: dto.interval,
    count: dto.count,
    until: dto.until,
    byweekday: dto.byweekday,
    bymonth: dto.bymonth,
    bymonthday: dto.bymonthday,
    wkst: dto.wkst as any
  }
}
```

## API Endpoints

### Creating a Series
```typescript
POST /api/event-series
{
  "name": "Weekly Book Club",
  "description": "A weekly book club meeting",
  "timeZone": "America/New_York",
  "recurrenceRule": {
    "frequency": "WEEKLY",
    "interval": 1,
    "byweekday": ["TH"]
  },
  "templateEvent": {
    // First event that becomes the initial template
    "startDate": "2024-03-21T19:00:00Z",
    "endDate": "2024-03-21T21:00:00Z",
    "type": "in-person",
    "location": "Local Library Meeting Room",
    "maxAttendees": 20,
    // ... other event properties
  }
}
```

### Editing Events

1. Edit a single occurrence:
```typescript
PATCH /api/event-series/{seriesSlug}/2024-03-28
{
  "location": "Different Library Branch",
  "description": "Special meeting with guest author"
}
```

2. Edit this and all future events (creates new template):
```typescript
PATCH /api/event-series/{seriesSlug}/future-from/2024-04-04
{
  "location": "Different Library Branch",
  "description": "Special meeting with guest author"
}
```

3. Edit series metadata:
```typescript
PATCH /api/event-series/{seriesSlug}
{
  "name": "New Book Club Name",
  "description": "Updated description"
}
```

4. Promote an existing event to a series:
```typescript
POST /api/event-series/create-from-event/{eventSlug}
{
  "name": "New Book Club Series",
  "description": "Book club series description",
  "recurrenceRule": {
    "frequency": "WEEKLY",
    "interval": 1,
    "byweekday": ["TH"]
  }
}
```

// Note: As of 2025-04-05, there's a known issue where the original event (eventSlug)
// is not reliably linked back to the newly created series (seriesId/seriesSlug properties 
// might remain null on the original event after promotion).

## Implementation Details

### Template Event Management
1. When creating a series:
   - Create the first event with provided properties
   - Store this event's slug as the initial template
   - Use this event's properties for future occurrences

2. When updating "this and all future events":
   - Update the specified event with new properties
   - This event becomes the new template
   - All future occurrences use this event's properties
   - Previous template remains unchanged for past occurrences

3. When editing a single occurrence:
   - Only update that specific occurrence
   - Template event remains unchanged
   - Future occurrences continue using current template

### Occurrence Generation
1. When materializing an occurrence:
   - Find the active template for the occurrence's date
   - Copy properties from the template
   - Apply any single-occurrence overrides
   - Create the occurrence with combined properties

2. When querying occurrences:
   - Return all occurrences in the series
   - Include materialization status
   - Include which template was used

### RRule Integration
- The system uses the RRule library to generate occurrence dates
- A RecurrenceService provides utilities to:
  - Convert RecurrenceRule objects to RRule objects
  - Generate human-readable pattern descriptions
  - Calculate upcoming occurrences
  - Handle timezone conversions

## Edge Cases

### Template Transitions
- When a new template is created, it's valid from its date forward
- Previous template remains valid for past occurrences
- No overlap between templates

### Cancellations
- Can cancel individual occurrences
- Can cancel all future occurrences from a date
- Cancelled occurrences don't affect template events

### Rescheduling
- Can reschedule individual occurrences
- Can reschedule all future occurrences
- Rescheduling doesn't create new templates unless properties are also changed

## Event Series Association Feature

### Overview
The event series association feature allows users to link an existing event with an event series as a one-off occurrence. This enables events to be part of a series without following its recurrence pattern, providing flexibility in managing event series and their exceptions.

### API Endpoint
```typescript
POST /api/event-series/{seriesSlug}/associate-event/{eventSlug}
```

### Implementation Details

#### Key Components
1. **Controller Layer**
   - `EventSeriesController` handles the association request
   - Validates user permissions and request parameters
   - Returns appropriate HTTP status codes and responses

2. **Service Layer**
   - `EventSeriesService` implements the association logic
   - Validates series and event existence
   - Checks for existing series associations
   - Verifies user permissions for both event and series
   - Updates event with series information

3. **Data Model**
   - `EventEntity` includes fields for series association:
     - `seriesId`: Foreign key to the event series
     - `seriesSlug`: Reference to the series slug
   - `UpdateEventDto` supports series fields for updates

#### Security Considerations
- User must have permission to edit both the event and the series
- Event must not already be part of another series
- Series and event must exist in the same tenant

#### Error Handling
- `404 Not Found`: Series or event not found
- `400 Bad Request`: Event already part of another series
- `401 Unauthorized`: User lacks permission to perform the action

### Usage Example
```typescript
// Associate an event with a series
POST /api/event-series/weekly-team-meeting/associate-event/special-guest-lecture
```

This associates the event "special-guest-lecture" with the series "weekly-team-meeting" as a one-off occurrence.

### Future Considerations
1. **Series Management**
   - Add ability to remove events from series
   - Support for bulk association of events
   - Enhanced series exception handling

2. **UI Integration**
   - Series management interface
   - Event association workflow
   - Series exception visualization

3. **Performance**
   - Optimize series queries
   - Implement caching for series data
   - Batch processing for bulk operations

## Future Considerations

### Template History
- Consider tracking template history for auditing
- Allow viewing which template was used for each occurrence

### Template Inheritance
- Consider allowing templates to inherit from previous templates
- Only specify changed properties in new templates

### Template Validation
- Ensure templates have all required properties
- Validate template dates against recurrence pattern
- Prevent invalid template transitions 

## Action Plan (Post E2E Test Failures - 2025-04-05)

Several issues were identified during E2E testing that need investigation:

- **Timeouts in Setup Hooks:** Multiple test suites (`guards`, `event-attendees`, `event-recommendations`) are timing out in `beforeAll`/`beforeEach`. This suggests slow setup operations (DB seeding, API calls) or potentially hanging processes that need optimization or fixing.
- **Occurrence Materialization Failures (400 Bad Request):** Tests in `event-series.e2e-spec.ts` frequently fail with a 400 error when attempting to fetch a specific occurrence by date (`GET /api/event-series/:slug/:occurrenceDate`). This likely points to persistent issues in the date/time validation logic within `EventSeriesOccurrenceService` or `RecurrencePatternService`, possibly related to timezone handling or exact time matching, especially after series updates or for future occurrences.
- **Timezone/DST Specific Failures:** The `timezone-handling.e2e-spec.ts` suite shows specific errors (404, 422) when creating series or events around DST transitions. This requires a focused investigation into how dates near DST changes are handled during creation and recurrence generation.
- **Incorrect Occurrence Count:** The `event-series.e2e-spec.ts` test `should create an event series and get its occurrences` fails because it receives 10 occurrences when expecting <= 5. The `/occurrences` endpoint might not be correctly limiting the count based on the `count` parameter or test setup, defaulting to 10.
- **Event Linking on Promotion:** As noted previously, the original event is not reliably updated with `seriesId`/`seriesSlug` when promoted using `POST /api/event-series/create-from-event/:eventSlug`. 

## UI Improvements Action Plan (2025-04-06)

Several UI issues with the EventSeriesPage have been identified that need to be addressed:

### 1. Event Deletion Behavior Fix

- **Issue:** When deleting a single event from a series, the code is incorrectly deleting all occurrences in the series
- **Resolution Status:** ✅ Fixed in the backend by modifying `EventManagementService.remove()` to only delete the specific event and update the series exceptions
- **Changes Made:**
  - Removed code that was deleting all series occurrences
  - Added code to mark the deleted date as an exception in the series' `recurrenceExceptions` array
  - Ensured proper access to `EventSeriesEntity` by adding necessary imports
- **Verification:** The fix should be tested by creating a series, materializing multiple occurrences, and verifying that deleting one occurrence doesn't affect others

### 2. Template Event Section Improvements

- **Issue:** Template event section in the EventSeriesPage doesn't display the recurrence rule in plain English next to the date
- **Action Plan:**
  - Add recurrence description in human-readable format next to the template event date
  - Use the `recurrenceDescription` field that's already available in the API response
  - Example implementation:
    ```html
    <div class="template-event-section">
      <h3>Template Event</h3>
      <div class="event-date-time">{{formatDateTime(templateEvent.startDate)}}</div>
      <div class="recurrence-pattern">{{eventSeries.recurrenceDescription}}</div>
      <!-- Other template event details -->
    </div>
    ```

### 3. Recurrence Rule Update Issues

- **Issue:** When changing the recurrence rule for an event series, the list of occurrences doesn't update properly
- **Action Plan:**
  - After updating the series with a new recurrence rule, immediately refresh the occurrences list
  - Ensure both materialized and non-materialized events are displayed in the timeline
  - Implementation steps:
    1. After successful series update API call, immediately call the occurrences endpoint
    2. Update the occurrences list with the fresh data
    3. Mark materialized (existing DB events) vs calculated future occurrences differently in the UI
    ```typescript
    // Example implementation
    async updateSeriesAndRefresh(series, updates) {
      await updateEventSeries(series.slug, updates);
      // Immediately refresh occurrences after update
      this.occurrences = await getSeriesOccurrences(series.slug, { 
        includePast: this.includePastEvents,
        count: 20 
      });
      this.refreshTimeline();
    }
    ```

### 4. Visualization Improvements

- **Issue:** It's difficult to distinguish between materialized and non-materialized events in the timeline
- **Action Plan:**
  - Use visual cues to distinguish different types of events:
    - Materialized events (solid styling)
    - Non-materialized future events (lighter/dashed styling)
    - Template events (highlighted/bordered)
    - Deleted/exception dates (strike-through or red indicator)
  - Add tooltips explaining the event's status in the series
  - Include indicators for edited one-off occurrences
  - Example styles:
    ```css
    .event-occurrence {
      /* Base styles */
    }
    .event-occurrence.materialized {
      border: 2px solid var(--primary-color);
      opacity: 1;
    }
    .event-occurrence.non-materialized {
      border: 2px dashed var(--primary-color);
      opacity: 0.8;
    }
    .event-occurrence.template {
      background-color: rgba(var(--primary-rgb), 0.1);
      border-width: 3px;
    }
    .event-occurrence.exception {
      text-decoration: line-through;
      opacity: 0.6;
    }
    ```

### 5. Edit Rights Clarification

- **Issue:** Edit button on event series page is only visible to people with rights to edit the template event, but this isn't clear to users
- **Action Plan:**
  - Add clear permission indicators in the UI to show what actions a user can take
  - If a user doesn't have edit rights, show an explanatory message
  - Consider separating "view series" and "edit series" permissions for more granular control

### 6. Testing Requirements

- Create comprehensive test cases for all these scenarios:
  - Creating a new series and verifying all occurrences are displayed correctly
  - Editing a single occurrence and verifying other occurrences aren't affected
  - Deleting a single occurrence and verifying it's marked as an exception without affecting other events
  - Updating a recurrence rule and verifying the occurrences list updates correctly
  - Verifying permissions are properly respected for different user roles

### Implementation Timeline

- **Phase 1** (1-2 days): 
  - ✅ Fix backend deletion behavior
  - Add recurrence description to template event section
  - Implement immediate refresh after recurrence rule changes
  
- **Phase 2** (2-3 days):
  - Add visual differentiation between event types
  - Improve permission indicators
  - Add tooltips/helper text
  
- **Phase 3** (1-2 days):
  - Comprehensive testing across all scenarios
  - Documentation updates for series management
  - UI/UX polish

## Technical Details and Design Observations

### Database Design

The recurring events system underwent a significant redesign with migration `1743371499235-RedesignRecurringEvents`, which:

1. Created a separate `eventSeries` table to store recurrence information
2. Added `seriesId` and `seriesSlug` to events for associating events with their series
3. Moved recurrence fields (`recurrenceRule`, `recurrenceExceptions`) from events to the series
4. Added RFC 5545/7986 calendar properties to events (securityClass, priority, etc.)
5. Removed the `materialized` column in favor of a more sophisticated relationship model
6. Added bidirectional foreign keys between events and series tables

This design fundamentally separates the concerns of:
- Series metadata and recurrence pattern (in the eventSeries table)
- Individual event properties (in the events table)

### Design Choices and Tradeoffs

1. **Dual Reference with ID and Slug**
   - Events reference their series with both `seriesId` (numeric) and `seriesSlug` (human-readable)
   - Pros: Makes URLs and APIs more user-friendly, allows for easy external linking
   - Cons: Requires maintaining consistency between both reference types, adds complexity to queries
   - Decision Notes: This dual approach was chosen to support frontend routing with slugs while maintaining efficient database relations with IDs

2. **Template Event Pattern**
   - Series stores a reference to a template event using `templateEventSlug`
   - The template serves as the source of truth for properties of future occurrences
   - Makes a clear distinction between the "pattern" (series) and the "template" (reference event)
   - Enables "this and all future occurrences" updates by changing templates

3. **Exceptions vs. Deletion Approach**
   - When deleting a single occurrence, the date is added to `recurrenceExceptions` array in the series
   - The event is permanently deleted from the database
   - This means "deleted" events cannot be restored without re-materializing them
   - Alternative considered but not implemented: Soft deletion that preserves the event record

4. **Lazy Materialization**
   - Events are only created in the database ("materialized") when explicitly requested
   - This reduces database size by not pre-creating all possible occurrences
   - Tradeoff: Requires additional computation and API calls when viewing future occurrences

5. **Cascading Deletion Behavior**
   - Series deletion automatically cascades to all related events
   - Single event deletion does not affect the series or other events
   - Supports both "delete just this occurrence" and "delete entire series" operations

### Known Issues and Challenges

1. **Event Deletion Bug**
   - **Issue:** Prior to the fix on 2025-04-06, deleting a single event would erroneously delete all occurrences in a series
   - **Root Cause:** The `remove()` method in `EventManagementService` had code that explicitly found and deleted all related occurrences
   - **Fix Applied:** Modified to only delete the specific event and update exceptions list in the series
   - **Lesson:** Series-event relationship management requires careful handling of cascading operations

2. **Timezone Complications**
   - Recurrence generation respects timezone but Date objects lose timezone info
   - Integration with the iCalendar format requires special handling for timezone-aware dates
   - DST transitions can cause occurrences to appear at different clock times
   - Current approach: Store UTC dates in the database but preserve local time pattern when generating occurrences

3. **Template Event Updates**
   - When a series' recurrence rule changes, template events need to be reapplied
   - The system doesn't automatically regenerate the visual list of occurrences in the UI
   - The backend supports this by clearing and regenerating occurrences for major pattern changes

4. **Update Propagation Complexity**
   - Multiple code paths for updating series/events lead to potential inconsistencies
   - `updateFutureOccurrences` method handles the "this and all future occurrences" case
   - Single occurrence updates modify just that event
   - Series updates may affect template properties but not materialized occurrences

5. **Circular Dependencies**
   - The code has several circular dependencies between services (e.g., EventManagementService ↔ EventSeriesService)
   - These are handled with `forwardRef()` but make the code harder to understand and test
   - Future refactoring should consider a more hierarchical service architecture

### Implementation Patterns and Best Practices

1. **EventSeriesOccurrenceService as a Facade**
   - This service coordinates between event management and series management
   - Provides a single point of entry for occurrence-related operations
   - Handles materialization, listing, and date calculation in one place

2. **Proper Exception Handling**
   - Operations that might fail (materialization, date calculations) are wrapped in try/catch
   - Specific error types (NotFoundException, BadRequestException) for different failure modes
   - Detailed error logging with context information

3. **Graceful Degradation**
   - When template events are missing, the system attempts to recover by:
     - Finding the most recent event in the series to use as a template
     - Creating a minimal default template if no events exist
     - Materializing placeholder events based on available information

4. **iCalendar Integration**
   - Full support for iCalendar format (RFC 5545/7986)
   - Proper handling of recurrence rules and exceptions
   - Conversion of internal recurrence rule format to RRULE strings

5. **Date Formatting Consistency**
   - Dates stored as ISO strings in the database
   - Timezone conversions performed at the edges (API in/out)
   - Consistent use of date-fns-tz for timezone operations