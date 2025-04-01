# EventSeries Integration Architecture

This document outlines the implementation details and architectural decisions for integrating the new EventSeries model with existing OpenMeet services.

## Overview

The EventSeries model is a significant improvement over the legacy recurrence approach that used a parent-child relationship between events. Instead, the new model:

1. Uses a dedicated `EventSeries` entity to store the template and recurrence pattern
2. Creates individual `Event` entities as materialized occurrences when needed
3. Maintains a relationship between the series and its occurrences via a `seriesId` reference
4. Supports the concept of modified occurrences with the `isModifiedOccurrence` flag

## Integration with EventManagementService

The EventManagementService is a key component for integrating with EventSeries as it handles CRUD operations for events. We've enhanced it to work with the new EventSeries model by adding:

### 1. Methods for Creating Series Occurrences

- `createSeriesOccurrence`: Creates an event as part of a series (internal, ID-based)
- `createSeriesOccurrenceBySlug`: Creates an event as part of a series using a slug (user-facing)

These methods:
- Create the event using existing event creation logic
- Link the event to its parent series via the `seriesId` field
- Set additional metadata like `isModifiedOccurrence` and `materializedDate`

### 2. Methods for Finding Series Occurrences

- `findEventsBySeriesId`: Retrieves all materialized events for a series by its ID (internal)
- `findEventsBySeriesSlug`: Retrieves all materialized events for a series by its slug (user-facing)

### 3. Methods for Updating Series Occurrences

- `updateSeriesOccurrence`: Updates an event that's part of a series
- Optionally marks the event as a modified occurrence to exclude it from series-wide changes

## Integration with EventSeriesOccurrenceService

The EventSeriesOccurrenceService acts as the bridge between series templates and actual event occurrences:

1. `getUpcomingOccurrences`: Calculates upcoming occurrences based on the recurrence rule
2. `materializeOccurrence`: Creates a concrete event entity for a specific occurrence date
3. `getOrCreateOccurrence`: Retrieves an existing materialized occurrence or creates it if needed
4. `getSeries`: Helper method that retrieves a series by its slug

## Circular Dependency Handling

Since EventSeries and Event entities reference each other, we've implemented proper circular dependency handling:

1. Used the `forwardRef` function in NestJS to handle circular dependencies between services
2. Used dynamic imports for entity references to avoid TypeScript circular reference issues
3. Added proper type annotations and JSDoc comments to clarify the intended use of methods

## Slug-Based vs. ID-Based Methods

Following OpenMeet's best practices, we've:

1. Created slug-based versions of key methods for user-facing code
2. Documented ID-based methods as internal with `@internal` JSDoc tags
3. Added clear JSDoc comments to indicate which methods are preferred for user-facing code
4. Updated tests to demonstrate and verify both variants

## Testing

We've added comprehensive tests for the new functionality:

1. Unit tests for EventSeriesService and its methods
2. Tests for the integration between EventManagementService and EventSeries
3. Tests for circular dependency resolution
4. Tests for both slug-based and ID-based method variants

## Next Steps

1. **Enhancement of EventSeriesOccurrenceService**
   - Add more advanced occurrence generation with better timezone handling
   - Implement efficient caching strategies for frequently accessed occurrences
   - Add support for exclusion dates and exception handling

2. **Integration with Matrix Chat**
   - Add support for series-wide chat rooms
   - Link occurrences to the series chat room

3. **ATProtocol Integration**
   - Implement Bluesky integration for recurring events
   - Handle the limitations of Bluesky's event model for recurrence

4. **Frontend Integration**
   - Create UI components for series management
   - Implement calendar visualization with recurring event support