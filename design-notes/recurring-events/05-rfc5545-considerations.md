# Additional RFC 5545 Considerations for Event Model

This document outlines additional properties and concepts from RFC 5545 that we should consider incorporating into our event model to ensure compatibility with iCalendar standards and enhance functionality.

## Required Properties

RFC 5545 requires these properties for VEVENT components:

1. **UID**: Unique identifier for the event
   - Currently: We use `ulid` field, should ensure it's globally unique
   - Implementation: Generate UIDs in format `{ulid}@openmeet.org`

2. **DTSTAMP**: Date-time when the event was created in iCalendar
   - Currently: We have `createdAt` which serves a similar purpose
   - Implementation: Use `createdAt` as DTSTAMP when exporting

3. **DTSTART**: Start date-time of the event
   - Currently: We have `startDate`
   - Implementation: Already covered, ensure proper timezone handling

## Important Optional Properties

These properties enhance our event model:

1. **CLASS** (Security Classification)
   - Purpose: Indicates visibility/security level of the event
   - Options: PUBLIC, PRIVATE, CONFIDENTIAL
   - Implementation: Add `securityClass` enum field to event entity
   - Mapping: Can map to our existing `visibility` property

2. **PRIORITY**
   - Purpose: Indicates relative importance of the event (0-9, with 0 being undefined)
   - Implementation: Add `priority` integer field to event entity
   - UI: Add priority selector to event form

3. **STATUS**
   - Purpose: Indicates event status
   - Values: TENTATIVE, CONFIRMED, CANCELLED
   - Implementation: Map our existing `status` field (draft → TENTATIVE, published → CONFIRMED, cancelled → CANCELLED)

4. **TRANSP** (Time Transparency)
   - Purpose: Defines whether an event blocks time on a calendar
   - Values: OPAQUE (blocks time), TRANSPARENT (doesn't block time)
   - Implementation: Add `blocksTime` boolean field to event entity
   - Use Case: For information-only events like holidays that don't block time

5. **RESOURCES**
   - Purpose: Defines resources needed for the event (e.g., projector, conference room)
   - Implementation: Add `resources` array field to event entity
   - UI: Add resource selector to event form

## Special Event Types

RFC 5545 supports several special event types we should consider:

1. **All-Day Events**
   - Implementation: Add `isAllDay` boolean field to event entity
   - Storage: Store start/end dates as midnight UTC
   - Display: Show without time component

2. **Anniversary Events**
   - Implementation: Special case of yearly recurring events
   - UI: Add "Anniversary" option in recurrence selector

3. **Multi-Day Events**
   - Implementation: Already supported with start/end dates
   - Enhancement: Add proper handling for timezone differences

## Advanced Attributes

Consider these additional attributes for enhanced functionality:

1. **GEO** (Geographic Position)
   - Purpose: Precise latitude/longitude for event location
   - Implementation: We already have `lat` and `lon` fields
   - Enhancement: Ensure these are properly exported in iCalendar

2. **ATTACH** (Attachments)
   - Purpose: Link or include files with the event
   - Implementation: Add support for file attachments to events
   - Storage: Store URLs or file references
   - Security: Consider security implications of attachments

3. **RELATED-TO**
   - Purpose: Establish relationships between events
   - Implementation: Add `relatedEventIds` array field
   - Types: Supports "parent", "child", "sibling" relationships
   - Use Cases: Event series, dependent events

## RFC 7986 Extensions

RFC 7986 extends iCalendar with important new properties:

1. **COLOR**
   - Purpose: Specify a color for the event
   - Implementation: Add `color` string field (hex code or name)
   - UI: Add color picker to event form

2. **CONFERENCE**
   - Purpose: Define conferencing systems in a standardized way
   - Implementation: Add `conferenceData` structured field
   - Format: Includes URI, access codes, dial-in information
   - Example: Zoom, Teams, Google Meet integration

3. **IMAGE**
   - Purpose: Associate an image with the event
   - Implementation: Link to our existing `image` field
   - Export: Include as URL or embedded base64 data

4. **STRUCTURED-DATA**
   - Purpose: Include arbitrary structured data with the event
   - Implementation: Can link to external data schemas
   - Use Case: Extended metadata for specialized event types

5. **CONCEPT (NAME and STRUCTURED-CATEGORY)**
   - Purpose: Enhanced categorization beyond simple strings
   - Implementation: Add support for structured categories
   - UI: Category management with hierarchies

## Database Schema Updates

Based on these considerations, we should add:

```typescript
@Column({ nullable: true, type: 'enum', enum: EventSecurityClass })
securityClass: EventSecurityClass;

@Column({ nullable: true, type: 'int', default: 0 })
priority: number;

@Column({ nullable: false, type: 'boolean', default: true })
blocksTime: boolean;

@Column({ nullable: true, type: 'boolean' })
isAllDay: boolean;

@Column({ nullable: true, type: 'jsonb' })
resources: string[];

@Column({ nullable: true, type: 'jsonb' })
relatedEventIds: number[];

@Column({ nullable: true, type: 'string' })
color: string;

@Column({ nullable: true, type: 'jsonb' })
conferenceData: Record<string, any>;

@Column({ nullable: true, type: 'jsonb' })
structuredData: Record<string, any>;
```

## iCalendar Export Enhancements

Ensure our iCalendar export includes these properties:

```
BEGIN:VEVENT
UID:event123@openmeet.org
DTSTAMP:20240330T120000Z
DTSTART;TZID=America/New_York:20240401T090000
DTEND;TZID=America/New_York:20240401T100000
SUMMARY:Team Meeting
DESCRIPTION:Weekly team sync-up
LOCATION:Conference Room A
GEO:37.386013;-122.082932
CLASS:PUBLIC
PRIORITY:5
STATUS:CONFIRMED
TRANSP:OPAQUE
RESOURCES:Projector,Whiteboard
COLOR:#4A76B8
IMAGE;VALUE=URI:https://example.com/eventimage.jpg
CONFERENCE;VALUE=URI:https://zoom.us/j/123456789
...
END:VEVENT
```

## User Interface Considerations

Add UI components for new properties:

1. **Classification Selector**
   - Options: Public, Private, Confidential
   - Default: Public

2. **Priority Selector**
   - Scale: 0-9 (or simplified High/Medium/Low)
   - Default: 0 (undefined)

3. **Time Transparency Toggle**
   - Options: Blocks time (OPAQUE), Doesn't block time (TRANSPARENT)
   - Default: Blocks time

4. **Color Picker**
   - Default palette with customization
   - Apply to calendar views

5. **Conference Integration**
   - Interface for adding virtual meeting links
   - Auto-detection of meeting URL patterns
   - Direct integration with conferencing platforms

## Implementation Priority

We should implement these features in this order:

1. **High Priority**:
   - CLASS (maps to visibility)
   - STATUS (maps to existing status)
   - isAllDay (improves calendar display)
   - COLOR (visual enhancement)

2. **Medium Priority**:
   - TRANSP (time transparency)
   - GEO (geographic coordinates)
   - CONFERENCE (virtual meeting support)

3. **Lower Priority**:
   - PRIORITY
   - RESOURCES
   - RELATED-TO
   - STRUCTURED-DATA

This enhancement to our event model will ensure better compatibility with calendar standards and provide users with more powerful event management capabilities.