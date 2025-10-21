# System Design Document: Activity Feed System

## Overview
The Activity Feed System provides real-time visibility into platform activity across groups, events, and the broader OpenMeet community. It serves three primary feed types: sitewide (public discovery and user personalization), group-specific (member engagement), and event-specific (attendee coordination). The system balances transparency for growth with privacy for sensitive content, showing that private groups/events exist without exposing their details.

## Implementation Status

**Currently Implemented:**
- ✅ **Sitewide activity feed** - `GET /api/feed` (shows platform-wide activity for discovery)
- ✅ **Group activity feeds** - `GET /api/groups/:slug/feed` (shows group-specific activity)
- ✅ **Activity aggregation** with time windows (60-min for members, 30-min for RSVPs)
- ✅ **Visibility inheritance** from parent entities (groups/events)
- ✅ **Two-activity pattern** for private groups (detailed + anonymized for privacy)
- ✅ **Comprehensive event listeners** for all core MVP activity types
- ✅ **Bluesky event ingestion** - Events synced from Bluesky appear in activity feeds
- ✅ **Backend: Event-specific feed endpoint** - `GET /api/events/:slug/feed` (controller and service implemented)
- ✅ **Frontend components** - Sitewide feed, group feed, and event feed display with navigation
- ✅ **Activity types implemented:**
  - `group.created` - New group creation (public groups in sitewide feed)
  - `member.joined` - Member joins group (60-min aggregation)
  - `event.created` - Event creation (public events in sitewide feed + group feed, **supports standalone events**)
  - `event.rsvp` - Event RSVPs (30-min aggregation in group feed)
  - `event.updated` - Event details changed (group feed)
  - `group.updated` - Group details changed (group feed)
  - `group.milestone` - Membership milestones (10, 25, 50, 100, 250, 500, 1k, 2.5k, 5k, 10k)
  - `group.activity` - Anonymized activities for private entities (sitewide social proof)

**Key Implementation Files:**
- **Backend Entity**: `src/activity-feed/infrastructure/persistence/relational/entities/activity-feed.entity.ts`
- **Backend Service**: `src/activity-feed/activity-feed.service.ts`
- **Backend Controllers**:
  - `src/activity-feed/activity-feed.controller.ts` (group feeds)
  - `src/activity-feed/sitewide-activity-feed.controller.ts` (sitewide feed)
  - `src/activity-feed/event-activity-feed.controller.ts` (event feeds)
- **Backend Listener**: `src/activity-feed/activity-feed.listener.ts`
- **Database Migration**: `src/database/migrations/1760956752292-CreateActivityFeedTable.ts`
- **Tests**: `src/activity-feed/*.spec.ts`
- **Frontend Components**:
  - `openmeet-platform/src/components/activity-feed/SitewideFeedComponent.vue` (used on FeedPage and HomeUserPage)
  - `openmeet-platform/src/components/group/GroupActivityFeedComponent.vue` (used on GroupPage)
  - `openmeet-platform/src/components/event/EventActivityFeedComponent.vue` (used on EventPage)
- **Frontend API Client**: `openmeet-platform/src/api/activity-feed.ts`
- **Feature Flag**: `openmeet-platform/src/composables/useFeatureFlag.ts` (useShowActivityFeed composable)

**Not Yet Implemented:**
- ⬜ **Retention cleanup job** - 60-day automatic deletion policy
- ⬜ **RSVP cancellation activities** - Intentionally not tracked (negative activity)
- ⬜ **Future activity types** - Chat summaries, polls, announcements, photos, anniversaries

## Quick Reference: Key Architectural Decisions

**1. Visibility Inheritance**
- Activities ALWAYS inherit visibility from parent entity (group/event)
- See `ActivityFeedService.mapVisibility()` at line 123-136
- Never set visibility manually

**2. Two-Activity Pattern for Private Groups**
- Detailed activity (members_only) → Group feed
- Anonymized activity (public) → Sitewide feed
- See `ActivityFeedListener.handleGroupMemberAdded()` at line 78-96

**3. Smart Aggregation**
- Time-window aggregation reduces write volume by 70-90%
- Member joins: 60-minute windows
- See `ActivityFeedService.create()` at line 54-68

**4. Metadata for Frontend Display**
- Store slugs/names in JSONB to avoid JOINs
- See `buildMetadata()` at line 202-232

**5. Event-Driven Architecture**
- Services emit events, listeners create activities
- Pattern: `@OnEvent('chat.group.member.add')`
- See `ActivityFeedListener` at line 24-103

## Business Context

### Problem Statement
Users create groups but we don't see engagement - people aren't joining or interacting. The platform lacks visibility into:
- What's happening across the site (social proof for growth)
- Group activity (to attract new members)
- Event momentum (to drive RSVPs)
- Whether the community is active (credibility for new users)

