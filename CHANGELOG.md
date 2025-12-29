# Changelog

All notable changes to OpenMeet API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.3] - 2025-12-29

### Added
- Dashboard pagination with role/tab filtering (#417)
- Dashboard summary endpoints for events, groups, and profiles (#416)
- `sendNotifications` parameter to event update endpoint (#426)
- Prevent reducing event capacity below confirmed attendees (#405)
- Link preview meta tags for events and groups (#361, #362)
- Visibility compliance system with RSVP pre-access check for private events (#386, #392)
- Renamed "Authenticated" to "Unlisted" visibility for clarity (#385)
- Default all new Matrix chat rooms to public/unencrypted (#369)
- ATProto handle resolution - show Bluesky handles instead of DIDs for shadow users (#356)
- Auto-send verification code on unverified login attempt (#355)
- Expose user auth fields (provider, socialId, isShadowAccount) for stable profile links (#359, #360)
- Docker compose for local development with Jaeger tracing
- Slim docker-compose for low RAM development environments
- OpenTelemetry tracing to ATProto handle resolution path
- Database query metrics with driver-level instrumentation (#376)
- Tier 1 & 2 database metrics for connection pool monitoring (#374)
- Docker watch mode with nodemon for local development (#375)
- Auto-migrations and improved local developer setup (#427)

### Changed
- Require Node.js 24+ and npm 11+ to match docker container versions
- CORS configuration to allow Android app access
- Redirect path configurable via .env (#428)
- Standardized Node.js version to 24-alpine across all containers (#429)
- Migrated Grafana dashboards to area-based metrics (#372, #373)
- Deploy script updated for ArgoCD workflow (#357)
- RabbitMQ management UI port changed to 25672 (Windows Hyper-V compatibility)
- API container renamed from `api` to `openmeet_api`

### Removed
- Unused `release-it` dependency and configuration (220 packages removed)
- Deprecated backup/restore scripts

### Fixed
- Extract occurrence date in series timezone (#421, #425)
- Return FileEntity for profile photo to enable URL transformation (#418)
- Sync Bluesky RSVP on status changes and fix Redis race condition (#415)
- Disable Bluesky event materialization on login (#414)
- Reduce Bluesky callback URL size to prevent 414 errors (#412)
- Shadow account preferences and add attending events to profile (#411)
- RSVP integration bugs (#410)
- N+1 query problems in group events, dashboard, and home page endpoints (#398, #400, #401, #407)
- Missing image relations in user profile queries (#406)
- Group membership visibility leak on user profiles (#395, #396)
- Visibility filtering in global search endpoints (#391)
- Approval optional for private groups (#388)
- VisibilityGuard reads from URL params instead of headers (#380)
- Wall-clock-time approach for timezone-aware recurring events (#368)
- DST bug in event series materialization (#366)
- Backend validation for negative event durations (#365)
- Convert shadow accounts to real accounts on Bluesky login (#364)
- Link previews for authenticated (unlisted) events and groups
- MAIL_HOST override for Docker container networking
- Activity feed: event-scoped activities, group-scoped activities in feed, RSVP for standalone events (#352-#354)
- Allow RSVP during ongoing events (#351)
- Bluesky auth error handling and logging (#350)
- Login blocking when OAuth email conflicts (#349)

### Performance
- Add critical database indexes to fix sequential scan issues (#377, #404)
- Fire-and-forget cache SET to avoid ElastiCache Serverless latency
- Optimize ElastiCache connection for lower latency
- Configurable database connection pool settings (#403)
- Optimize showAllEvents and showDashboardEvents queries (#402)
- Replace path-based metrics labels with area-based labels to reduce cardinality (#372)

### Security
- Address critical, high, and medium severity vulnerabilities (#408, #409)
- Update nodemailer to 7.0.12 to fix vulnerabilities
- Reduce npm audit vulnerabilities from 50 to 43

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
