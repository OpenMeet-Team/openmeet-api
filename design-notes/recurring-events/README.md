# OpenMeet Recurring Events and ATProtocol Integration

This directory contains the authoritative design documentation for OpenMeet's recurring events functionality and its integration with ATProtocol/Bluesky.

## Documentation Structure

- [**Consolidated Implementation Plan**](./consolidated-implementation-plan.md) - **PRIMARY DOCUMENT** - Comprehensive implementation plan that integrates event series functionality with ATProtocol integration.

- [**Recurring Events: Unified Design Document**](./recurring-events-unified.md) - Detailed design documentation for the Event Series model, including data model, business logic, API design, and migration plan.

- [**Bluesky Integration**](./bluesky-integration.md) - Detailed design for bidirectional integration with Bluesky's ATProtocol event and RSVP lexicons.

> **Note**: The `consolidated-implementation-plan.md` is the most current and authoritative document, superseding the previous implementation plan. The root-level `/recurring-events-implementation-plan.md` contains useful historical context but should not be considered current.

## Key Concepts

### Event Series Model

The Event Series model replaces our previous approach to recurring events with a more intuitive and powerful structure:

- **EventSeries**: First-class entity representing a recurring event pattern with template properties
- **Occurrences**: Individual instances of a series with the ability to be modified independently
- **Following vs. Attendance**: Users can follow a series but attend specific occurrences
- **Chat Integration**: Series-wide chat and occurrence-specific chats

### Relationship with Groups

- Events and groups are independent entities that can exist separately
- Events (individual or series) can optionally belong to a group
- Groups can contain multiple events/series but don't have to have events

### ATProtocol Integration (Current Limitations)

Since the ATProtocol lexicon doesn't currently support recurring events (though proposed changes exist), we're implementing a pragmatic approach:

- **OpenMeet → Bluesky**: Publish only the next upcoming occurrence with link to the full series
- **Bluesky → OpenMeet**: Import as standalone events, process as series where appropriate
- **Shadow Accounts**: Create lightweight accounts for Bluesky users who haven't joined OpenMeet
- **Source of Truth**: Events originating from Bluesky use Bluesky as source of truth; events from OpenMeet use OpenMeet

## Implementation Plan Overview

| Phase | Description | Duration |
|-------|-------------|----------|
| 1 | Core Schema and Entities | 1 week |
| 2 | Series Management | 1 week |
| 3 | Occurrence Management | 1 week |
| 4 | Following and Attendance | 1 week |
| 5 | Chat Integration | 1 week |
| 6 | ATProtocol Event Integration | 2 weeks |
| 7 | Frontend Integration | 2 weeks |
| 8 | Testing and Refinement | 2 weeks |
| 9 | ATProtocol Group Integration (Future) | 1-2 weeks |

## Standards Compliance

Our recurring events implementation follows these standards:

- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - Internet Calendaring and Scheduling Core Object Specification (iCalendar)
- [RFC 7986](https://datatracker.ietf.org/doc/html/rfc7986) - New Properties for iCalendar
- [JSCalendar](https://datatracker.ietf.org/doc/html/rfc8984) - JavaScript Object Notation (JSON) Format for iCalendar
- [ATProtocol Calendar Lexicon](https://atproto.com/lexicons) - For Bluesky integration

## Future Enhancements

- Full bidirectional sync when ATProtocol supports recurring events
- Support for complex recurrence patterns (e.g., "third Tuesday of the month")
- Calendar export/import with standard `.ics` files
- Enhanced visibility controls and permissions