### Why We Need This System
1. **Growth**: Public sitewide feed shows platform is active → increases signups
2. **Discovery**: Users find relevant groups and events through activity signals
3. **Engagement**: Members see group activity → increases participation
4. **Retention**: Active feeds prove value → reduces churn
5. **Social Proof**: "3 people joined, 5 events created today" builds credibility

### Impact on Users/Business
- **New visitors**: See active community → higher signup conversion
- **Logged-in users**: Discover relevant groups/events → higher engagement
- **Group organizers**: Activity attracts members → stronger communities
- **Event hosts**: RSVP momentum visible → better attendance
- **Business**: More engagement = more retention = more growth

## Goals & Success Metrics

### Primary Goals
1. Increase group join rate by 40% (proof of life attracts members)
2. Increase event RSVP rate by 25% (momentum drives participation)
3. Increase signup conversion by 20% (active feeds prove value)
4. Provide engagement transparency without privacy leaks

### Success Metrics
- **Discovery**: % of group joins from activity feed clicks
- **Engagement**: % of users who view feeds daily
- **Conversion**: Signup rate for visitors who view sitewide feed
- **Privacy**: Zero incidents of private data exposure
- **Performance**: 95th percentile load time < 1 second

### Key Performance Indicators (KPIs)
- Daily active feed viewers
- Feed-driven group joins
- Feed-driven event RSVPs
- Average feed dwell time
- Feed refresh rate (how often users check)

## System Requirements

### Functional Requirements

#### FR1: Three Feed Types
1. **Sitewide Feed** (`/feed`, homepage)
   - Public view: Show platform activity (social proof)
   - Authenticated view: Personalized to user's groups/events
   - Goal: Discovery + engagement

2. **Group Feed** (`/groups/{slug}/activity`)
   - Public preview: Limited activity (proof of life)
   - Member view: Full activity details
   - Goal: Attract and engage members

3. **Event Feed** (`/events/{slug}/activity`)
   - Public preview: High-level activity (RSVPs, updates)
   - Attendee view: Full details (discussions, check-ins)
   - Goal: Build event momentum

#### FR2: Activity Types

**Core Activities (MVP)**
- Group created
- Member joined group (aggregated)
- Event created
- Event RSVP added (aggregated)
- Group milestone reached (10, 25, 50, 100... members)
- Group updated
- Event updated

**Future Activities (Post-MVP)**
- Chat activity summary (e.g., "12 members discussing in chat")
- Chat topics extracted (e.g., "Discussing TypeScript patterns")
- Event attendance confirmed
- Poll created/completed
- Announcement posted
- Member role changed (promoted to moderator)
- Photo/content shared

#### FR3: Privacy-Aware Activity Display

**Public Feed Rules:**
- Private groups: Show existence, not details
  - ✅ "A private group was created"
  - ✅ "Private groups had 15 new members today"
  - ❌ "Tech Insider group (private) added 3 members" (no group name)

- Private events: Show existence, not details
  - ✅ "A private event was created"
  - ✅ "12 people RSVPed to private events today"
  - ❌ Event names, locations, or creator names

- Public groups/events: Show full details
  - ✅ "Sarah Chen created 'Coffee Meetup' in Tech Talks"
  - ✅ "12 people joined Running Club in the last hour"

**Member/Attendee Feed Rules:**
- Members see full details for their groups
  - "Sarah Chen created event 'Leadership Workshop' (Private)"
  - "Alex, Jordan, and 3 others joined this group"

- Non-members see limited preview
  - "Recent event created" (no name/details)
  - "5 new members this week" (no names)

#### FR4: Aggregation

**Time-Based Windows (Configurable per Activity Type):**
- Member joins: 1-hour windows (recent), daily totals (historical)
- Event RSVPs: 30-minute bursts (show momentum)
- Chat activity: Hourly summaries (recent), daily (historical)
- Updates/edits: Daily summaries

**Aggregation Display:**
- 1-2 actors: Show individual names
  - "Sarah and Jordan joined this group"
- 3-5 actors: Show all names
  - "Sarah, Jordan, Alex, Taylor, and Morgan joined"
- 6+ actors: Show sample + count
  - "Sarah, Jordan, Alex, and 12 others joined this group"
  - Expandable: "See all 15 members"

**Aggregation Keys:**
Format: `{activityType}:{scope}:{targetId}:{timeWindow}`
- Example: `member.joined:group:42:2025-01-15T14` (hourly)
- Example: `member.joined:group:42:2025-01-15` (daily)

#### FR5: Real-Time Updates
- Feed should update without full page refresh
- Not instant (WebSocket), but periodic polling acceptable
- Suggested: Poll every 30-60 seconds when feed is visible
- "New activity" indicator when updates available
- Smooth infinite scroll pagination

### Non-Functional Requirements

#### NFR1: Performance
- **Load Time**: 95th percentile < .5 second
- **Pagination**: Load 10-20 items per page
- **Infinite Scroll**: Preload next page when 80% scrolled
- **Caching Strategy**:
  - Public sitewide feed: Cache 60 seconds
  - Personalized feeds: Cache 30 seconds per user
  - Group/event feeds: Cache 60 seconds

