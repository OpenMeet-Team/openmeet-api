# Recurrence Modification Strategy

This document outlines the strategy for modifying recurring events in OpenMeet, specifically focusing on the "this and future occurrences" modification pattern which is a common requirement in calendar applications.

## Current Implementation

Our current implementation supports:

- ✅ Modifying the entire series (all occurrences)
- ✅ Modifying a single occurrence (creating an exception)
- ✅ Adding date exclusions (EXDATE in RFC 5545)

## This and Future Occurrences Modification

The most complex recurrence modification scenario is when a user wants to modify "this occurrence and all future occurrences." This effectively splits the recurrence pattern into two parts:

1. The original pattern up to but not including the selected occurrence
2. A new pattern starting from the selected occurrence with modified properties

### Handling Multiple Split Points

Our design supports making "this and future occurrences" modifications multiple times on the same series. This creates a chain of recurrence segments, each with its own properties and rules:

1. **Original Parent Series**: Contains the initial recurrence rule and properties
   
2. **Split Series Chain**: Multiple events with `recurrenceSplitPoint = true`
   - Each split point references the original parent via `parentEventId`
   - Each split point contains the `originalDate` marking when its segment begins
   - Each split point maintains its own modified properties and recurrence rules
   - The system forms a flat hierarchy rather than a nested chain

3. **Series Querying**: When displaying events, the system:
   - Identifies the original parent series
   - Finds all split points associated with that parent
   - Sorts them chronologically by `originalDate`
   - For any given date, determines which segment's rules and properties apply

This approach allows for unlimited modifications to future occurrences while maintaining a clear history of changes and ensuring each occurrence displays the correct properties based on its position in the timeline.

### Implementation Approach

We'll implement this using the following approach:

#### 1. Data Model Changes

A single database change is needed to implement this feature:

- Adding a new flag `recurrenceSplitPoint` to the `events` table - Boolean field to identify where a series was split

