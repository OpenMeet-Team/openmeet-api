# Recurrence to EventSeries Migration Plan

## Current Status

We've begun migrating from the old recurrence model to the new EventSeries model. The EventSeries functionality provides better support for recurring events with timezone handling and ATProtocol integration.

## Migration Challenges

During the initial attempt to remove the RecurrenceModule, we discovered several dependencies that need to be addressed:

1. EventQueryService depends on RecurrenceService for generating recurrence descriptions
2. EventOccurrenceService has deep integration with RecurrenceService for generating and managing occurrences
3. Several tests depend on the RecurrenceService functionality

## Short-Term Recommended Approach

1. Keep the RecurrenceModule temporarily while migrating to EventSeries
2. Update the RecurrenceController to point users to the new EventSeries endpoints
3. Update documentation to guide users to the new API
4. Gradually update services to use the EventSeries functionality instead of RecurrenceService

## Components to Update

### EventQueryService
- Simple: Replace recurrence description generation with basic text formatter

### EventOccurrenceService
- Complex: Has deep integration with RecurrenceService
- Needs comprehensive replacement with EventSeries functionality

### RecurrenceController
- Add deprecation notices
- Direct users to EventSeries endpoints

## Timeline

1. Update documentation and API deprecation notices immediately
2. Complete migration to EventSeries in the next sprint
3. Remove RecurrenceModule entirely after successful transition