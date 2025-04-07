# EventSeries Component Testing Approach

## Overview

This document outlines the testing approach for the EventSeries module, which implements recurring events functionality using a hybrid materialization model.

## Testing Strategy

### Core Behavior Tests

The `event-series-core.spec.ts` file contains behavior-focused tests that verify the core functionality of the EventSeries services without being tightly coupled to implementation details. These tests:

- Focus on the essential behaviors (contracts) that each service should fulfill
- Avoid dependencies on TypeORM, NestJS DI, and circular references
- Use simple mock functions rather than full mock objects
- Test key scenarios in isolation

This approach allows us to validate that the fundamental logic is correct, even as implementation details evolve.

### Key Behaviors Tested

#### EventSeriesService

1. **Creating Series**: Should create an event series and its first occurrence
2. **Finding Series**: Should find series by slug with human-readable recurrence descriptions
3. **Permission Checking**: Should verify user permissions before updates

#### EventSeriesOccurrenceService

1. **Finding Occurrences**: Should find existing occurrences by date
2. **Materializing Occurrences**: Should create concrete event instances from the series template
3. **Validation**: Should reject invalid occurrence dates that don't match the recurrence pattern
4. **Occurrence Listing**: Should combine materialized and unmaterialized occurrences for calendar views

## Testing Improvements

As the implementation stabilizes, we should expand testing to include:

1. **Integration Tests**: Test the actual repositories and services working together
2. **E2E Tests**: Test the full API endpoints with HTTP requests
3. **Boundary Testing**: Test edge cases like DST transitions, different timezones, etc.
4. **Performance Testing**: Test with large series (many occurrences) to ensure scalability

## Testing Recurrence Logic

The recurrence logic is complex, especially around timezones and date generation. Consider additional dedicated tests for:

- DST transition handling
- Multi-year recurrences
- Complex recurrence rules (e.g., "last Monday of the month")
- Exclusion dates
- Date modifications

## Testing ATProtocol Integration

Once the ATProtocol integration is implemented, we should add tests specifically for:

- Syncing series with Bluesky (which doesn't natively support recurrence)
- Importing one-off events from Bluesky and detecting potential series