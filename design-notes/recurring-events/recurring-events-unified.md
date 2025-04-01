# OpenMeet Recurring Events: Complete Design Document

## 1. Overview and Scope

This unified document defines the design, implementation plan, and migration strategy for the Event Series model in OpenMeet. This represents a significant evolution of our recurring events functionality to address limitations in the current approach and provide a more intuitive user experience.

The design encompasses:
- Complete data model for event series and occurrences
- Business logic for occurrence generation and management
- Modification patterns including template propagation
- Attendance tracking and notification behavior
- Chat integration for both series and occurrences
- Implementation timeline and testing strategy

## 2. Evolution of Design

Our approach to recurring events has evolved through several iterations:

1. **Initial Implementation**: Basic recurring events using parent-child relationships, with exceptions for modified occurrences
2. **This and Future Modifications**: Added support for "split points" to modify series from a specific date forward
3. **Series Model**: Our current design with explicit Series entities to provide a unified context while supporting flexible occurrences

## 3. Core Model

### 3.1 Key Entities

- **EventSeries**: Container for recurring events with shared template and pattern
- **Event**: Individual occurrence within a series (or standalone event)
- **SeriesFollower**: Users following/interested in a series
- **EventAttendee**: Users attending specific events/occurrences

### 3.2 Key Relationships

- **EventSeries** has many **Events** (occurrences) 
- **Events** belong to zero or one **EventSeries**
- **SeriesFollowers** are associated with an **EventSeries**
- **EventAttendees** are associated with specific **Events**
- **Chat rooms** exist at both series level and event level

### 3.3 Database Schema

```sql
-- Event Series Table
CREATE TABLE event_series (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  time_zone VARCHAR(50),
  recurrence_rule JSONB,
  recurrence_exceptions JSONB,
  matrix_room_id VARCHAR(255),
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Updated Events Table 
ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES event_series(id);
ALTER TABLE events ADD COLUMN is_modified_occurrence BOOLEAN DEFAULT FALSE;

-- Series Followers Table
CREATE TABLE event_series_followers (
  id SERIAL PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES event_series(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(series_id, user_id)
);
```

### 3.4 URLs and Identity

- Series and occurrences have separate slugs
- Occurrences use URLs with simplified dates: `/events/series-slug/2025/04/15`
- Access control enforced at both series and occurrence level
- Sharing links work for both series and individual occurrences

## 4. Business Logic Requirements

### 4.1 Series Template Behavior

- Series stores template data (title, description, etc.) for generating occurrences
- Template changes propagate to all future unmodified occurrences
- Modified occurrences preserve their modifications when template changes
- Admins can revert individual occurrences to match current template
- The earliest upcoming occurrence can be updated with an option to propagate changes to all future unmodified occurrences

### 4.2 Occurrence Management

- Occurrences are created on-demand as they approach (vivification)
- When an occurrence completes, the next one is created automatically
- Navigating to or editing a future occurrence creates it in the database
- Occurrences can be individually modified without affecting the series template
- Rescheduling an occurrence creates an exception, preserving the original pattern
- Multiple occurrences can exist on the same day (no conflict prevention)
- Occurrences can be individually canceled (remaining visible but marked canceled)
- Occurrences can be individually deleted (removed from the series)
- Canceled occurrences can be reinstated

### 4.3 Series Lifecycle

- Series remain active until explicitly deleted by owner
- Series can be extended beyond original end date if needed
- Modification of occurrence dates can extend the series time boundary
- System may archive and eventually delete very old series

### 4.4 Following and Attendance

- Users can follow a series to receive notifications about all occurrences
- Following does not imply attendance - users must RSVP to specific occurrences
- Default attendance state is "not attending"
- Users who RSVP "yes" receive reminders for that occurrence
- Users who RSVP "no" don't receive reminders for that occurrence
- Users who haven't responded receive notifications to encourage RSVP

### 4.5 Chat Integration

- Each series has one chat room for series-wide discussion
- Each occurrence has its own chat room for occurrence-specific discussion
- Chat rooms can be enabled/disabled at both series and occurrence level
- Chat access is restricted to:
  - Series chat: All series followers
  - Occurrence chat: All people RSVPed "yes" to that occurrence