#### NFR2: Privacy & Security

**Visibility Inheritance Model:**
- Activity visibility is ALWAYS derived from parent entity (group/event)
- Activities do NOT have independent visibility - they inherit from their source
- Visibility field is a denormalized cache for performance (indexed queries)
- Single source of truth: Group.visibility and Event.visibility

**Visibility Mapping Rules:**
```
Parent Entity Visibility → Activity Visibility
─────────────────────────────────────────────
Group: 'Public'         → 'public'
Group: 'Authenticated'  → 'authenticated'
Group: 'Private'        → 'members_only'

Event: 'Public'         → 'public'
Event: 'Authenticated'  → 'authenticated'
Event: 'Private'        → 'members_only'
```

**Two-Activity Pattern for Private Entities:**
When private groups/events have activity, create TWO activities:
1. **Detailed activity** (members_only) - For group/event feed with full details
   - Shows actor names, group names, event details
   - Only visible to members/attendees
2. **Anonymized activity** (public) - For sitewide feed as social proof
   - "A private group was created" (no identifying info)
   - "Private groups had 15 new members today" (aggregated count)
   - Shows platform is active without privacy leaks

**Activity Visibility Levels:**
- `public`: Anyone can see (from public groups/events)
- `authenticated`: Logged-in users only (from authenticated groups/events)
- `members_only`: Group members / event attendees only (from private groups/events)
- `private`: Reserved for internal system use (never displayed in feeds)

**Visibility Refresh:**
- When group/event visibility changes, update all related activities
- Use database trigger or event listener: `@OnEvent('group.updated')`
- Batch update all activities for changed entity

**Security Guarantees:**
- **Zero Private Data Leaks**: Strict enforcement via visibility field + membership checks
- **Query Filtering**: All queries MUST filter by visibility AND membership
- **Audit Trail**: Log all feed accesses for security review
- **Privacy by Default**: Private entities create anonymized activities for public consumption
- **No Arbitrary Visibility**: Activities cannot have visibility set manually - always computed

#### NFR3: Scalability
- **Database**: Index on `(group_id, created_at DESC)`, `(feed_scope, created_at DESC)`
- **Activity Volume**: Support 10,000+ activities per day
- **Aggregation**: Reduce write volume by 70-90% for high-frequency events
- **Data Retention**: 60-day hard delete policy
  - Activities older than 60 days are permanently deleted
  - No archival, no exceptions, no backfill needed
  - Daily cleanup job at 3am: `DELETE FROM activity_feed WHERE created_at < NOW() - INTERVAL '60 days'`
  - Batch delete 10,000 records per run
  - Keeps database small and performant
- **Storage Estimate**: ~50k-100k records maximum (60 days × ~1k-2k activities/day)

#### NFR4: Maintainability
- **Event-Driven Architecture**: Use existing EventEmitter2 pattern
- **Decoupled**: Services don't know about feeds (listeners handle it)
- **Configurable**: Aggregation windows, visibility rules in config
- **Extensible**: Easy to add new activity types

#### NFR5: Analytics Integration (Future)
- Track feed view counts
- Measure click-through rates (feed → group/event)
- Conversion tracking (feed view → signup, RSVP, join)
- A/B testing capability for feed algorithms

## Technical Design

### Architecture

#### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                              │
│  (Create group, Join group, Create event, RSVP, etc.)      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  SERVICE LAYER                               │
│  GroupService, EventService, GroupMemberService, etc.       │
│  - Perform business logic                                    │
│  - Save to database                                          │
│  - Emit events via EventEmitter2                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ emit('group.created', payload)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                EVENT EMITTER (NestJS)                        │
│  Broadcasts events to multiple listeners                    │
└───┬─────────────────┬─────────────────┬─────────────────────┘
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────┐    ┌─────────────┐    ┌──────────────┐
│ Matrix  │    │  Activity   │    │  Analytics   │
│Listener │    │Feed Listener│    │  Listener    │
│(existing)    │   (NEW)     │    │  (existing)  │
└─────────┘    └──────┬──────┘    └──────────────┘
                      │
                      │ create() with aggregation logic
                      ▼
        ┌──────────────────────────────────┐
        │  ActivityFeedService             │
        │  - Check for existing activity   │
        │  - Aggregate if within window    │
        │  - Apply visibility rules        │
        │  - Save to database              │
        └─────────────┬────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │   activity_feed TABLE            │
        │   (PostgreSQL with JSON metadata)│
        └─────────────┬────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │   ActivityFeedController         │
        │   GET /api/feed (sitewide)       │
        │   GET /api/groups/:slug/activity │
        │   GET /api/events/:slug/activity │
        └─────────────┬────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │   Frontend: ActivityFeed.vue     │
        │   - Infinite scroll              │
        │   - Polling for updates          │
        │   - Smart rendering              │
        └──────────────────────────────────┘
