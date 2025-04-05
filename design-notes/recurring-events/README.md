# Recurring Events & ATProtocol Integration Documentation

This directory contains technical documentation for OpenMeet's implementation of recurring events with ATProtocol/Bluesky integration.

## Core Documentation

1. **[Main Design Document](./main-design-document.md)**
   - Complete architecture overview
   - Current implementation state
   - Data models and relationships
   - API endpoints
   - ATProtocol integration strategy

2. **[Action Items & Implementation Plan](./action-items-consolidated.md)**
   - Critical bugs to fix
   - Remaining implementation tasks
   - Required technical decisions
   - Testing requirements
   - Performance improvements

## Feature-Specific Documentation

3. **[Event Series Implementation Guide](./event-series-implementation-guide.md)**
   - Data model details
   - Service architecture
   - Materialization strategy
   - Testing approach

4. **[ATProtocol Integration Guide](./atprotocol-integration-guide.md)**
   - Bluesky data flow
   - Shadow account management
   - Series detection algorithm
   - Deduplication strategy

## Standards Compliance

Our recurring events implementation follows these standards:

- [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) - Internet Calendaring and Scheduling Core Object Specification (iCalendar)
- [RFC 7986](https://datatracker.ietf.org/doc/html/rfc7986) - New Properties for iCalendar
- [JSCalendar](https://datatracker.ietf.org/doc/html/rfc8984) - JavaScript Object Notation (JSON) Format for iCalendar
- [ATProtocol Calendar Lexicon](https://atproto.com/lexicons) - For Bluesky integration

## Note

Historical documents have been archived to reduce confusion and duplication. These four documents provide a complete and up-to-date reference for the recurring events implementation.