## 5. Technical Implementation Details

### 5.1 Recurrence Rule Format and Standards Compliance

#### RFC 5545 Compliance

Our implementation follows the Internet Calendaring and Scheduling Core Object Specification (iCalendar) RFC 5545, with recurrence rules stored as JSON objects:

```json
{
  "freq": "WEEKLY",
  "interval": 2,
  "count": 10,
  "byday": ["MO", "WE", "FR"],
  "wkst": "MO"
}
```

#### Supported Recurrence Features

- **Frequencies**: DAILY, WEEKLY, MONTHLY, YEARLY
- **Intervals**: Every X days, weeks, months, years
- **End conditions**: COUNT (number of occurrences) or UNTIL (end date)
- **BYDAY**: Specific days of the week (MO, TU, WE, TH, FR, SA, SU)
- **BYMONTHDAY**: Specific days of the month (1-31)
- **BYMONTH**: Specific months (1-12)
- **WKST**: Week start day
- **Complex rules**: Combinations of the above

#### iCalendar Export/Import

For interoperability with external calendar systems, we support:

1. **VEVENT Export**: Generate iCalendar (`.ics`) files for:
   - Single events
   - Complete series with all exceptions
   - Selected occurrences

2. **iCalendar Import**: Parse and create events from:
   - Single VEVENT objects
   - Recurring events with RRULE
   - Events with exceptions (EXDATE)

3. **RFC 7986 Extensions**: Support for additional properties:
   - COLOR for visual identification
   - CONFERENCE for meeting links
   - STRUCTURED-DATA for additional metadata

### 5.2 Timezone Handling

Our implementation includes comprehensive timezone handling:

1. **Storage in UTC, Display in Local Time**: 
   - All dates stored in UTC in the database
   - Original timezone preserved with each event
   - User sees dates in the event's declared timezone

2. **Recurrence Calculations in Original Timezone**:
   - When generating occurrences:
     - Convert start date to the specified timezone
     - Apply recurrence rules in that timezone context
     - Convert resulting dates back to UTC for storage
   - This ensures that "daily at 9 AM" in Eastern Time always means 9 AM Eastern Time, regardless of UTC offset or DST changes

3. **Handling DST Transitions**:
   - Events recur at the same local time, even when crossing DST boundaries
   - For example, a daily 9 AM Eastern Time event will occur at 9 AM EDT during summer and 9 AM EST during winter

4. **Library Usage**:
   - `date-fns-tz` for timezone conversions and formatting
   - `luxon` for additional timezone operations
   - `rrule.js` for recurrence rule calculations

5. **Frontend Display**:
   - Event times shown in the event's declared timezone with clear timezone indicator
   - User's local timezone offered as default for new events
   - Timezone selector with common options and search
   - Visual indicators for timezone differences

### 5.3 Occurrence Generation

Occurrences are generated following these rules:

1. The system generates the next few occurrences based on the series template
2. Additional occurrences are generated as each occurrence completes
3. Users can navigate to any future date in the series, triggering generation of that occurrence
4. Modified occurrences are stored as complete event entities with `is_modified_occurrence=true`
5. When template changes, all future unmodified occurrences are updated

### 5.4 Key Services

1. **EventSeriesService**: Manages series entities and their templates
2. **OccurrenceService**: Handles generation and vivification of occurrences
3. **RecurrenceService**: Implements RFC 5545 recurrence rules and calculations
4. **SeriesFollowerService**: Manages users following series
5. **EventAttendeeService**: Tracks attendance for specific occurrences

### 5.5 API Endpoints

