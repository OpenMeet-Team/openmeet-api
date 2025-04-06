# Recurring Events: Action Items & Implementation Plan

This document outlines the prioritized action items needed to complete the recurring events implementation in OpenMeet.

## Changelog

### 2025-04-05: TypeScript Error Fixes

1. **Fixed OccurrenceOptions Type Issues**
   - Added proper import for OccurrenceOptions from recurrence interface
   - Fixed type errors in EventOccurrenceService
   - Ensured consistent type usage across the codebase

### 2025-04-05: Code Quality Improvements

1. **Standardized RecurrenceRule Interface**
   - Created a proper enum type for frequency values (`RecurrenceFrequency`)
   - Improved type safety by replacing loose string comparisons with enum values
   - Added comprehensive JSDoc comments to interfaces

2. **Fixed Column Name Mismatch**
   - Renamed `originalOccurrenceDate` field to `originalDate` in EventEntity to match database schema
   - Updated references in code to ensure consistency
   - Verified against the existing migration (1743371499235-RedesignRecurringEvents.ts)

3. **Started Timezone Handling Improvements**
   - Added utility methods using date-fns-tz in EventSeriesOccurrenceService
   - Created proper date formatting functions that respect timezone formatting
   - Still need to expand implementation to other services and test edge cases

### 2025-04-05: Timezone Handling Fixes

1. **Fixed date-fns-tz API Usage**
   - Updated imports to use correct function names: `toZonedTime` and `fromZonedTime`
   - Replaced deprecated `utcToZonedTime` and `zonedTimeToUtc` functions
   - Ensured consistent timezone handling across the application

2. **Improved Date Type Safety**
   - Fixed type mismatches between string and Date objects in EventSeriesOccurrenceService
   - Added proper Date object conversion and validation
   - Ensured consistent handling of ISO date strings and Date objects

3. **Enhanced RecurrenceOptions Interface**
   - Updated timezone handling to use proper options object format
   - Fixed type issues in recurrence pattern validation
   - Improved error handling for invalid date formats

## Critical Bugs

1. ✅ **Type Mismatch in RecurrenceRule Conversion**
   - Issue: Frontend expects frequency as string enum, but conversion uses unsafe casting
   - Fix: Implement proper type guards and validation
   - Priority: High
   - Affected files: `recurrenceUtils.ts`, `EventSeriesDto.ts`
   - **Status**: Fixed by implementing RecurrenceFrequency enum and type-safe conversion functions

2. ✅ **Missing originalOccurrenceDate Handling**
   - Issue: Inconsistent setting of originalOccurrenceDate for child events
   - Fix: Standardize date handling in creation and modification flows
   - Priority: High
   - Affected files: `event-series.service.ts`, `occurrence.service.ts`
   - **Status**: Fixed by renaming to originalDate to match database schema and updating references

3. ⚠️ **Timezone Conversion Issues**
   - Issue: DST transitions not properly handled in occurrence generation
   - Fix: Implement timezone-aware date handling using date-fns-tz
   - Priority: High
   - Affected files: `occurrence-generator.service.ts`
   - **Status**: Partially fixed with utility methods in EventSeriesOccurrenceService, but need to ensure implementation throughout occurrence generation logic

4. **Self-Published Event Detection**
   - Issue: Missing checksum validation for Bluesky sync
   - Fix: Implement robust deduplication for events published to Bluesky
   - Priority: Medium
   - Affected files: `bluesky.service.ts`, `event-processor.service.ts`

5. **Circular Reference in Service Architecture**
   - Issue: Circular dependency causing runtime errors
   - Fix: Refactor using forwardRef() or restructure services
   - Priority: High
   - Affected files: `event-series.service.ts`, `event.service.ts`

6. when I use the create event button and fill in the form in the dialog, and publish, it creates an event that is not attached to the series, and then it creates the series with an event on the same date, with the same name, but it is in the series.  

7. The recurrence has sunday and thursday in it... but only thursday select in the UI.
8.  when I create a new event the event list behind it doesn't update.
9.  

## Implementation Tasks

### Database & Schema

1. **Create Migration Scripts**
   - Create script to convert old recurring events to EventSeries
   - Add error handling and transaction support
   - Test on staging environment before production

2. **Optimize Database Queries**
   - Add indexes for common query patterns:
     ```sql
     CREATE INDEX idx_events_series_id ON events(series_id);
     CREATE INDEX idx_events_original_occurrence_date ON events(original_occurrence_date);
     CREATE INDEX idx_event_series_user_id ON event_series(user_id);
     ```
   - Implement pagination for occurrence queries

3. **Add Constraints**
   - Add unique constraints to prevent duplicate occurrences
   - Enforce referential integrity for series relationships