```

#### Data Flow

**Example: User joins a group**

1. User clicks "Join" button
2. `GroupService.joinGroup()` called
3. Service saves membership to `group_members` table
4. Service emits: `eventEmitter.emit('chat.group.member.add', {...})`
5. **ActivityFeedListener** receives event
6. Listener calls `ActivityFeedService.create()` with:
   - `activityType: 'member.joined'`
   - `feedScope: 'group'`
   - `groupId: 42`
   - `actorId: userId`
   - `aggregationStrategy: 'time_window'`
   - `aggregationWindow: 60` (minutes)
7. Service checks for existing activity in last 60 minutes
8. If exists: Append userId to `actor_ids[]`, increment `aggregated_count`
9. If not: Create new activity entry
10. Set `visibility` based on group visibility:
    - Public group → `public`
    - Private group → `members_only` for group feed, `public` (anonymized) for sitewide
11. Save to `activity_feed` table
12. Frontend polls and displays: "3 people joined this group in the last hour"

#### Integration Points

**Existing Systems:**
- **EventEmitter2**: Already emitting events (`group.created`, `group.updated`, etc.)
- **Matrix Listener**: Pattern to follow for ActivityFeedListener
- **Analytics Service**: Can consume feed data for metrics
- **Audit Logger**: Can track feed accesses

**New Integrations Needed:**
- Emit additional events: `event.created`, `event.rsvp.added`, `group.milestone.reached`
- Resolve slugs to IDs in listeners (helper service)
- User service: `findByIds()` for populating aggregated actors

**Future Integrations:**
- Notification system (when built)
- WebSocket for real-time updates
- Chat topic extraction (NLP service)
- Recommendation engine (ML-based personalization)

### Implementation Details

#### Database Schema

**Implementation:** See migration file at `src/database/migrations/1760956752292-CreateActivityFeedTable.ts:12-113`

The `activityFeed` table includes:
- **Activity identification**: `activityType`, `feedScope`
- **Target references**: `groupId`, `eventId` (with CASCADE delete)
- **Actor tracking**: `actorId` (primary actor), `actorIds[]` (for aggregation)
- **Metadata**: JSONB field for flexible data (slugs, names, etc.)
- **Privacy control**: `visibility` field (derived from parent entity)
- **Aggregation**: `aggregationKey`, `aggregationStrategy`, `aggregatedCount`
- **Timestamps**: `createdAt`, `updatedAt`

**Key Indexes** (optimized for query patterns):
- `idx_activityFeed_group_feed` - Group feed queries (groupId, updatedAt DESC)
- `idx_activityFeed_event_feed` - Event feed queries (eventId, updatedAt DESC)
- `idx_activityFeed_sitewide_feed` - Sitewide queries (feedScope, visibility, updatedAt DESC)
- `idx_activityFeed_aggregation_key` - Fast aggregation lookups
- `idx_activityFeed_created_at` - Retention cleanup queries

**Entity Definition:** See `src/activity-feed/infrastructure/persistence/relational/entities/activity-feed.entity.ts:18-105`

#### API Specifications

**Implementation:** See controller at `src/activity-feed/activity-feed.controller.ts:22-79`

**Endpoint 1: Group Activity Feed** (✅ Implemented)

```
GET /api/groups/:slug/feed
```

**Query Parameters:** (See DTO at `src/activity-feed/dto/activity-feed-query.dto.ts`)
- `limit` (default: 20) - Items per page
- `offset` (default: 0) - Pagination offset
- `visibility` (array) - Filter visibility levels

**Authorization:**
- Public endpoint with optional auth
- Visibility filtering based on membership (frontend responsibility)

**Response:** Array of `ActivityFeedEntity` objects with:
- Activity metadata (type, scope, timestamps)
- Actor IDs and aggregation data
- Group/event references (via metadata)
- Visibility level

**Endpoint 2: Sitewide Activity Feed** (✅ Implemented)

```
GET /api/feed
```

**Implementation:** See controller at `src/activity-feed/sitewide-activity-feed.controller.ts`

**Query Parameters:** Same as group feed
- `limit` (default: 20) - Items per page
- `offset` (default: 0) - Pagination offset

**Authorization:**
- Public endpoint with optional auth
- Guests see only 'public' activities
- Authenticated users see 'public' + 'authenticated' activities

**Response:** Array of `ActivityFeedEntity` objects

**Endpoint 3: Event Activity Feed** (✅ Backend Implemented)

```
GET /api/events/:slug/feed
```

**Implementation:** See controller at `src/activity-feed/event-activity-feed.controller.ts` and service method at `src/activity-feed/activity-feed.service.ts:124-149`

**Query Parameters:**
- `limit` (default: 20) - Items per page
- `offset` (default: 0) - Pagination offset
- `visibility` (array) - Filter visibility levels

**Authorization:**
- Public endpoint with optional auth
- Visibility filtering based on event membership

**Response:** Array of `ActivityFeedEntity` objects with event-scoped activities

**Endpoints Not Yet Implemented:**
- ⬜ `GET /api/feed/stats` - Activity stats (future enhancement)

#### Key Processes

**Process 1: Activity Creation with Aggregation**

**Implementation:** See `ActivityFeedService.create()` at `src/activity-feed/activity-feed.service.ts:27-87`

Key steps:
1. Compute visibility from parent entity using `mapVisibility()` method (line 47-49)
2. Handle aggregation strategy:
   - **Time window aggregation** (line 54-68): Check for existing activity within window, aggregate if found
   - **No aggregation**: Create single entry (line 81-86)
3. Build aggregation key using `buildTimeWindowKey()` (line 183-196)
4. Aggregate into existing entry via `aggregateIntoExisting()` (line 162-178) or create new via `createNewEntry()` (line 141-157)
5. Store slugs/names in metadata via `buildMetadata()` (line 202-232) for frontend display

**Process 2: Visibility Mapping Function**

**Implementation:** See `ActivityFeedService.mapVisibility()` at `src/activity-feed/activity-feed.service.ts:123-136`

Maps entity visibility to activity visibility:
- `GroupVisibility.Public` → `'public'`
- `GroupVisibility.Authenticated` → `'authenticated'`
- `GroupVisibility.Private` → `'members_only'`

This is the ONLY way to set activity visibility - never set manually.

**Process 3: Event Listeners**

**Implementation:** See `ActivityFeedListener` at `src/activity-feed/activity-feed.listener.ts:11-185`

Currently handles:
- ✅ `chat.group.member.add` - Member joins group (line 24-103)
  - Creates detailed activity for group feed
  - Creates anonymized sitewide activity for private groups (line 78-96)
- ✅ `event.created` - Event created (line 105-184)
  - Creates activity in group feed scope
  - No aggregation for event creations

**Process 4: Feed Query with Privacy Filtering**

**Implementation:** See `ActivityFeedService.getGroupFeed()` at `src/activity-feed/activity-feed.service.ts:92-117`

Query strategy:
1. Filter by `feedScope` and target ID (groupId/eventId)
2. Apply visibility filter if provided
3. Order by `updatedAt DESC` (shows most recent activity)
4. Pagination via `take` and `skip`

### Security & Compliance

#### Privacy Enforcement

**Rule 1: Private Entity Anonymization**
- Private groups/events MUST NOT expose names, descriptions, or member lists publicly
- Sitewide feed shows existence only: "A private event was created"
- No aggregation of private activities with identifiable info

**Rule 2: Visibility Cascading**
- Activity inherits visibility from source entity (group/event)
- Cannot promote visibility (private → public) without entity owner permission
- Can demote visibility (public → private) at any time

**Rule 3: Member-Only Activities**
- Role changes, announcements, internal updates = 'members_only'
- Never exposed to sitewide feed, even anonymized
- Only visible in group/event-specific feeds

**Rule 4: Query-Level Enforcement**
- Never rely on frontend filtering for privacy
- All queries MUST include visibility WHERE clause
- Use parameterized queries to prevent injection
- Audit log all feed accesses for security review

#### Data Protection

**Personal Information Handling:**
- Actor names stored as foreign keys (user_id), not duplicated text
- Metadata JSONB should not contain PII (use references instead)
- Deleted users: actor_id becomes NULL, activity remains with generic text

**GDPR Compliance:**
- User deletion: SET actor_id = NULL for all their activities
- Right to erasure: Remove user from all actor_ids arrays
- Data export: Include user's activities in export request
- Retention policy: Archive activities older than 2 years (configurable)

**Access Control:**
- Public feed: No authentication required
- Personalized feed: JWT authentication
- Group/event feeds: Membership verification via existing guards
- Admin endpoints: Role-based access control (RBAC)

### Monitoring & Maintenance

#### Key Metrics to Track

**Performance Metrics:**
- Feed load time (p50, p95, p99)
- Database query time
- Cache hit rate
- Aggregation efficiency (writes saved)

**Business Metrics:**
- Daily active feed viewers
- Feed-driven conversions (joins, RSVPs)
- Activity creation rate
- Most viewed activity types

**System Health:**
- Event emission failures
- Aggregation errors
- Query timeout rate
- Privacy violation alerts (should be zero)

#### Monitoring Strategy

**Application Monitoring:**
- Log all activity creation events (INFO level)
- Log aggregation hits (DEBUG level)
- Log privacy violations (ERROR level, alert immediately)
- Track slow queries (> .5 second)

**Database Monitoring:**
- Monitor index usage
- Track table size growth
- Alert on slow queries
- Monitor aggregation key distribution

**User Experience Monitoring:**
- Track frontend load times (Real User Monitoring)
- Monitor infinite scroll performance
- Track polling efficiency
- Measure engagement time in feed

#### Maintenance Procedures

**Daily:**
- Review error logs for privacy violations
- Check aggregation performance
- Monitor cache hit rates

**Weekly:**
- Analyze slow queries
- Review activity type distribution
- Check backlog of events (should be < 1 minute delay)

**Monthly:**
- Archive old activities (> 90 days to cold storage)
- Vacuum database tables
- Review and optimize indexes
- Analyze feed engagement metrics

**Quarterly:**
- Privacy audit: Manual review of sample activities
- Performance review: Optimize slow queries
- Capacity planning: Forecast storage needs

## Testing Strategy

### Unit Testing

**ActivityFeedService:**
- Test aggregation logic (time windows, daily)
- Test visibility determination (public/private)
- Test actor array management
- Test privacy filtering

**ActivityFeedListener:**
- Test event handling for each activity type
- Test error handling (failed aggregation)
- Test idempotency (duplicate events)

### Integration Testing

**End-to-End Activity Flow:**
1. Create group → Verify activity created
2. Join group → Verify aggregation works
3. Reach milestone → Verify milestone activity
4. Query feed → Verify visibility filtering

**Privacy Testing:**
1. Create private group → Verify public feed shows anonymized
2. Join private group → Verify member feed shows details
3. Query as guest → Verify no private data exposed
4. Query as member → Verify full details visible

### Performance Testing

**Load Testing:**
- Simulate 1000 activities/minute
- Measure aggregation performance
- Test concurrent feed queries (100+ simultaneous)
- Verify cache effectiveness

**Stress Testing:**
- Test with 1M+ activities in database
- Measure query performance degradation
- Test aggregation with 100+ actors
- Verify infinite scroll with deep pagination

### Security Testing

**Privacy Validation:**
- Attempt to access private activities without permission
- Verify visibility filtering cannot be bypassed
- Test for SQL injection in feed queries
- Verify deleted user data is properly anonymized

**Penetration Testing:**
- Attempt to enumerate private groups via feed
- Test for timing attacks (private vs public)
- Verify rate limiting on feed endpoints

## Deployment Strategy

### Phased Rollout

**Phase 1: Infrastructure (Week 1)**
- Create database migration
- Deploy ActivityFeedService and Listener
- Deploy daily cleanup job (retention enforcement)
- Verify no errors in production logs

**Phase 2: Backend APIs (Week 2)**
- Deploy feed API endpoints
- Enable for beta users (10% rollout)
- Monitor performance and errors
- Fix any issues found

**Phase 3: Frontend Integration (Week 3)**
- Deploy ActivityFeed.vue component
- Enable on group pages first (50% rollout)
- Add to sitewide feed (25% rollout)
- Monitor engagement metrics

**Phase 4: Full Launch (Week 4)**
- Enable for 100% of users
- Announce feature to community
- Monitor conversion metrics
- Gather user feedback

### Configuration Management

**Environment Variables:**
```
ACTIVITY_FEED_ENABLED=true
ACTIVITY_FEED_CACHE_TTL=60  # seconds
ACTIVITY_FEED_PAGE_SIZE=50
ACTIVITY_FEED_AGGREGATION_WINDOW=60  # minutes
ACTIVITY_FEED_RETENTION_DAYS=60  # days to keep activities before deletion
ACTIVITY_FEED_POLLING_INTERVAL=30  # seconds
```

**Feature Flags:**
- `activity_feed_sitewide`: Enable sitewide feed
- `activity_feed_group`: Enable group feeds
- `activity_feed_event`: Enable event feeds
- `activity_feed_realtime`: Enable polling updates
- `activity_feed_chat_topics`: Enable chat topic extraction

### Rollback Procedures

**If Critical Issues Found:**
1. Disable feature flag: `activity_feed_enabled=false`
2. Frontend gracefully hides feed components
3. Backend stops processing events (listeners disabled)
4. Database remains intact (rollback unnecessary)
5. Investigate issue in staging environment
6. Deploy fix and re-enable

**Database Rollback:**
```sql
-- If needed, remove all activity feed data
DROP TABLE activity_feed CASCADE;

