# Recurring Events: Business Logic Implementation

This document outlines the business logic implementation required to support recurring events in OpenMeet, including pattern modification and date exclusions in accordance with RFC 5545.

## Handling Recurrence Modifications

### Modifying Recurrence Patterns

When modifying a recurring event, we must support three key modification scenarios:

1. **Modify entire series** - Updates the pattern event and regenerates all occurrences
2. **Modify single occurrence** - Creates/updates an exception occurrence
3. **Modify this and future occurrences** - Splits the series into two different patterns

### Handling Date Exclusions (EXDATE)

Following RFC 5545, we'll implement date exclusions using:

1. **Exclude dates** - Stored in `recurrenceExceptions` array on the parent event
2. **Include previously excluded dates** - Removing dates from the exceptions list
3. **Exception occurrences** - Special instances that override the pattern for a specific date

## Core Services

### 1. RecurrenceService

We'll create a new service to handle recurrence calculations:

```typescript
// src/event/application/recurrence/recurrence.service.ts

@Injectable()
export class RecurrenceService {
  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate occurrence dates based on a recurrence rule
   */
  generateOccurrences(
    startDate: Date,
    recurrenceRule: Record<string, any>,
    timeZone: string,
    until?: Date,
    count?: number,
    exceptions?: string[],
  ): Date[] {
    // Use a library like rrule.js to generate occurrences
    // Consider timezone when generating dates
    // Filter out exceptions
  }

  /**
   * Check if a date matches a recurrence rule
   */
  isDateInRecurrencePattern(
    date: Date,
    startDate: Date,
    recurrenceRule: Record<string, any>,
    timeZone: string,
    exceptions?: string[],
  ): boolean {
    // Check if a specific date is part of the recurrence pattern
  }

  /**
   * Convert a date between timezones
   */
  convertDateBetweenTimezones(
    date: Date,
    fromTimeZone: string,
    toTimeZone: string,
  ): Date {
    // Convert date between timezones using a library like date-fns-tz
  }

  /**
   * Format a date in a specific timezone
   */
  formatDateInTimeZone(
    date: Date,
    timeZone: string,
    format = 'yyyy-MM-dd HH:mm:ss',
  ): string {
    // Format date in the specified timezone
  }
}
```

### 2. EventOccurrenceService

We'll create a new service to manage event occurrences:

```typescript
// src/event/application/event-occurrence.service.ts

@Injectable()
export class EventOccurrenceService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly recurrenceService: RecurrenceService,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate and persist occurrences for a recurring event
   */
  async generateEventOccurrences(eventId: number, windowDays = 90): Promise<void> {
    // Retrieve the parent event
    // Generate occurrences for the window period
    // Create event records for each occurrence
    // Handle existing occurrences that might need updating
  }

  /**
   * Get all occurrences for an event (both stored and calculated)
   */
  async getEventOccurrences(
    eventId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<EventEntity[]> {
    // Get parent event
    // Get existing occurrence records
    // Calculate occurrences beyond stored ones if needed
    // Return combined set
  }

  /**
   * Modify a specific occurrence of a recurring event
   */
  async modifyOccurrence(
    parentEventId: number,
    date: Date,
    updates: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Create or update an exception occurrence
    // Mark it as an exception
    // Store original date for reference
  }

  /**
   * Delete a specific occurrence of a recurring event
   */
  async deleteOccurrence(
    parentEventId: number,
    date: Date,
  ): Promise<void> {
    // Add the date to recurrenceExceptions of the parent event
    // Delete the occurrence record if it exists
  }
  
  /**
   * Exclude a specific date from a recurring event (implements RFC 5545 EXDATE)
   */
  async excludeDate(
    parentEventId: number,
    date: Date,
  ): Promise<void> {
    // Add date to recurrenceExceptions array
    // Delete occurrence instance if it exists
  }
  
  /**
   * Include a previously excluded date in a recurring event (remove from EXDATE)
   */
  async includeDate(
    parentEventId: number,
    date: Date,
  ): Promise<void> {
    // Remove date from recurrenceExceptions array
    // Generate occurrence instance if in window
  }
}

/**
 * Service for handling recurrence pattern modifications
 */
@Injectable()
export class RecurrenceModificationService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly eventOccurrenceService: EventOccurrenceService,
  ) {}
  
  /**
   * Modify the entire series (all occurrences)
   */
  async modifyEntireSeries(
    eventId: number,
    updates: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Update parent event recurrence pattern
    // Regenerate all future occurrences based on new pattern
    // Preserve exceptions
  }
  
  /**
   * Modify a single occurrence only
   */
  async modifySingleOccurrence(
    eventId: number,
    occurrenceDate: Date,
    updates: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Create or update exception occurrence for the specific date
    // Mark as isRecurrenceException = true
  }
  
  /**
   * Modify this and all future occurrences (split the series)
   */
  async modifyThisAndFutureOccurrences(
    eventId: number,
    occurrenceDate: Date,
    updates: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Create new parent event with updated pattern starting from split date
    // Modify original event pattern to end before split date
    // Generate occurrences for new pattern
  }
}
```

### 3. Updates to EventManagementService

We'll extend the existing EventManagementService:

```typescript
// src/event/application/event-management.service.ts

@Injectable()
export class EventManagementService {
  constructor(
    // Existing dependencies...
    private readonly recurrenceService: RecurrenceService,
    private readonly eventOccurrenceService: EventOccurrenceService,
  ) {}

  /**
   * Create an event (existing method with updates)
   */
  async createEvent(createEventDto: CreateEventDto, user: UserEntity): Promise<EventEntity> {
    // Existing logic...

    // If recurrence rule is provided
    if (createEventDto.recurrenceRule) {
      event.isRecurring = true;
      event.recurrenceRule = createEventDto.recurrenceRule;
      event.recurrenceExceptions = createEventDto.recurrenceExceptions || [];
      event.recurrenceUntil = createEventDto.recurrenceUntil ? new Date(createEventDto.recurrenceUntil) : null;
      event.recurrenceCount = createEventDto.recurrenceCount;
      event.timeZone = createEventDto.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Save the parent event
      const savedEvent = await this.eventRepository.save(event);

      // Generate initial occurrences
      await this.eventOccurrenceService.generateEventOccurrences(savedEvent.id);

      return savedEvent;
    }

    // Existing logic for non-recurring events...
  }

  /**
   * Update an event (existing method with updates)
   */
  async updateEvent(eventId: string, updateEventDto: UpdateEventDto, user: UserEntity): Promise<EventEntity> {
    // Existing logic...

    // If updating a recurring event
    if (event.isRecurring) {
      // Update recurrence rule if provided
      if (updateEventDto.recurrenceRule) {
        event.recurrenceRule = updateEventDto.recurrenceRule;
      }

      // Other recurrence field updates...

      // Save the parent event
      const savedEvent = await this.eventRepository.save(event);

      // Regenerate occurrences
      await this.eventOccurrenceService.generateEventOccurrences(savedEvent.id);

      return savedEvent;
    }

    // Existing logic for non-recurring events...
  }

  /**
   * Delete an event (existing method with updates)
   */
  async deleteEvent(eventId: string, user: UserEntity): Promise<void> {
    // Existing logic...

    // If deleting a recurring event, also delete all occurrences
    if (event.isRecurring) {
      await this.eventRepository.delete({ parentEventId: event.id });
    }

    // Existing deletion logic...
  }
  
  /**
   * Update an entire series of recurring events
   */
  async updateEventSeries(
    eventId: string,
    updateEventDto: UpdateEventDto,
    user: UserEntity,
  ): Promise<EventEntity> {
    // Similar to updateEvent but affects all future occurrences
  }
  
  /**
   * Update a single occurrence of a recurring event
   */
  async updateEventOccurrence(
    eventId: string,
    date: string,
    updateEventDto: UpdateEventDto,
    user: UserEntity,
  ): Promise<EventEntity> {
    // Create or update an exception occurrence
  }
}
```

### 4. Updates to EventQueryService

```typescript
// src/event/application/event-query.service.ts

@Injectable()
export class EventQueryService {
  constructor(
    // Existing dependencies...
    private readonly recurrenceService: RecurrenceService,
    private readonly eventOccurrenceService: EventOccurrenceService,
  ) {}

  /**
   * Get all events (existing method with updates)
   */
  async getEvents(
    queryParams: EventQueryParams,
    user?: UserEntity,
  ): Promise<Pagination<EventEntity>> {
    // Existing logic...

    // Handle recurring events
    if (queryParams.includeRecurring !== false) {
      // If expandRecurring is true, include all occurrences
      if (queryParams.expandRecurring) {
        // Get recurring event occurrences within the date range
        // Combine with regular events
        // Apply pagination
      } else {
        // Just include the parent recurring events
      }
    }

    // Return paginated results
  }

  /**
   * Get events by date range (new method)
   */
  async getEventsByDateRange(
    startDate: Date,
    endDate: Date,
    user?: UserEntity,
  ): Promise<EventEntity[]> {
    // Get non-recurring events in the date range
    // Get recurring events that might have occurrences in the range
    // Generate occurrences within the range
    // Combine and return
  }

  /**
   * Get a specific occurrence of a recurring event
   */
  async getEventOccurrence(
    eventId: string,
    date: string,
    user?: UserEntity,
  ): Promise<EventEntity> {
    // Get the parent event
    // Check if there's an exception occurrence for this date
    // If not, calculate the occurrence based on the recurrence rule
  }
}
```

## Timezone Handling Implementation

We'll implement comprehensive timezone handling:

1. **Configuration**:
   - Store the default application timezone in the config
   - Allow users to set their preferred timezone in profiles

2. **Date Storage**:
   - Store all dates in UTC in the database
   - Store the timezone associated with each event
   - Convert between timezones when needed

3. **Libraries**:
   - Use date-fns-tz or luxon for timezone handling
   - Use rrule.js for recurrence calculations

## ATProtocol Integration Strategy

Until the ATProtocol lexicon supports recurrence:

1. **Exporting to Bluesky**:
   - Export only the next occurrence of recurring events
   - Include recurrence information in the description
   - Use a custom tag in sourceData to mark it as recurring

2. **Importing from Bluesky**:
   - Import as non-recurring events for now
   - When lexicon support is added, update the importer

## Next Steps

1. Implement the RecurrenceService with the necessary libraries
2. Update the EventEntity and related DTOs
3. Create migration for the schema changes
4. Implement the EventOccurrenceService
5. Update the EventManagementService and EventQueryService
6. Add timezone handling throughout the application