### Core Functionality

1. **Complete Transition from RecurrenceModule**
   - Delete RecurrenceController and RecurrenceService
   - Update all EventService references to use EventSeriesService
   - Remove deprecated endpoints

2. **Enhance Template Management**
   - Implement clearer rules for template transitions
   - Fix template property propagation to future occurrences
   - Add validation for template modifications

3. **Improve Error Handling**
   - Add comprehensive error handling for recurrence operations
   - Implement transaction support for multi-entity operations
   - Add proper error reporting for client applications

### Frontend Integration

1. **Update API Clients**
   - Remove references to deprecated RecurrenceService endpoints
   - Use new EventSeries endpoints for all series operations
   - Update type definitions to match backend changes

2. **Enhance Calendar Visualization**
   - Add recurring event indicators in calendar view
   - Implement proper rendering of series exceptions
   - Add visual distinction for template events

3. **Simplify Series Management UI**
   - Clarify paths for creating events vs. series
   - Improve interface for "this and all future" modifications
   - Add batch operations for series management

### ATProtocol Integration

1. **Implement Shadow Account Management**
   - Create lightweight accounts for Bluesky users
   - Store minimal user information (DID, handle, name)
   - Add account claiming functionality

2. **Develop Series Heuristics**
   - Implement pattern recognition for recurring events
   - Create grouping algorithm for related events
   - Add suggestion system for potential series

3. **Complete Bidirectional Sync**
   - Implement deduplication for self-published events
   - Add proper error handling and retry mechanisms
   - Create monitoring system for sync operations

## Testing Requirements

1. **Unit Tests**
   - Test recurrence rule calculations
   - Test timezone conversion edge cases
   - Test template propagation logic

2. **Integration Tests**
   - Test series creation and modification
   - Test occurrence materialization
   - Test ATProtocol sync operations

3. **E2E Tests**
   - Test complete user flows for series management
   - Test cross-timezone operations
   - Test ATProtocol integration scenarios

## Performance Improvements

1. **Caching Strategy**
   - Implement Redis caching for occurrence calculations
   - Cache template data for frequent operations
   - Add cache invalidation on series updates

2. **Query Optimization**
   - Use efficient querying for calendar views
   - Implement batch operations for occurrence generation
   - Add pagination for large series

3. **Background Processing**
   - Move occurrence generation to background jobs
   - Implement batch processing for ATProtocol operations
   - Add monitoring for long-running tasks

## Technical Decisions Needed

1. **Recurrence Rule Standardization**
   - Decide on consistent naming (byweekday vs. byday)
   - Define clear typing for recurrence rule properties
   - Standardize format between frontend and backend

2. **Series Modification Policy**
   - Define clear rules for template changes vs. exception creation
   - Establish policy for handling historical occurrences
   - Determine notification strategy for series changes

3. **ATProtocol Integration Strategy**
   - Define approach for handling Bluesky's limited event support
   - Establish policy for cross-platform attendance
   - Create strategy for eventual migration when Bluesky adds recurrence support


--------


● Based on analyzing the codebase, here are the top 15 code quality issues that should be fixed in the recurring events implementation:

  1. Inconsistent Type Definitions Between Frontend and Backend
    - Line 124-139 vs 143-182: Frontend RecurrenceRule includes HOURLY/MINUTELY/SECONDLY frequencies but backend only validates DAILY/WEEKLY/MONTHLY/YEARLY
    - Use a shared type definition to ensure consistency and eliminate duplicated code
  2. Type Safety Issues in Conversion Functions
    - Lines 211-212: Use of as any type casts instead of proper typing
    - Replace with proper type guards or union types to ensure type safety
  3. Random Notes and Questions in Production Code
    - Lines 1653-1656: Contains unstructured "random notes and questions" in what should be formal documentation
    - These should be moved to issues/tickets or properly integrated into the documentation
  4. Incomplete Error Handling in Migration Script
    - Lines 1581-1607: Migration script lacks error handling for failures during migration
    - Add try/catch blocks and transaction support to ensure data integrity
  5. Duplication Between Documentation Files
    - Multiple files contain similar descriptions of the EventSeries model
    - Consolidate documentation to have a single source of truth and reduce maintenance burden
  6. Undocumented Database Schema Changes
    - Lines 1700-1716: Database schema lacks documentation for indexes, constraints, and validation rules
    - Add comprehensive schema documentation, including index strategy for performance
  7. Inconsistent Naming Conventions
    - Use of both camelCase (byweekday) and snake_case (time_zone) in different parts of the codebase
    - Standardize naming conventions across the entire project
  8. Ambiguous External Data Storage
    - Line 725: externalData?: any; uses generic any type
    - Define specific interfaces for external data to improve type safety and readability
  9. Non-Normalized Database Schema
    - Storing JSONB data in multiple places like recurrence_rule and external_data
    - Consider normalizing these structures where appropriate for better query performance
  10. Dead Code in Event Series Implementation
    - Lines 1764-1877: Multiple redundant implementation notes that overlap with other files
    - Consolidate into a single authoritative implementation document
  11. Missing Default Values for Required Fields
    - The database schema doesn't specify default values for fields like timeZone
    - Add appropriate defaults to ensure consistent behavior
  12. Complex User Flow for Series Creation
    - Line 1655: Confusion noted about how users should create series
    - Simplify the UI flow and document a clear path for creating and managing series
  13. Circular Dependencies Between Services
    - Lines 1934-1936: Circular dependency handling using forwardRef is a code smell
    - Refactor service architecture to eliminate circular dependencies
  14. Lack of Comprehensive Test Coverage
    - Lines 1820-1860: Test cases described but may not be fully implemented
    - Implement all test cases and add performance testing for occurrence generation
  15. Redundant Data Storage
    - Storing both seriesId and seriesSlug in Event entity creates potential for inconsistencies
    - Consider using only the ID for the relationship and deriving the slug when needed

  These issues should be addressed to improve code quality, maintainability, and performance in the recurring events implementation.