-- Or purge all data but keep table structure
TRUNCATE TABLE activity_feed;
```

## Future Considerations

### Phase 2 Features

**Chat Topic Extraction:**
- Use NLP to extract discussion topics from chat
- Activity: "Tech Talks discussing 'TypeScript patterns'"
- Privacy: Only if group is public, or for members only
- Technology: Basic keyword extraction → Later: LLM-based topic modeling

**Notifications Integration:**
- "Your group has 5 new members" (daily digest)
- "12 people RSVPed to your event in the last hour"
- User preference controls (notification settings)
- Rate limiting (max 3 notifications/day from feeds)

**Advanced Personalization:**
- ML-based feed ranking (show most relevant activities first)
- "Recommended for you" section based on interests
- "Trending in your area" location-based filtering
- "Similar to groups you're in" recommendations

**Rich Activity Types:**
- Photo shared in group
- Poll results
- Event attendance confirmed (post-event)
- Member anniversary (1 year in group)
- Group collaboration milestones

**Analytics Dashboard:**
- For group organizers: See growth trends, engagement metrics
- For platform admins: Activity heatmaps, conversion funnels
- A/B testing: Test different feed algorithms

### Scalability Considerations

**When to Scale:**
- 100k+ activities/day: Consider read replicas
- 1M+ total activities: Implement time-based partitioning
- 10k+ concurrent users: Add Redis caching layer
- Real-time needs: Migrate to WebSocket from polling

**Potential Optimizations:**
- Denormalize actor names in metadata (avoid joins)
- Separate cold storage for activities > 90 days
- CDN caching for public sitewide feed
- Event sourcing for audit trail

### Technical Debt Considerations

**Known Trade-offs:**
- Aggregation creates eventual consistency (acceptable for feeds)
- Polling instead of WebSocket (simpler but less real-time)
- JSON metadata less queryable than normalized tables
- No full-text search on activities (add Elasticsearch later)

**Refactoring Opportunities:**
- Extract visibility logic into separate service
- Create ActivityFactory for cleaner activity creation
- Consider CQRS pattern (separate read/write models)
- Migrate to event sourcing for full audit trail

## Appendix

### Related Documents
- `event-visibility-and-permissions.md` - Privacy model for events
- `chatroom-management-system.md` - Chat integration points
- `architecture-issues.md` - System-wide architectural concerns

### Activity Type Reference

#### Core Activity Types (MVP)

| Activity Type | Feed Scopes | Visibility | Aggregation | Display |
|--------------|-------------|------------|-------------|---------|
| `group.created` | sitewide, group | Inherits from group | none | "Sarah created Tech Talks" |
| `member.joined` | group, sitewide | public / members_only | 1-hour windows | "3 people joined" |
| `event.created` | sitewide, group, event | Inherits from event | none | "Mike created Coffee Meetup" |
| `event.rsvp` | event, group | public / members_only | 30-min windows | "12 people RSVPed" |
| `group.milestone` | group, sitewide | public | none | "Reached 50 members!" |
| `group.updated` | group | members_only | daily | "Group details updated" |
| `event.updated` | event, group | members_only | daily | "Event details changed" |

#### Future Activity Types

| Activity Type | Feed Scopes | Purpose |
|--------------|-------------|---------|
| `chat.activity` | group | "12 members discussing in chat" |
| `chat.topic` | group | "Discussing TypeScript patterns" |
| `event.attended` | event, group | "18 members attended" |
| `poll.created` | group | "New poll: What time works best?" |
| `poll.completed` | group | "Poll results: 7pm won with 12 votes" |
| `announcement.posted` | group | "New announcement from organizers" |
| `member.promoted` | group | "Sarah promoted to Moderator" |
| `photo.shared` | event, group | "Alex shared 5 photos" |
| `milestone.anniversary` | group | "Tech Talks turned 1 year old!" |

### Visibility Inheritance Summary

**Core Principle: Activities inherit visibility from their parent entity (group or event)**

**Mapping Rules:**
```
Group/Event Visibility  →  Activity Visibility  →  Who Can See
─────────────────────────────────────────────────────────────────
Public                  →  'public'             →  Everyone
Authenticated           →  'authenticated'      →  Logged-in users
Private (group feed)    →  'members_only'       →  Members only
Private (sitewide feed) →  'public' (anon)      →  Everyone (no details)
```

**Implementation Rules:**
1. **Never set visibility manually** - Always use `mapVisibility(entity.visibility)`
2. **Private entities use two-activity pattern**:
   - Detailed activity (`members_only`) → Group/event feed
   - Anonymized activity (`public`) → Sitewide feed (for social proof)
3. **Refresh on entity change** - When group/event visibility changes, update all activities
4. **Query-time filtering** - Always filter by visibility AND user membership
5. **Denormalization** - Visibility is cached for performance, but derived from parent

**Example: Private Group Member Join**
```typescript
// Activity #1: For group feed (members see details)
{
  activityType: 'member.joined',
  feedScope: 'group',
  groupId: 42,
  actorId: 101,
  visibility: 'members_only',  // Computed from group.visibility='Private'
  metadata: { userName: 'Sarah Chen', groupName: 'Secret Book Club' }
}

