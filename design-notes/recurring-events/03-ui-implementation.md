# Recurring Events: UI Implementation Plan

This document outlines the UI changes required to support recurring events in the OpenMeet platform, including handling recurrence modifications and date exclusions.

## ⏳ Implementation Status

The UI implementation for recurring events is still pending. This document provides the plan for frontend changes that need to be made once the backend implementation is complete.

## Required UI Components

### Event Creation/Editing Form Updates

The existing `EventFormBasicComponent.vue` will need to be updated with:

1. **Recurrence Section** adding:
   - Recurrence toggle switch
   - Frequency selection (daily, weekly, monthly, yearly)
   - Interval selection (every X days/weeks/months)
   - Day selection for weekly recurrence
   - End recurrence options (never, after X occurrences, on date)
   - Timezone selection
   - Recurrence preview with next few occurrences

### Event Display Updates

The event detail page will need enhancements:

1. **Recurrence Information Display**
   - Human-readable recurrence rule description
   - Timezone indicator
   - Visual indicator for recurring events

2. **Occurrence Navigation**
   - Previous/next occurrence navigation
   - "View all occurrences" option
   - Indicator for modified occurrences

3. **Series Modification Options**
   - Dialog for modifying with options:
     - "Edit just this occurrence"
     - "Edit all occurrences"
     - "Edit this and future occurrences"

4. **Date Exclusion Management**
   - List of excluded dates
   - Options to exclude/include dates
   - Visual indicator for excluded dates

## Calendar View Updates

Calendar views will need:

1. **Recurring Event Visual Indicators**
   - Recurrence icon for recurring events
   - Visual distinction for occurrences
   - Different appearance for excluded dates

2. **Expanded Date Information**
   - Timezone-aware date display
   - Indication of modified occurrences
   - Series information on hover

## Event Listing Updates

Event listings should include:

1. **Recurrence Indicators**
   - Recurrence icons
   - Human-readable pattern description
   - Next occurrence date with timezone

2. **Exception Handling**
   - Indication of modified occurrences
   - Display of cancellations/exclusions

## Timezone Utilities

We need to create:

1. **Timezone Selection**
   - List of IANA timezone identifiers
   - Auto-detection of user's timezone
   - Search and filtering

2. **Date Formatting**
   - Timezone-aware date formatting
   - Conversion between timezones
   - Human-readable timezone display

## Required Dependencies

Frontend implementation will require:

1. **rrule.js** - For recurrence calculations
2. **date-fns-tz** - For timezone handling
3. **Timezone database** - For timezone information

## Implementation Approach

1. Start with the event form updates to allow creation of recurring events
2. Update the event detail page to display recurrence information
3. Add support for exception occurrences and modification options
4. Enhance calendar and list views to display recurring events
5. Add timezone utilities throughout the application

## Next Steps

1. Complete the backend implementation and API endpoints
2. Create UI component prototypes for recurrence management
3. Update the event form to include recurrence options
4. Implement timezone handling in the frontend
5. Add support for the recurrence modification workflows