```
# Series Management
GET    /api/event-series            - List series
POST   /api/event-series            - Create series
GET    /api/event-series/:slug      - Get series details
PATCH  /api/event-series/:slug      - Update series template
DELETE /api/event-series/:slug      - Delete series

# Occurrence Management
GET    /api/event-series/:slug/occurrences        - List occurrences
GET    /api/event-series/:slug/occurrences/:date  - Get specific occurrence
PATCH  /api/event-series/:slug/occurrences/:date  - Update occurrence
DELETE /api/event-series/:slug/occurrences/:date  - Delete occurrence
POST   /api/event-series/:slug/occurrences/:date/cancel    - Cancel occurrence
POST   /api/event-series/:slug/occurrences/:date/reinstate - Reinstate occurrence

# Following & Attendance
GET    /api/event-series/:slug/followers          - List followers
POST   /api/event-series/:slug/followers          - Follow series
DELETE /api/event-series/:slug/followers/:userId  - Unfollow series

POST   /api/events/:slug/attendees                - Attend event
PATCH  /api/events/:slug/attendees/:userId        - Update attendance status
GET    /api/events/:slug/attendees                - List attendees

# Chat Integration
GET    /api/event-series/:slug/chat               - Get series chat
GET    /api/events/:slug/chat                     - Get occurrence chat
```

## 6. User Interface Implementation

### 6.1 Key UI Components

1. **Series Creation Flow**:
   - Recurrence pattern selector with visual calendar preview
   - Timezone selector with common options and search
   - End condition selector (count, until date, or never)
   - Template fields for series-wide properties

2. **Series Management Dashboard**:
   - Calendar view of all occurrences
   - List view with filters
   - Visual indicators for modified occurrences
   - Quick actions for common operations

3. **Occurrence Management**:
   - Individual occurrence editor
   - Option to propagate changes to future occurrences
   - Cancel/reinstate controls
   - Attendee management

4. **Following and Attendance UI**:
   - Follow/unfollow series button
   - Notification preferences
   - RSVP controls for individual occurrences
   - Bulk actions for multiple occurrences

5. **Calendar Integration**:
   - Subscribe to series as calendar feed
   - Download individual or series .ics files
   - Export to external calendars

### 6.2 UI Design Principles

1. **Clear Series Context**: Always show which series an occurrence belongs to
2. **Modification Visibility**: Clearly indicate which occurrences differ from the pattern
3. **Timezone Awareness**: Display times in appropriate timezone with clear indicators
4. **Progressive Disclosure**: Show common options first, advanced options on demand
5. **Bulk Actions**: Support efficient management of multiple occurrences

### 6.3 UI Distinction Between Series and Occurrences

#### Visual Hierarchy and Context Indicators

1. **URL Structure**
   - Series: `/events/waterfront-wednesdays-2025`
   - Occurrence: `/events/waterfront-wednesdays-2025/2025/06/11`

2. **Header/Title Area**
   - Series View: Series name with badge and recurrence pattern
   - Occurrence View: Occurrence title with "Part of Series: [Series Name]" subtitle

3. **Navigation Elements**
   - Series View: Calendar view, list view of occurrences, "Follow Series" button
   - Occurrence View: Previous/Next occurrence navigation, "Back to Series" link, "Attend this Occurrence" button

4. **Content Display**
   - Series Page: Overview of series, preview of upcoming occurrences, series-wide discussion
   - Occurrence Page: Details specific to occurrence, highlighted differences from template, occurrence-specific discussion

#### Editing Workflows

1. **Clear Edit Scope Selection**
   ```
   EDIT OPTIONS:
   ┌────────────────────────────────────┐
   │ ◯ Edit just this occurrence        │
   │                                    │
   │ ◯ Edit series template             │
   │   (affects unmodified occurrences) │
   │                                    │
   │ ◯ Edit this and future occurrences │
   │   (affects Jun 11 - Sep 24)        │
   └────────────────────────────────────┘
   ```

2. **Contextual Edit Forms**
   - Different form headers and colors based on edit scope
   - "Editing TEMPLATE for all [Series Name] events"
   - "Editing ONLY [Date] occurrence"
   - "Editing THIS AND ALL FUTURE occurrences"

3. **Impact Preview**
   - Visual timeline showing which occurrences will be affected
   - Indicators for which occurrences will remain unaffected (already modified)
   - Confirmation dialogs explaining the scope of changes

4. **Field-Level Scope Indication**
   - Display both occurrence-specific values and template values
   - Clearly indicate when a field differs from the template
   - Option to reset individual fields to match template

