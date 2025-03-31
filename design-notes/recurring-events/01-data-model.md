# Recurring Events: Data Model Design

This document outlines the database schema changes required to support recurring events with timezone information in OpenMeet.

## ✅ Database Schema Implementation Status

The database schema, entity changes, and migration for recurring events has been successfully implemented:

- Event entity has been updated with all necessary fields
- Migration has been created and applied
- DTOs have been updated to support recurring events
- Base recurrence functionality is working

## Current Event Model Structure

The event model now includes the following key fields for recurring events:

### Recurrence Fields
- `timeZone`: Stores the timezone identifier (e.g., "America/New_York")
- `recurrenceRule`: JSONB field storing the RFC 5545 recurrence rule 
- `recurrenceExceptions`: Array of dates excluded from the recurrence pattern
- `recurrenceUntil`: End date for the recurrence
- `recurrenceCount`: Number of occurrences
- `isRecurring`: Flag indicating if this is a recurring event
- `parentEventId`: For occurrences, references the parent event
- `isRecurrenceException`: Flag for modified occurrences
- `originalDate`: For exceptions, stores the original occurrence date

### Additional RFC 5545/7986 Properties
- `securityClass`: Event classification (PUBLIC, PRIVATE, CONFIDENTIAL)
- `priority`: Event priority (0-9)
- `blocksTime`: Whether the event blocks time on a calendar (TRANSP property)
- `isAllDay`: Flag for all-day events
- `resources`: Resources needed for the event
- `color`: Event color
- `conferenceData`: Conference connection information

## Parent vs. Occurrence Event Model

Our implementation distinguishes between different types of events:

### Parent (Pattern) Events
- `isRecurring = true` 
- `parentEventId = null`
- `recurrenceRule` contains the recurrence pattern
- `startDate` represents the first occurrence date

### Occurrence Events
- `parentEventId` points to the parent event
- `originalDate` stores the date of this occurrence 
- Inherits properties from the parent event

### Exception Occurrences
- `isRecurrenceException = true`
- Contains modified properties that differ from the pattern

## Timezone Handling Implementation

Our implementation of timezone handling follows these principles:

1. **Storage in UTC, Display in Local Time**: 
   - All event dates (`startDate`, `endDate`, etc.) are stored in UTC in the database
   - The original timezone is preserved in the `timeZone` field of each event
   - This allows consistent storage while preserving the user's intent

2. **Recurrence Calculations in Original Timezone**:
   - When generating occurrences, the RecurrenceService:
     - Takes the original start date (in UTC)
     - Converts it to the specified timezone using `toZonedTime` from date-fns-tz
     - Applies recurrence rules in that timezone context
     - Converts resulting dates back to UTC for storage
   - This ensures that "daily at 9 AM" in Eastern Time always means 9 AM Eastern Time, regardless of UTC offset or DST changes

3. **Handling DST Transitions**:
   - The implementation correctly handles Daylight Saving Time transitions
   - Events recur at the same local time, even when crossing DST boundaries
   - For example, a daily 9 AM Eastern Time event will occur at 9 AM EDT during summer and 9 AM EST during winter

4. **Timezone Conversion for APIs**:
   - The RecurrenceService provides methods to convert dates between timezones
   - This ensures consistent user experience regardless of the user's timezone

5. **Preserving Original Time Intent**:
   - By storing both UTC times and the original timezone, we preserve the user's original intent
   - This is crucial for recurring events where the specific local time is important

## Recurrence Rule Format

The `recurrenceRule` field follows the iCalendar RFC 5545 format, stored as a JSON object:

```json
{
  "freq": "WEEKLY",
  "interval": 2,
  "count": 10,
  "byday": ["MO", "WE", "FR"],
  "wkst": "MO"
}
```

## Implementation Status

✅ Database schema changes  
✅ Entity model updates  
✅ DTO updates  
✅ Migration  
✅ Timezone handling implementation  
✅ Basic recurrence functionality