// Activity #2: For sitewide feed (public sees anonymized)
{
  activityType: 'private.member.joined',
  feedScope: 'sitewide',
  groupId: null,  // Don't expose which group
  actorId: null,  // Don't expose who
  visibility: 'public',  // Anyone can see (for social proof)
  metadata: { entityType: 'private_group' }  // For counting only
}
```

### Privacy Decision Matrix

| Entity Type | Public Feed | Group Members Feed | Logged-in Users |
|------------|-------------|-------------------|-----------------|
| Public Group | Full details | Full details | Full details |
| Private Group | "A private group was created" | Full details | "Private groups had activity" |
| Public Event | Full details | Full details | Full details |
| Private Event | "A private event was created" | Full details (if member) | "Private events had activity" |
| Group Chat | Not shown | "Active discussion" or topic | Not shown |
| Member Names | Shown (public groups) | Always shown | Shown (public groups) |
| RSVP Count | Shown | Shown | Shown |
| RSVP Names | Shown (public events) | Always shown | Shown (public events) |

### Aggregation Configuration Examples

```typescript
// Configuration per activity type
const AGGREGATION_CONFIG = {
  'member.joined': {
    strategy: 'time_window',
    windowMinutes: 60,
    displayThreshold: 3, // Show individual names if < 3
  },
  'event.rsvp': {
    strategy: 'time_window',
    windowMinutes: 30,
    displayThreshold: 5,
  },
  'chat.activity': {
    strategy: 'daily',
    displayThreshold: 1, // Always aggregate
  },
  'group.created': {
    strategy: 'none', // Never aggregate
  },
  'event.created': {
    strategy: 'none',
  },
  'group.milestone': {
    strategy: 'none',
  },
};
```

### Query Performance Benchmarks

**Target Performance (with proper indexes):**
- Sitewide feed (50 items): < 200ms
- Group feed (50 items): < 150ms
- Event feed (50 items): < 100ms
- Activity creation: < 50ms
- Aggregation check + update: < 30ms

**Index Coverage:**
- `idx_group_feed`: Covers group feed queries
- `idx_sitewide_feed`: Covers sitewide queries
- `idx_aggregation_lookup`: Enables fast aggregation checks
- `idx_visibility_filter`: Speeds up privacy filtering

### Events and Activity Types (Implementation Status)

**Activity Feed Listeners Implemented:**
- ✅ `group.created` → Creates `group.created` activity (src/activity-feed/activity-feed.listener.ts:26-105)
  - No aggregation
  - Scoped to group feed + sitewide for public groups
- ✅ `chat.group.member.add` → Creates `member.joined` activity (src/activity-feed/activity-feed.listener.ts:107-189)
  - Aggregated in 60-minute windows
  - Creates anonymized sitewide activity for private groups
  - Checks for group milestones after each join
- ✅ `event.created` → Creates `event.created` activity (src/activity-feed/activity-feed.listener.ts:212-355)
  - No aggregation
  - Scoped to: group feed (if event has group) + sitewide feed (if event is public)
  - **Supports standalone events**: Public standalone events appear in sitewide feed
  - Display format: "[Actor] created [Event]" (standalone) or "[Actor] created [Event] in [Group]"
- ✅ `event.rsvp.added` → Creates `event.rsvp` activity (src/activity-feed/activity-feed.listener.ts:272-356)
  - Aggregated in 30-minute windows (shows momentum)
  - Scoped to group feed
  - Skips standalone events
- ✅ `event.updated` → Creates `event.updated` activity (src/activity-feed/activity-feed.listener.ts:358-422)
  - No aggregation
  - Scoped to group feed
  - Skips standalone events
- ✅ `group.updated` → Creates `group.updated` activity (src/activity-feed/activity-feed.listener.ts:424-468)
  - No aggregation
  - Scoped to group feed
- ✅ **Group Milestones** → Creates `group.milestone` activity (src/activity-feed/activity-feed.listener.ts:474-531)
  - Triggered when member count hits 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000
  - Scoped to group feed + sitewide for public groups
  - Celebrates growth and creates FOMO

**Events Being Emitted:**
- ✅ `group.created` - Emitted from GroupService (src/group/group.service.ts:253-258)
- ✅ `group.updated` - Emitted from GroupService (src/group/group.service.ts:601-605)
- ✅ `group.deleted` - Emitted but not used (no activity for deletions)
- ✅ `chat.group.member.add` - Already emitted (pre-existing)
- ✅ `event.created` - Already emitted (pre-existing)
- ✅ `event.updated` - Emitted from EventManagementService (src/event/services/event-management.service.ts:862-867)
- ✅ `event.rsvp.added` - Emitted from EventAttendeeService (src/event-attendee/event-attendee.service.ts:181-188)

**Future Events (Not Implemented):**
- ⬜ `event.rsvp.removed` - Negative activity, intentionally not tracked
- ⬜ `event.attendance.confirmed` - Post-event tracking (future)
- ⬜ `chat.message.sent` - Could aggregate to `chat.activity` (future)
- ⬜ `poll.created` - Polls feature (future)
- ⬜ `poll.completed` - Polls feature (future)

### Key Implementation Concepts

**Visibility Derivation:**
- Activity visibility is ALWAYS computed from parent entity, never set manually
- Use `mapVisibility(entity.visibility)` as single source of truth
- Store result as denormalized field for fast queries

**Two-Activity Pattern:**
- Private entities create TWO activities when activity occurs:
  1. Detailed version for members (shows names, details)
  2. Anonymized version for public (shows existence, no details)
- This allows social proof ("platform is active") without privacy leaks

**Visibility Refresh:**
- When group/event visibility changes, batch update all related activities
- Handle via event listener on `group.updated` / `event.updated`
- Ensures activity permissions always match parent entity permissions