## 7. Test Cases

### 7.1 Series Creation and Template

1. **Create series with recurrence rule**
   - Create a weekly recurring series
   - Verify that initial occurrences are generated
   - Verify series template properties are applied to occurrences

2. **Update series template**
   - Modify series name and description
   - Verify unmodified future occurrences are updated
   - Verify modified occurrences preserve their modifications

3. **Series template propagation**
   - Create a series with several occurrences
   - Modify one occurrence (mark as modified)
   - Update the series template
   - Verify only unmodified occurrences get the new values

### 7.2 Occurrence Management

4. **Occurrence vivification**
   - Create a series with distant future dates
   - Navigate to a future date not yet generated
   - Verify the occurrence is created on-demand
   - Complete a current occurrence, verify next is created

5. **Occurrence modification**
   - Modify a specific occurrence's properties
   - Verify it's marked as modified
   - Verify series template remains unchanged
   - Update template, verify modified occurrence preserves changes

6. **Rescheduling**
   - Reschedule an occurrence to a different date
   - Verify original date is marked as exception
   - Verify new date has the occurrence
   - Verify two occurrences can exist on same day

7. **Cancellation and reinstatement**
   - Cancel an occurrence
   - Verify it remains visible but marked canceled
   - Reinstate the occurrence
   - Verify it returns to normal status

### 7.3 Following and Attendance

8. **Series following**
   - Follow a series
   - Verify user is added to followers
   - Verify notifications are enabled
   - Verify user isn't automatically attending occurrences

9. **Occurrence attendance**
   - RSVP to a specific occurrence
   - Verify attendance record is created
   - Decline a specific occurrence
   - Verify user doesn't receive notifications

10. **Mixed attendance patterns**
    - Create series with multiple occurrences
    - Have user attend some but not others
    - Verify correct attendance records per occurrence
    - Verify appropriate notification behavior

### 7.4 Chat Integration

11. **Series and occurrence chat rooms**
    - Create series with multiple occurrences
    - Verify series has a chat room
    - Verify each occurrence has its own chat room
    - Verify correct access permissions

12. **Chat isolation**
    - Post message in series chat
    - Verify it doesn't appear in occurrence chats
    - Post in occurrence chat
    - Verify it doesn't appear in series chat

### 7.5 Complex Use Cases

13. **Occurrence at DST transition**
    - Create series spanning DST transition
    - Verify correct time handling across transition
    - Modify occurrence at transition
    - Verify time is preserved correctly

14. **Very long-running series**
    - Create series with 100+ occurrences
    - Verify performance remains acceptable
    - Modify template, verify update performance
    - Delete series, verify cleanup performance

15. **Concurrent modifications**
    - Simulate multiple users modifying series/occurrences
    - Verify data integrity is maintained
    - Test race conditions in modification flow

16. **Recurring Festival Series (Waterfront Wednesdays)**
    - Create weekly summer concert series (June-September)
    - Customize each occurrence with different performers/themes
    - Test rescheduling a single occurrence to a non-pattern date (e.g., holiday)
    - Add a special occurrence outside the regular pattern
    - Cancel a regular occurrence
    - Verify users can:
      - Follow the series but attend select occurrences
      - Distinguish between series and occurrence context
      - Navigate between occurrences
      - Participate in both series and occurrence-specific discussions

## 8. Integration with ATProtocol

### 8.1 ATProtocol Event Support

OpenMeet will extend our Event Series model to support Bluesky integration via ATProtocol:

1. **Event Records in ATProtocol**:
   - Each series will be represented as an event record in the user's repository
   - Individual occurrences will be linked to the series record
   - Modifications will be tracked through record updates

2. **Data Mapping**:
   - Series template maps to the core event record
   - Occurrence data maps to date-specific fields
   - Recurrence rule maps to the series definition

3. **Bidirectional Sync**:
   - Changes in OpenMeet propagate to Bluesky events
   - Changes from Bluesky are imported into OpenMeet
   - Conflict resolution prioritizes most recent changes

### 8.2 User Experience

1. **Cross-Platform Visibility**:
   - Events created in OpenMeet visible on Bluesky timeline
   - Bluesky users can discover and join OpenMeet events
   - Attendance and RSVPs synchronized