The migration for this change will be minimal:

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRecurrenceSplitPointField1743XXXXXXX
  implements MigrationInterface
{
  name = 'AddRecurrenceSplitPointField1743XXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add recurrenceSplitPoint field to the events table
    await queryRunner.addColumn(
      `${schema}.events`,
      new TableColumn({
        name: 'recurrenceSplitPoint',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Create an index for efficient querying
    await queryRunner.query(`
      CREATE INDEX "IDX_events_recurrence_split_point" 
      ON "${schema}"."events" ("recurrenceSplitPoint")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_recurrence_split_point"
    `);

    // Drop column
    await queryRunner.dropColumn(`${schema}.events`, 'recurrenceSplitPoint');
  }
}
```

We'll also use the existing fields:
- `parentEventId` - To connect exceptions/splits to their parent
- `originalDate` - To track the original date of the modified occurrence
- `isRecurrenceException` - For identifying exceptions

This minimal change allows us to implement the complete "this and future occurrences" functionality while maintaining backward compatibility with existing code.

#### 2. Split Series Algorithm

1. When a user chooses to modify "this and future occurrences":
   - Create a new event as a copy of the parent event
   - Set properties according to the user's modifications
   - Set `parentEventId` to link to the original series
   - Set `originalDate` to the date of the occurrence being modified
   - Set `recurrenceSplitPoint` to true
   - Set `recurrenceRule` with a modified "until" value or adjust count

2. Modify the original parent event:
   - Update the `recurrenceRule` to end before the split date
   - Add a `recurrenceUntil` property if needed

3. Update occurrences:
   - Keep existing occurrences before the split date with the original parent
   - Generate new occurrences after the split date for the new series
   - Delete any previously generated occurrences after the split date that belonged to the original series

#### 4. Querying Multiple Split Points

To properly display events when multiple "this and future" modifications have been made:

```typescript
/**
 * Get the effective event for a specific date, considering all split points
 */
async getEffectiveEventForDate(
  parentEventId: number,
  date: string,
): Promise<EventEntity> {
  // Get the original parent event
  const parentEvent = await this.eventRepository.findOne({
    where: { id: parentEventId },
  });
  
  if (!parentEvent) {
    throw new NotFoundException('Parent event not found');
  }
  
  // Find all split points for this parent
  const splitPoints = await this.eventRepository.find({
    where: {
      parentEventId,
      recurrenceSplitPoint: true,
    },
    order: {
      originalDate: 'ASC', // Sort chronologically
    },
  });
  
  // If no split points, return the parent
  if (splitPoints.length === 0) {
    return parentEvent;
  }
  
  // Find the split point that applies to this date
  const dateObj = new Date(date);
  for (let i = splitPoints.length - 1; i >= 0; i--) {
    const splitPoint = splitPoints[i];
    if (new Date(splitPoint.originalDate) <= dateObj) {
      return splitPoint;
    }
  }
  
  // If no split point applies, return the parent
  return parentEvent;
}
```

This function handles the complexity of determining which event properties should apply to a given occurrence date, regardless of how many splits have occurred in the recurrence chain.

#### 3. RecurrenceModificationService

Create a new service to handle complex recurrence modifications:

```typescript
@Injectable()
export class RecurrenceModificationService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly recurrenceService: RecurrenceService,
    private readonly eventOccurrenceService: EventOccurrenceService,
  ) {}

  /**
   * Split a recurrence series at a specified date
   * Modifies the original series to end before the specified date
   * Creates a new series starting from the specified date with modified properties
   */
  async splitSeriesAt(
    event: EventEntity,
    splitDate: string,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // 1. Validate the split date is in the recurring pattern
    if (!this.recurrenceService.isDateInRecurrencePattern(
      splitDate, 
      event.startDate, 
      event.recurrenceRule,
      event.timeZone
    )) {
      throw new BadRequestException('Split date is not in the recurring pattern');
    }

    // 2. Modify the original event to end before the split date
    const originalRecurrenceRule = { ...event.recurrenceRule };
    originalRecurrenceRule.until = this.calculatePreviousOccurrence(
      splitDate,
      event.startDate,
      event.recurrenceRule,
      event.timeZone
    );
    
    await this.eventRepository.update(event.id, {
      recurrenceRule: originalRecurrenceRule,
    });

    // 3. Create a new event for future occurrences
    const newEvent = await this.createNewSeriesFrom(
      event,
      splitDate,
      modifications
    );

    // 4. Update occurrences
    await this.updateOccurrencesAfterSplit(event.id, newEvent.id, splitDate);

    return newEvent;
  }

  /**
   * Create a new series from the original, starting at the split date
   */
  private async createNewSeriesFrom(
    originalEvent: EventEntity,
    startFromDate: string,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Create a copy of the original event
    const newEventData = {
      ...this.getBasicEventProperties(originalEvent),
      ...modifications,
      parentEventId: originalEvent.id,
      originalDate: startFromDate,
      recurrenceSplitPoint: true,
      // Adjust the recurrence rule to start from the split date
      recurrenceRule: this.adjustRecurrenceRule(
        originalEvent.recurrenceRule,
        originalEvent.startDate,
        startFromDate
      ),
    };

    return this.eventRepository.create(newEventData);
  }

  /**
   * Adjust the recurrence rule for the new series
   */
  private adjustRecurrenceRule(
    originalRule: RecurrenceRule,
    originalStartDate: string,
    newStartDate: string,
  ): RecurrenceRule {
    const newRule = { ...originalRule };
    
    // If the original had a count, we need to adjust it
    if (newRule.count) {
      const remainingOccurrences = this.recurrenceService.countOccurrencesAfter(
        newStartDate,
        originalStartDate,
        originalRule
      );
      newRule.count = remainingOccurrences;
    }
    
    // Remove the until date if it exists, as the new series will have its own end date
    if (newRule.until) {
      newRule.until = undefined;
    }
    
    return newRule;
  }

  /**
   * Update occurrences after a series is split
   */
  private async updateOccurrencesAfterSplit(
    originalEventId: number,
    newEventId: number,
    splitDate: string,
  ): Promise<void> {
    // Delete the old occurrences that fall after the split date
    await this.eventOccurrenceService.deleteOccurrencesAfter(
      originalEventId,
      splitDate
    );
    
    // Generate new occurrences for the new series
    await this.eventOccurrenceService.generateInitialOccurrences(newEventId);
  }

  /**
   * Calculate the date of the last occurrence before the split date
   */
  private calculatePreviousOccurrence(
    splitDate: string,
    startDate: string,
    recurrenceRule: RecurrenceRule,
    timeZone?: string,
  ): string {
    const occurrences = this.recurrenceService.generateOccurrences(
      startDate,
      recurrenceRule,
      {
        timeZone,
        until: splitDate,
      }
    );
    
    // Get the last occurrence before the split date
    if (occurrences.length > 0) {
      const lastOccurrence = occurrences[occurrences.length - 1];
      // Return the day before to make it exclusive
      return new Date(lastOccurrence.getTime() - 86400000).toISOString();
    }
    
    return startDate;
  }

  /**
   * Extract basic properties from an event for copying
   */
  private getBasicEventProperties(event: EventEntity): Partial<EventEntity> {
    // Copy properties but exclude IDs, timestamps, and specific recurrence fields
    const { 
      id, createdAt, updatedAt, parentEventId, originalDate, 
      recurrenceSplitPoint, ...basicProps 
    } = event;
    
    return basicProps;
  }
}
```

## API Endpoints

Add API endpoints to support series modifications:

```typescript
@Controller('events')
export class EventController {
  constructor(
    private readonly recurrenceModificationService: RecurrenceModificationService,
  ) {}

