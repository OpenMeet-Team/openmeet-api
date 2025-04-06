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