2. **Identity Integration**:
   - Login with Bluesky credentials
   - Link existing accounts for unified identity
   - Cross-post event attendance

## 9. Migration Strategy

### 9.1 Database Migration

1. Create the new tables for EventSeries and SeriesFollowers
2. Add the seriesId field to the events table
3. Add is_modified_occurrence field to events table
4. Create appropriate indexes and foreign keys

### 7.2 Data Migration

1. For each existing recurring event:
   - Create a new EventSeries entity with its pattern and template data
   - Link the original event to this series
   - Find all child events (exceptions, split points) and link them to the series
   - Migrate attendees to the new model (as both followers and attendees)
   - Preserve all existing Matrix chat rooms

2. For the migration script:
   ```typescript
   // Migration Script (pseudo-code)
   async function migrateToEventSeries() {
     // Find all parent recurring events
     const parentEvents = await findAllParentRecurringEvents();
     
     for (const parentEvent of parentEvents) {
       // Create series entity
       const series = await createSeriesFromEvent(parentEvent);
       
       // Link parent event to series
       await linkEventToSeries(parentEvent, series);
       
       // Find and link child events
       const childEvents = await findChildEvents(parentEvent);
       for (const childEvent of childEvents) {
         await linkEventToSeries(childEvent, series);
         
         // Mark as modified if it's an exception
         if (childEvent.isRecurrenceException) {
           await markAsModifiedOccurrence(childEvent);
         }
       }
       
       // Migrate attendees to followers
       await migrateAttendeesToFollowers(parentEvent, series);
     }
   }
   ```

### 7.3 Service Updates

1. Implement new services (EventSeriesService, SeriesFollowerService, etc.)
2. Update existing services to work with the new model
3. Create compatibility layer for APIs during transition

### 7.4 Frontend Updates

1. Update API clients to work with the new endpoints
2. Modify UI components to support series and occurrences
3. Add new series-specific views and features

## 10. Implementation Timeline

### 10.1 Phase 1: Core Schema and Entities (1 week)
- Create database migrations
- Implement entity classes
- Set up repository interfaces
- Write unit tests for core functionality

### 10.2 Phase 2: Series Management (1 week)
- Implement EventSeriesService
- Create endpoints for series CRUD operations
- Implement occurrence generation logic
- Build modification propagation logic

### 10.3 Phase 3: Occurrence Management (1 week)
- Implement occurrence-specific APIs
- Build vivification system
- Create cancellation/reinstatement logic
- Handle rescheduling with exceptions

### 10.4 Phase 4: Following and Attendance (1 week)
- Implement follower management
- Build attendance tracking
- Create notification rules
- Integrate with existing notification system

### 10.5 Phase 5: Chat Integration (1 week)
- Create chat room management for series/occurrences
- Implement access control logic
- Integrate with Matrix API
- Build chat filtering capabilities

### 10.6 Phase 6: Frontend Integration (2 weeks)
- Update API clients
- Build series management UI
- Create occurrence management components
- Implement following/attendance UI
- Build chat integration UI

### 10.7 Phase 7: Data Migration and Testing (1 week)
- Create data migration scripts
- Perform production data analysis
- Run migration on test environment
- Execute full testing suite
- Plan production deployment

### 10.8 Phase 8: ATProtocol Integration (2 weeks)
- Implement ATProtocol data mapping
- Create bidirectional sync mechanism
- Build Bluesky identity integration
- Test cross-platform visibility
- Deploy integration endpoints

## 11. Conclusion

The Event Series model represents a significant improvement to OpenMeet's recurring events functionality. By clearly distinguishing between series following and occurrence attendance, we create a more intuitive user experience that matches how people think about recurring events in the real world.

This approach provides:
- Clearer mental model for users (series with occurrences)
- More flexible attendance patterns
- Unified conversation context while maintaining occurrence-specific discussions
- Efficient storage and performance for long-running series
- Robust handling of modifications to future occurrences

By implementing this model, we're building a foundation that will support advanced recurring event features while improving the overall user experience.