  /**
   * Modify this and future occurrences
   */
  @Patch(':slug/occurrences/:date/future')
  @UseGuards(AuthGuard, EventOwnerGuard)
  async modifyThisAndFutureOccurrences(
    @Param('slug') slug: string,
    @Param('date') date: string,
    @Body() updateEventDto: UpdateEventDto,
  ): Promise<EventEntity> {
    const event = await this.eventService.findBySlug(slug);
    
    if (!event.isRecurring) {
      throw new BadRequestException('Event is not recurring');
    }
    
    return this.recurrenceModificationService.splitSeriesAt(
      event,
      date,
      updateEventDto,
    );
  }
}
```

## User Interface Integration

1. **Modify Occurrence Dialog**:
   - When a user selects an occurrence to modify, show options:
     - "Edit only this occurrence"
     - "Edit this and all future occurrences"
     - "Edit all occurrences"

2. **UI Representation**:
   - Series that have been split should be visually related in the UI
   - Future occurrences that belong to the new series should be rendered with the modified properties
   - Past occurrences that belong to the original series should maintain their original properties
   - For series with multiple split points, the UI should clearly indicate:
     - Which segment each occurrence belongs to
     - When properties change within a series timeline
     - A visual timeline showing all modification points

## Testing Scenarios

1. **Split Series Tests**:
   - Test splitting a weekly series at a specific date
   - Verify original series ends properly before the split date
   - Verify new series starts from the split date
   - Verify occurrences are assigned to the correct parent

2. **Edge Cases**:
   - Split at the first occurrence (should effectively replace the series)
   - Split at the last occurrence (should create a single exception)
   - Split a series that already has exceptions
   - Modify the frequency when splitting (e.g., from weekly to monthly)
   - Multiple split points - Test modifying "this and future occurrences" multiple times on the same series
   - Overlapping split points - What happens if splits occur on the same day
   - Split point coincides with an exception - How modifications to exceptions interact with split points

3. **Performance Testing**:
   - Test with long-running series (many occurrences)
   - Measure database operation count
   - Test concurrent modifications

## Implementation Timeline

1. Week 1: Implement RecurrenceModificationService
2. Week 2: Add API endpoints and test backend functionality
3. Week 3: Integrate with frontend and update UI
4. Week 4: Testing and bug fixes

## Open Questions and Considerations

1. **Recurring Attendees**:
   - How should attendees be handled when a series is split?
   - Should attendees be copied to the new series?
   - Should attendees be notified of the modification?

2. **Notifications**:
   - What notifications should be sent when a series is split?
   - Should all attendees be notified or only those affected by future occurrences?

3. **Performance**:
   - How can we optimize occurrence generation for series with many occurrences?
   - Should we lazily generate occurrences for the new series?

4. **Sync with External Calendars**:
   - How should split series be represented in iCalendar exports?
   - How should we handle importing split series from external calendars?

5. **UI/UX Considerations**:
   - How to make it clear to users what "this and future occurrences" means?
   - How to visually represent related series in the calendar view?