# Event Series Implementation Guide

This document provides a conceptual guide for implementing the Event Series functionality in OpenMeet.

## Data Model

### Core Entities

The implementation uses two primary entities:

1. **EventSeries Entity**
   - Contains metadata about the series (name, description, slug)
   - Stores the recurrence pattern (frequency, interval, byweekday, etc.)
   - Includes timezone information
   - References the user and optional group
   - Stores external references for ATProtocol integration
   - Tracks creation and update timestamps

2. **Event Entity** (extended with series fields)
   - References its parent series (seriesId foreign key)
   - Tracks the original occurrence date for recurrence calculation
   - Stores external references for ATProtocol integration

### RecurrenceRule Structure

The recurrence rule follows iCalendar RFC 5545 format with simplified properties:
- **frequency**: DAILY, WEEKLY, MONTHLY, YEARLY
- **interval**: How often the event repeats (e.g., every 2 weeks)
- **byweekday**: Array of days of the week (0-6, where 0 is Monday)
- **bymonthday**: Array of days of the month
- **bymonth**: Array of months
- **count**: Number of occurrences
- **until**: End date for recurrence

## Core Services

### EventSeriesService

Responsibilities:
- Creating new event series with a template event
- Generating initial occurrences based on the recurrence rule
- Retrieving occurrences for a given date range
- Updating series metadata and recurrence rules
- Propagating template changes to future occurrences
- Materializing specific occurrences on demand

Key operations:
1. **Series Creation**: Creates a series entity, a template event, and generates initial occurrences
2. **Occurrence Retrieval**: Combines materialized (database-stored) and virtual occurrences for display
3. **Series Update**: Updates properties and optionally regenerates future occurrences
4. **Occurrence Materialization**: Creates a concrete database record for a specific occurrence

### OccurrenceGeneratorService

Responsibilities:
- Generating occurrence dates using the RRule library
- Creating event entities for materialized occurrences
- Computing virtual occurrences for display
- Handling timezone conversions and DST transitions

Key operations:
1. **Initial Generation**: Creates occurrences for the first few months of a series
2. **Date Calculation**: Uses RRule to calculate occurrence dates based on the recurrence pattern
3. **Timezone Adjustment**: Ensures dates are correctly calculated in the series timezone
4. **Virtual Generation**: Creates temporary event objects for display without persisting them

## Controller Implementation

The EventSeriesController exposes these endpoints:

1. **Create Series**: `POST /event-series`
   - Accepts series metadata and recurrence rule
   - Creates the series and initial occurrences
   - Returns the created series

2. **Get Series**: `GET /event-series/:slug`
   - Returns series metadata and recurrence information

3. **Get Occurrences**: `GET /event-series/:slug/occurrences`
   - Accepts date range parameters
   - Returns both materialized and virtual occurrences
   - Supports pagination for large series

4. **Update Series**: `PUT /event-series/:slug`
   - Updates series metadata and/or recurrence rule
   - Optionally propagates changes to future occurrences
   - Supports updating from a specific date forward

5. **Delete Series**: `DELETE /event-series/:slug`
   - Removes the series and all its occurrences

6. **Materialize Occurrence**: `POST /event-series/:slug/occurrences/:date`
   - Creates a database record for a specific occurrence
   - Allows customizing the materialized occurrence

7. **Update Occurrence**: `PUT /event-series/:slug/occurrences/:date`
   - Updates a specific occurrence without affecting others
   - Materializes the occurrence if needed

## Materialization Strategy

The implementation uses a hybrid approach:

1. **Database Storage**:
   - Series entity with recurrence pattern
   - Limited number of materialized occurrences (stored as event records)
   - New occurrences added as needed

2. **Materialization Rules**:
   - Occurrences are materialized (created in the database) when:
     - A user edits a specific occurrence
     - Users attend or discuss an occurrence
     - The next event is needed for display
   - Changes to the series template affect all future unmaterialized occurrences
   - Modified occurrences are preserved during series updates

3. **Virtual Generation**:
   - For display purposes, non-materialized occurrences are generated on-the-fly
   - These virtual occurrences follow the current template
   - They are converted to real database records when interaction occurs

## Type Conversion Utilities

The implementation includes utilities for:
1. Converting between frontend and backend recurrence rule formats
2. Standardizing property names (e.g., using byweekday consistently)
3. Providing type-safe conversions with default values

## Testing Strategy

The implementation should be tested at multiple levels:

1. **Unit Tests**:
   - Recurrence rule calculation
   - Template propagation logic
   - Timezone conversion edge cases

2. **Integration Tests**:
   - Series creation with occurrences
   - Series update with propagation
   - Occurrence materialization

3. **E2E Tests**:
   - Complete user flows
   - Cross-timezone scenarios
   - ATProtocol integration