# Changelog

All notable changes to OpenMeet API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2] - 2025-11-02

### Added
- Calendar invites (.ics attachments) in event creation emails - recipients can now add events directly to their calendars (#346)
- Calendar invites in event update emails with SEQUENCE tracking for proper calendar updates (#344)
- Calendar invites in event cancellation emails with METHOD:CANCEL to remove events from calendars (#344)
- VTIMEZONE component to ICS files for RFC 5545 timezone compliance (#345)
- Email verification system with 6-digit codes for passwordless authentication (#337)
- Email verification status from Bluesky OAuth flow (#336)
- Luma-style Quick RSVP V2 with immediate calendar invites (#333)

### Fixed
- **CRITICAL SECURITY**: Rate limiter TTL reset bug that allowed attackers to bypass rate limits (#339, #338)
- Multi-day event time range display in calendar invite emails
- UTC to event timezone conversion in ICS files
- Tenant-aware calendar URLs and double-scheme bug (#335)
- Dynamic expiry time display in email verification templates (#332)

### Changed
- Event lifecycle now includes complete calendar integration (create/update/cancel)
- All event notification emails now include personalized ICS attachments
- Calendar invites work with Google Calendar, Outlook, Apple Calendar, and other RFC 5545-compliant clients

## [1.4.1] - [Previous Release Date]

_Previous release notes to be added_

---

## Release Notes Format

### Added
New features and capabilities

### Changed
Changes to existing functionality

### Deprecated
Features that will be removed in upcoming releases

### Removed
Features that have been removed

### Fixed
Bug fixes

### Security
Security-related changes and fixes
