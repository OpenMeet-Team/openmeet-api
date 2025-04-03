# Unified Recurring Events Implementation

## Status Update (April 2025)

We have successfully migrated to the EventSeries model for handling recurring events, replacing the old recurrence implementation. This document outlines the current state and next steps.

## Current Implementation

The EventSeries implementation provides:
- Complete CRUD operations for managing series of events
- Proper timezone support
- Support for BlueS`ky ATProtocol integration
- Compatible with iCalendar standards
- More maintainable entity relationships

### Implementation Change (April 3, 2025)

We have removed the `materialized` column from the database schema. This property was originally intended to track which events were materialized occurrences vs. regular events, but we found it caused compatibility issues with existing database schemas. We've updated the code to treat any event with a `seriesId` reference as part of a series, and any event that exists in the database as already materialized by definition.

The API still maintains the same contracts by keeping the `materialized` property in responses for compatibility, but this is now computed based on whether an occurrence has an actual database record rather than being stored in the database.

## Completed Changes

- ✅ Implemented EventSeries entity and related functionality
- ✅ Created EventSeriesController with comprehensive endpoints
- ✅ Removed RecurrenceModule from app.module.ts
- ✅ Updated EventQueryService to not depend on RecurrenceService
- ✅ Added deprecation notices to the old RecurrenceController
- ✅ Modified EventOccurrenceService to use EventSeriesOccurrenceService
- ✅ Updated tests to support both legacy and new implementations
- ✅ Implemented backward compatibility to ensure smooth transition
- ✅ Removed dependency on the `materialized` column to improve database compatibility

## Remaining Tasks

- Create database migration scripts to convert old recurring events to EventSeries
- Communicate API changes to clients and guide migration to new endpoints
- Complete documentation for the EventSeries API
- Plan for complete removal of RecurrenceService after client migration
- Eventually remove the old recurrence code entirely

## Implementation Notes

### EventSeries Design

The EventSeries model provides a more flexible and maintainable way to handle recurring events:

1. **Entity Relationships**:
   - EventSeriesEntity contains the recurrence pattern
   - EventEntity can belong to a series with a seriesId reference

2. **Occurrence Handling**:
   - Virtual occurrences are generated on-demand
   - Occurrences that exist in the database (with a database record) are treated as materialized
   - Modified occurrences have the originalOccurrenceDate field set to track which date they were generated for

3. **API Endpoints**:
   - CRUD operations for series management
   - Occurrence management (materialization, modification)
   - Future occurrences generation

### Transition Strategy

The transition from the old recurrence implementation to EventSeries follows a careful strategy:

1. **Compatibility Layer**:
   - EventOccurrenceService has been updated to check for seriesId and use EventSeriesOccurrenceService when available
   - Legacy code paths still work for backward compatibility
   - Core services maintain dual functionality during the transition

2. **Deprecation Notices**:
   - Deprecation notices added to the RecurrenceController
   - JSDocs updated with @deprecated tags and migration guidance
   - Documentation updated to guide users to new endpoints

3. **Phased Removal**:
   - Stage 1: ✅ Deprecate and add compatibility layer (current state)
   - Stage 2: Database migration to convert legacy events to use EventSeries
   - Stage 3: Client migration period with both APIs available
   - Stage 4: Complete removal of RecurrenceService after clients have migrated

## Benefits

- Better separation of concerns
- More maintainable code structure
- Improved performance for occurrence handling
- Full timezone support
- Better standardization with iCalendar
- Improved support for third-party integrations
- Simplified database schema with better compatibility