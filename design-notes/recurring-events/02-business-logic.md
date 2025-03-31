# Recurring Events: Business Logic Implementation

This document outlines the business logic implementation required to support recurring events in OpenMeet, including pattern modification and date exclusions in accordance with RFC 5545.

## ✅ Implementation Status

### Completed Components

We have successfully implemented the core services for recurring events:

- ✅ RecurrenceService - For generating occurrences and handling timezone conversions
- ✅ EventOccurrenceService - For managing event occurrences
- ✅ EventManagementService Integration - Updated to handle recurring events

### Pending Components

The following components are still pending implementation:

- ⏳ RecurrenceModificationService - For handling "this and future occurrences" modifications
- ⏳ EventQueryService Updates - For efficiently querying recurring events
- ⏳ API Endpoints - For recurrence operations
- ⏳ ATProtocol Integration - For exporting/importing recurrence information

## Core Services

### 1. RecurrenceService

Our implemented RecurrenceService provides the following functionality:

- Generating occurrence dates based on recurrence rules
- Checking if dates match recurrence patterns
- Converting dates between timezones
- Formatting dates in specific timezones
- Generating human-readable recurrence descriptions
- Handling timezone conversions and DST transitions

### 2. EventOccurrenceService

The EventOccurrenceService manages the actual event occurrences:

- Generating and persisting occurrences for a recurring event
- Getting occurrences for a specific date range
- Creating and managing exception occurrences
- Handling date exclusions (EXDATE implementation from RFC 5545)
- Deleting occurrences

### 3. EventManagementService

The EventManagementService has been extended to handle recurring events:

- Creating recurring events with recurrence patterns
- Updating recurring events and regenerating occurrences
- Deleting recurring events and their occurrences
- Creating exception occurrences for specific dates
- Excluding and including specific dates

## Recurrence Modification Handling

Our implementation supports:

- Modifying the entire recurrence series
- Modifying single occurrences as exceptions
- Excluding specific dates from the pattern
- Including previously excluded dates

Still pending is the implementation of:

- "Modify this and future occurrences" functionality (splitting a series)
- Handling conflicts when modifying recurrence patterns

## Timezone Handling

The implementation includes comprehensive timezone handling:

1. **Configuration**:
   - Default application timezone from config
   - Per-event timezone settings

2. **Date Storage**:
   - All dates stored in UTC in the database
   - Original timezone preserved with each event
   - Conversions done when needed

3. **Libraries**:
   - Using date-fns-tz for timezone handling
   - Using rrule.js for recurrence calculations

## Key Workflows

### Recurring Event Creation

1. User creates an event with a recurrence pattern
2. The recurrence pattern is stored with the parent event
3. Initial occurrences are generated asynchronously
4. Occurrences inherit properties from the parent

### Occurrence Modification

1. User selects a specific occurrence to modify
2. An exception occurrence is created
3. The exception is linked to the parent but contains modified properties
4. The original date is preserved for reference

### Date Exclusion

1. User excludes a specific date from the pattern
2. The date is added to the recurrenceExceptions array
3. Any existing occurrence for that date is deleted
4. The date is skipped in future occurrence generations

## Next Steps

1. Complete the RecurrenceModificationService for handling "this and future" changes
2. Update the EventQueryService for efficient recurring event queries
3. Add API endpoints for all recurrence operations
4. Implement ATProtocol integration strategy

## Implementation Details

### Recurrence Rule Format

```json
{
  "freq": "WEEKLY",
  "interval": 2,
  "count": 10,
  "byday": ["MO", "WE", "FR"],
  "wkst": "MO"
}
```

### Supported Recurrence Features

- Recurrence frequencies: DAILY, WEEKLY, MONTHLY, YEARLY
- Interval settings (every X days/weeks/months/years)
- Count or until end conditions
- Day of week selections (for weekly recurrence)
- Timezone-aware recurrence
- Date exclusions
- Exception occurrences