> Do you spot any outright bugs that need to be addressed?

● After carefully analyzing the code, I can identify several potential bugs that need to be addressed:

  1. Type Mismatch in RecurrenceRule Conversion
    - The frontend interface expects frequency to be a string enum with values like 'DAILY', but the conversion function in toFrontendRecurrenceRule uses as any casting
  without proper validation, which could lead to runtime errors if unexpected values are received.
  2. Missing originalOccurrenceDate Handling
    - In the migration script (lines 1581-1607), there's no logic to properly set the originalOccurrenceDate for child events, which could cause issues with identifying the
  correct date for a modified occurrence.
  3. Timezone Conversion Issues
    - The template-based approach doesn't explicitly handle timezone transitions like DST when generating occurrences, which could lead to incorrect occurrence times or
  duplicate/missing occurrences during DST transitions.
  4. Incomplete Self-Published Event Detection
    - The detection of self-published events (lines 1020-1024) mentions a checksum validation but doesn't specify how this checksum is calculated or stored, potentially
  allowing duplicate events to be created.
  5. Circular Reference in EventSeries/Event Relationship
    - The EventSeries points to a currentTemplateEventId, but that event also points back to the series. If not properly handled, this could create issues during template
  changes or series updates.
  6. Incomplete Materialization Workflow
    - When materializing an occurrence (lines 1809-1813), the code mentions adding to "series' ordered list," but there's no clear implementation of this list, which could
  lead to inconsistent ordering of occurrences.
  7. Inconsistent Database Schema Between Documentation and Implementation
    - Different documents show different schema designs (some include materialized column, others don't; some include is_modified_occurrence, others use
  original_occurrence_date), which suggests inconsistency in the actual implementation.
  8. Missing Exception Handling for RRule Parsing
    - There's no explicit handling for invalid recurrence rules, which could cause runtime errors when attempting to generate occurrences from malformed rules.
  9. Potential Race Condition in Shadow Account Creation
    - In the Bluesky integration (lines 896-899), there's no transaction or locking mechanism for shadow account creation, which could lead to duplicate accounts if the same
   DID is processed concurrently.
  10. Incomplete Handling of Template Changes
    - When updating a template (lines 1797-1802), the logic to update "all future occurrences" doesn't specify how to handle already materialized occurrences that aren't
  modified, potentially leaving them with outdated properties.
  11. Missing Validation for Date Parameters
    - The API endpoints that use dates in the URL (like /event-series/{seriesSlug}/{date}) don't specify validation for the date format, which could lead to errors with
  malformed requests.
  12. Inconsistent Use of externalId/externalCid
    - Some parts of the code check only externalId while others require both externalId and externalCid, creating inconsistent behavior for external event identification.
  13. Ambiguous Status Mapping for RSVPs
    - The status mapping between OpenMeet and Bluesky (lines 948-952) doesn't handle all possible OpenMeet status values (like "waitlisted"), which could lead to data loss
  during synchronization.
  14. Mutability of the Recurrence Rule
    - There's no clear handling of what happens when a recurrence rule changes for a series with existing occurrences, particularly how exception dates and modified
  occurrences are maintained.
  15. Missing Database Constraints
    - The database schema doesn't include unique constraints to prevent duplicate occurrences of the same date within a series.

  These bugs could impact the reliability and consistency of the recurring events system, especially during edge cases like timezone transitions, concurrent operations, or
  when handling modifications to series templates.