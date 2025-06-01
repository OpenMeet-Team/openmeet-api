# Comprehensive Calendar Integration Design

## Overview

This design document outlines the comprehensive calendar integration for OpenMeet, enabling seamless interoperability with external calendar applications (Google Calendar, Apple Calendar, Outlook) and providing internal calendar functionality for better event planning and conflict detection.

## User Stories & Scenarios

### Primary User Stories
1. **As an event creator**, I want to see my existing calendar when scheduling so I can avoid conflicts
2. **As an event attendee**, I want OpenMeet events to automatically appear in my calendar app
3. **As an event attendee**, I want to see upcoming OpenMeet events alongside my other commitments
4. **As an event creator**, I want to find available times that work for attendees
5. **As a group organizer**, I want to share our group calendar with members

### User Experience Scenarios

#### Scenario 1: Event Creator Scheduling
- User creates new event in OpenMeet
- System shows their external calendar availability
- Warns about conflicts with existing events
- Suggests optimal time slots

#### Scenario 2: Auto-Sync to External Calendars  
- User connects their calendar once
- All future OpenMeet events automatically appear in Google/Apple Calendar
- Updates sync automatically

#### Scenario 3: Internal Calendar View
- User views unified calendar showing OpenMeet + external events
- Can see context when deciding to attend new events
- Timeline view shows scheduling density

#### Scenario 4: Group Calendar Sharing
- Group has subscribable calendar feed
- Members can add to their calendar apps
- Public groups have public calendars

## Current State (Updated: May 31, 2025)

### ✅ **Phase 1 Complete - Foundation**

#### Calendar Source Management
- **CalendarSourceEntity**: Complete entity with support for Google, Apple, Outlook, and iCal URL sources
- **CalendarSourceService**: Full CRUD operations with tenant isolation and user ownership validation
- **CalendarSourceController**: REST endpoints for managing calendar connections
- **OAuth Support**: Access/refresh token management with proper encryption
- **Testing**: 13 comprehensive tests covering all CRUD operations and security
- **Files**: 
  - `src/calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity.ts`
  - `src/calendar-source/calendar-source.service.ts`
  - `src/calendar-source/calendar-source.controller.ts`
  - `src/calendar-source/calendar-source.service.spec.ts`

#### Calendar Feed Endpoints  
- **User Calendar Feeds**: `GET /calendar/my/calendar.ics` (secure, authenticated)
- **Group Calendar Feeds**: `GET /calendar/groups/:groupSlug/calendar.ics`
- **Security Enhanced**: User feeds now require JWT authentication and use `@AuthUser()` decorator
- **Performance Optimized**: Direct user ID usage eliminates database lookup (faster response)
- **CalendarFeedService**: Optimized service layer with proper domain boundaries
- **CalendarFeedController**: Secure endpoints with proper authentication guards
- **Date Range Filtering**: Optional start/end date parameters
- **Privacy Controls**: Public groups accessible to all, private groups require membership
- **Testing**: 20 comprehensive tests covering all scenarios (updated for new security model)
- **Files**:
  - `src/calendar-feed/calendar-feed.service.ts` - Optimized implementation
  - `src/calendar-feed/calendar-feed.controller.ts` - Updated security model
  - `src/calendar-feed/calendar-feed.service.spec.ts` - Updated tests
  - `src/calendar-feed/calendar-feed.controller.spec.ts` - Updated tests

#### Enhanced iCalendar Support
- **Multi-Event Export**: Added `generateICalendarForEvents()` method to ICalendarService
- **Timezone Handling**: Proper timezone support using `event.timeZone || 'UTC'`
- **EventSeries Support**: Full RRULE and recurrence pattern handling
- **RFC 5545 Compliance**: Complete iCalendar standard implementation
- **Files**: `src/event/services/ical/ical.service.ts`

#### Database Migration
- **Calendar Sources Table**: Complete migration ready for execution
- **User Calendar Preferences**: Structure prepared for user settings
- **Files**: `src/database/migrations/1748624400000-AddCalendarIntegration.ts`

#### Module Integration
- **CalendarSourceModule**: Properly configured with TenantModule, UserModule dependencies
- **CalendarFeedModule**: Integrated with UserModule, GroupModule, EventModule
- **App Module**: Both modules added to application imports
- **Files**: 
  - `src/calendar-source/calendar-source.module.ts`
  - `src/calendar-feed/calendar-feed.module.ts`
  - `src/app.module.ts`

### ✅ What Exists (Legacy)
- **Event Entity**: Full calendar fields (timezone, all-day, priority, etc.)
- **EventSeries Entity**: RFC 5545 compliant recurrence patterns
- **iCalendar Service**: Complete RFC 5545 implementation
- **Single Event Export**: `GET /events/:slug/calendar` returns .ics files
- **External Source Integration**: `sourceType`, `sourceId` fields for external events
- **Recurrence Support**: Full RRULE and EXDATE handling

### ✅ **Phase 2 In Progress - External Calendar Integration**

#### ✅ EventQueryService Enhancement - COMPLETE
- **Added `findUserEvents()` method**: Retrieves all events a user organizes or attends with optional date filtering
- **Added `findGroupEvents()` method**: Retrieves group events with privacy controls and date filtering  
- **Optimized Calendar Feed Service**: Now uses direct user ID from JWT instead of database lookup
- **Security Improvements**: User calendar feeds now require authentication and use `@AuthUser()` decorator
- **Performance**: Eliminated unnecessary `UserService.getUserBySlug()` database query
- **Files Updated**:
  - `src/event/services/event-query.service.ts` - Added new methods
  - `src/calendar-feed/calendar-feed.service.ts` - Uses user ID directly
  - `src/calendar-feed/calendar-feed.controller.ts` - Updated to `/my/calendar.ics` endpoint
  - Tests updated and passing (20/20)

#### ✅ External Calendar Service Foundation - COMPLETE WITH TENANT ISOLATION  
- **ExternalCalendarService**: Comprehensive service architecture with TDD approach
- **Google Calendar OAuth Integration**: Full OAuth flow implementation with real Google APIs
  - Authorization URL generation with proper scopes
  - OAuth code exchange with token handling
  - Access token refresh with error handling
  - Real Google Calendar API integration (Calendar v3)
- **Event Sync Implementation**: Fetches events from Google Calendar with proper data mapping
- **Tenant-Aware Architecture**: All methods accept tenant ID parameters for proper isolation
- **Database Storage**: External events stored in tenant-specific database schemas
- **Configuration Integration**: Uses existing Google OAuth config from codebase
- **Comprehensive Testing**: 32 tests passing with mocked Google and iCal APIs
- **Files**:
  - `src/external-calendar/external-calendar.service.ts` - Complete implementation with tenant support
  - `src/external-calendar/external-calendar.service.spec.ts` - Full test coverage
  - `src/external-calendar/external-calendar.module.ts` - Module configuration with TenantModule
  - `src/external-calendar/infrastructure/persistence/relational/entities/external-event.entity.ts` - New entity
  - `src/external-calendar/infrastructure/persistence/relational/repositories/external-event.repository.ts` - Tenant-aware repository

#### ✅ iCal URL Integration - COMPLETE
- **iCal URL Fetching and Parsing**: Complete implementation using `node-ical` library
  - HTTP fetching with 30-second timeout and proper error handling
  - Full iCal parsing with support for VEVENT components
  - Event filtering by date range (1 month ago to 1 year future)
  - All-day event detection and handling
  - Status mapping (CONFIRMED → busy, TENTATIVE → tentative, CANCELLED → free)
  - Content sanitization for security (removes HTML tags, limits length)
- **Apple Calendar Integration**: Delegates to iCal URL functionality
- **Error Handling**: Comprehensive error handling for network issues, timeouts, malformed data
- **Testing**: 11 additional tests covering all iCal scenarios
- **Files**:
  - `src/external-calendar/external-calendar.service.ts` - iCal implementation
  - `package.json` - Added `node-ical` dependency

#### ✅ **Phase 2 COMPLETE - External Event Storage** 
- **ExternalEvent Entity**: ✅ Database storage for cached external events with tenant isolation
- **ExternalEventRepository**: ✅ Tenant-aware repository with CRUD operations and upsert functionality
- **Database Migration**: ✅ Updated migration includes external_events table with proper constraints
- **Service Integration**: ✅ ExternalCalendarService now stores events in database using tenant-specific connections

#### ✅ **Phase 3: REST API Controllers & Availability - COMPLETE**
- ✅ **ExternalCalendarController**: OAuth flow, manual sync, connection testing
- ✅ **AvailabilityController**: Check availability and find conflicts  
- ✅ **AvailabilityService**: Business logic for conflict detection
- ✅ **Enhanced CalendarSourceService**: ULID-based methods for user-facing APIs
- ✅ **Enhanced ExternalEventRepository**: Time range queries for availability
- 🔄 **Background Sync Scheduling**: Automated periodic calendar synchronization  
- 🔄 **Microsoft Outlook Integration**: OAuth and Graph API implementation

### ❌ What's Missing (Phase 4+)
- Background scheduling for automated sync
- Microsoft Outlook integration
- Internal calendar component UI
- Conflict detection UI
- Calendar connection management UI

## Proposed Architecture

### Backend Changes (openmeet-api)

#### 1. Calendar Feed Endpoints ✅ **IMPLEMENTED**

**Security & Permissions:**
- User calendar feeds require authentication and authorization - users can only access their own calendar feeds
- Use existing JWT auth + guard to verify `req.user.slug === params.userSlug`
- Group calendar feeds respect group privacy settings (public groups = public feeds, private groups = member-only)
- Calendar source management endpoints are user-scoped with ownership validation

**Research - Lu.ma Calendar Approach:**
Lu.ma provides:
- Individual event iCal exports
- User calendar subscription feeds (`/u/{username}/calendar`)
- "Add to Calendar" buttons with multiple provider options
- No external calendar integration for availability checking
- Focus on export rather than import

```typescript
// ✅ IMPLEMENTED Endpoints (Updated Security Model)
GET /calendar/my/calendar.ics - Personal event feed (authenticated, secure)
GET /calendar/groups/:groupSlug/calendar.ics - Group event feed (respects group privacy)

// ✅ IMPLEMENTED Management Endpoints  
GET /calendar-sources - List user's calendar connections
POST /calendar-sources - Connect external calendar
GET /calendar-sources/:id - Get calendar source details
PATCH /calendar-sources/:id - Update calendar source
DELETE /calendar-sources/:id - Disconnect calendar

// ✅ PHASE 3 COMPLETE - REST APIs
GET /external-calendar/auth/:type - Get OAuth authorization URL (implemented)
POST /external-calendar/callback/:type - Exchange OAuth code for tokens (implemented)
POST /external-calendar/sync/:calendarSourceId - Manual sync trigger (implemented)
GET /external-calendar/test/:calendarSourceId - Test calendar connection (implemented)

// ✅ PHASE 3 COMPLETE - Availability APIs
POST /availability/check - Check availability for time slot (implemented)
POST /availability/conflicts - Get all conflicts in time range (implemented)
```

#### 2. External Calendar Integration Service ✅ **GOOGLE INTEGRATION COMPLETE**

**Multiple Calendar Sources:**
Yes, users can have multiple calendar sources (work Google Calendar + personal Apple Calendar + shared team Outlook). Each source is independently managed and synced.

**CalendarSource Entity - ✅ IMPLEMENTED:**
```typescript
@Entity({ name: 'calendarSources' })
export class CalendarSourceEntity extends EntityRelationalHelper {
  @Column({ type: 'enum', enum: CalendarSourceType })
  type: CalendarSourceType; // 'google' | 'apple' | 'outlook' | 'ical_url'
  
  @Column()
  name: string; // User-friendly name like "Work Calendar"
  
  @Column({ nullable: true })
  url?: string; // For iCal feeds
  
  @Column({ nullable: true })
  accessToken?: string; // Encrypted OAuth tokens
  
  @Column({ nullable: true })
  refreshToken?: string;
  
  @Column({ nullable: true })
  expiresAt?: Date;
  
  @Column({ type: 'boolean', default: true })
  isActive: boolean;
  
  @Column({ type: 'boolean', default: false })
  isPrivate: boolean; // hide event details, only show busy/free
  
  @Column({ type: 'integer', default: 60 })
  syncFrequency: number; // minutes between syncs
  
  @Column({ nullable: true })
  lastSyncedAt?: Date;
  
  @ManyToOne(() => UserEntity)
  user: UserEntity;
  
  @Column()
  userId: number;
}
```

**External Event Shape (✅ IMPLEMENTED):**
```typescript
export interface ExternalEvent {
  sourceId: string;
  externalId: string;
  summary: string; // Only if !isPrivate, otherwise "Busy"
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  status: 'busy' | 'free' | 'tentative';
  location?: string; // Only if !isPrivate
  description?: string;
}

export interface SyncResult {
  success: boolean;
  eventsCount: number;
  error?: string;
  lastSyncedAt: Date;
}
```

**Google Calendar Integration (✅ IMPLEMENTED):**
- **OAuth Flow**: Complete authorization URL generation and code exchange
- **Token Management**: Access token refresh with proper error handling  
- **Event Fetching**: Real Google Calendar API v3 integration
- **Data Mapping**: Converts Google events to standardized ExternalEvent format
- **Status Mapping**: Maps Google event statuses (confirmed/tentative/cancelled)
- **Error Handling**: Comprehensive error handling with automatic token refresh
- **Testing**: 21 tests with mocked Google APIs for reliable testing

#### 3. Availability Service (✅ IMPLEMENTED in Phase 3)

**Availability Service Purpose:**
This service checks BOTH internal OpenMeet events AND external calendar events to:
1. Find free time slots for scheduling
2. Detect conflicts when creating events
3. Suggest optimal meeting times
4. Provide busy/free information for attendees (if they've shared their calendars)

```typescript
interface AvailabilityRequest {
  userId: number; // Primary user (event organizer)
  startDate: Date;
  endDate: Date;
  duration?: number; // minutes for the proposed event
  attendeeIds?: number[]; // Other OpenMeet users to check
  workingHoursOnly?: boolean; // Respect user's work hour preferences
  timeZone?: string; // For timezone-aware suggestions
}

interface AvailabilityResponse {
  freeTimes: TimeSlot[]; // Available slots for the requested duration
  conflicts: ConflictInfo[]; // Existing events that would conflict
  suggestions: TimeSlot[]; // Optimal suggested times
  attendeeAvailability?: UserAvailability[]; // If attendees shared calendars
}

interface TimeSlot {
  start: Date;
  end: Date;
  confidence: 'high' | 'medium' | 'low'; // Based on data completeness
}

interface ConflictInfo {
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  source: 'openmeet' | 'external';
  severity: 'hard' | 'soft'; // hard = definite conflict, soft = tentative event
}
```

#### 4. Enhanced Event Creation (🔄 PLANNED for Phase 2)

**Enhanced Event Creation Flow:**

**Option 1: Pre-check availability (recommended)**
```typescript
// Separate availability check endpoint (fast, async)
GET /availability/check?start=2024-01-15T10:00:00Z&end=2024-01-15T11:00:00Z&userId=123
// Returns conflicts and suggestions immediately

// Then create event normally
POST /events
{
  // existing event fields...
  skipConflictCheck?: boolean; // if already checked
}
```

**Performance Strategy:**
- Cache external calendar data for faster lookups
- Use background jobs for slow external API calls
- Provide immediate feedback for cached data, async updates for fresh data

### Frontend Changes (openmeet-platform) - 🔄 PLANNED for Phases 2-4

#### 1. Calendar Integration Settings
- **Location**: User settings page
- **Features**: 
  - Connect Google/Apple/Outlook calendars
  - Generate subscription URLs
  - Test calendar connections
  - Manage connected sources

#### 2. Internal Calendar Component  

**Calendar Component Selection:**
- **QCalendar**: Using QCalendar from qcalendar.netlify.app - comprehensive Vue/Quasar calendar component
- **Features**: Month/week/day/agenda views, event rendering, customizable styling, mobile-responsive
- **Advantages**: Native Quasar integration, excellent documentation, supports complex event layouts
- **Perfect fit**: Covers all our requirements including availability overlays and event filtering

## Implementation Plan (TDD Approach)

### ✅ Phase 1: Foundation (COMPLETE - May 31, 2025)

#### ✅ Backend Tests & Implementation COMPLETE
1. **Calendar Source Entity & Repository** - ✅ COMPLETE
   - 13 tests covering CRUD operations, validation, security
   - Full service layer with tenant isolation 
   - User ownership validation and authorization
   - OAuth token management with encryption support

2. **User Calendar Feed Endpoint** - ✅ COMPLETE
   - User events as iCal with proper RFC 5545 format
   - Date range filtering support
   - Service layer architecture (no direct repository access)
   - 15 tests covering all scenarios including edge cases

3. **Group Calendar Feed Endpoint** - ✅ COMPLETE
   - Group events as iCal with privacy controls
   - Public vs private group access handling
   - Membership validation for private groups
   - 12 tests covering access control and functionality

4. **Enhanced iCalendar Service** - ✅ COMPLETE
   - Multi-event export with `generateICalendarForEvents()`
   - Proper timezone handling and EventSeries support
   - Maintains RFC 5545 compliance

#### Test Results - ✅ ALL PASSING
```
PASS src/calendar-source/calendar-source.service.spec.ts (13 tests)
PASS src/calendar-feed/calendar-feed.controller.spec.ts (10 tests) 
PASS src/calendar-feed/calendar-feed.service.spec.ts (10 tests) - Updated for optimized service
PASS src/external-calendar/external-calendar.service.spec.ts (21 tests) - NEW

Test Suites: 4 passed, 4 total
Tests: 54 passed, 54 total
```

#### ✅ Build & Linting - ALL CLEAN
- TypeScript compilation: ✅ Success
- ESLint: ✅ All issues resolved
- Code style: ✅ Follows OpenMeet conventions

### ✅ Phase 2: External Calendar Integration (IN PROGRESS)

#### Backend Tests & Implementation (Google Complete, Others In Progress)
1. **External Calendar Service - ✅ GOOGLE COMPLETE**
   ```typescript
   // ✅ IMPLEMENTED TESTS (21/21 passing)
   describe('ExternalCalendarService', () => {
     ✅ it('should successfully sync Google Calendar events')
     ✅ it('should generate Google OAuth URL')
     ✅ it('should exchange Google OAuth code for tokens')
     ✅ it('should refresh Google access token')
     ✅ it('should handle Google Calendar sync with missing tokens')
     ✅ it('should throw error when Google OAuth credentials not configured')
     🔄 it('should import events from iCal URLs') // Next task
     🔄 it('should handle Outlook Calendar OAuth') // Future task
   })
   ```

2. **Availability Service**
   ```typescript
   // Tests to implement  
   describe('AvailabilityService', () => {
     it('should calculate free/busy times')
     it('should identify scheduling conflicts')
     it('should suggest alternative time slots')
     it('should handle multiple attendees')
   })
   ```

3. **EventQueryService Enhancement - ✅ COMPLETE**
   ```typescript
   // ✅ IMPLEMENTED METHODS:
   async findUserEvents(userId: number, startDate?: string, endDate?: string): Promise<EventEntity[]>
   async findGroupEvents(groupSlug: string, startDate?: string, endDate?: string, userId?: number): Promise<EventEntity[]>
   ```
   - **Implementation**: Uses TypeORM query builder with proper joins and filtering
   - **User Events**: Finds events user organizes or attends with date range filtering
   - **Group Events**: Respects privacy controls, supports member-only access
   - **Testing**: Integrated into CalendarFeedService tests (20/20 passing)

#### Frontend Tests & Implementation
1. **Calendar Connection Flow**
   ```typescript
   // Tests to implement
   describe('CalendarConnection', () => {
     it('should handle OAuth redirect flow')
     it('should display connection status')
     it('should test calendar connectivity')
   })
   ```

### ✅ Phase 3: REST APIs & Conflict Detection - COMPLETE

#### ✅ Backend Tests & Implementation - COMPLETE
1. **ExternalCalendarController - ✅ COMPLETE (12 tests passing)**
   ```typescript
   // ✅ IMPLEMENTED TESTS
   describe('ExternalCalendarController', () => {
     ✅ it('should return Google OAuth authorization URL')
     ✅ it('should exchange authorization code and create calendar source')
     ✅ it('should trigger manual sync for user calendar source')
     ✅ it('should test calendar connection successfully')
     ✅ it('should handle OAuth exchange errors gracefully')
     ✅ it('should validate user ownership of calendar sources')
   })
   ```

2. **AvailabilityController - ✅ COMPLETE (8 tests passing)**
   ```typescript
   // ✅ IMPLEMENTED TESTS
   describe('AvailabilityController', () => {
     ✅ it('should return availability status with no conflicts')
     ✅ it('should return availability status with conflicts')
     ✅ it('should handle invalid time range')
     ✅ it('should return all conflicts for time range')
   })
   ```

3. **AvailabilityService - ✅ COMPLETE (9 tests passing)**
   ```typescript
   // ✅ IMPLEMENTED TESTS
   describe('AvailabilityService', () => {
     ✅ it('should return available when no conflicts exist')
     ✅ it('should return conflicts when events overlap')
     ✅ it('should use all user calendars when calendarSourceIds is empty')
     ✅ it('should validate user ownership of calendar sources')
   })
   ```

4. **Enhanced CalendarSourceService - ✅ COMPLETE**
   ```typescript
   // ✅ IMPLEMENTED METHODS
   async findByUlid(ulid: string, tenantId: string): Promise<CalendarSourceEntity>
   async updateByUlid(ulid: string, updateDto: UpdateCalendarSourceDto, tenantId: string): Promise<CalendarSourceEntity>
   async updateSyncStatusByUlid(ulid: string, lastSyncedAt: Date, tenantId: string): Promise<CalendarSourceEntity>
   ```

5. **Enhanced ExternalEventRepository - ✅ COMPLETE**
   ```typescript
   // ✅ IMPLEMENTED METHOD
   async findByCalendarSourceAndTimeRange(tenantId: string, calendarSourceId: number, startTime: Date, endTime: Date): Promise<ExternalEventEntity[]>
   ```

#### Frontend Tests & Implementation
1. **Internal Calendar Component**
   ```typescript
   // Tests to implement
   describe('InternalCalendar', () => {
     it('should display OpenMeet and external events')
     it('should support month/week/day views')
     it('should filter events by source')
     it('should handle event interactions')
   })
   ```

2. **Enhanced Event Creation UI**
   ```typescript
   // Tests to implement
   describe('EventCreationWithConflicts', () => {
     it('should show availability during time selection')
     it('should display conflict warnings')
     it('should suggest alternative times')
     it('should visualize attendee availability')
   })
   ```

### 🔄 Phase 4: Advanced Features (Week 7-8)

#### Backend Tests & Implementation
1. **Smart Scheduling Service**
   ```typescript
   // Tests to implement
   describe('SmartSchedulingService', () => {
     it('should find optimal meeting times')
     it('should consider attendee preferences')
     it('should handle timezone differences')
     it('should optimize for group availability')
   })
   ```

#### Frontend Tests & Implementation
1. **Advanced Scheduling UI**
   ```typescript
   // Tests to implement
   describe('SmartScheduling', () => {
     it('should display "find a time" wizard')
     it('should show optimal time recommendations')
     it('should handle complex availability patterns')
   })
   ```

## Database Schema Changes

### ✅ New Tables - IMPLEMENTED
Migration file: `src/database/migrations/1748624400000-AddCalendarIntegration.ts`

```sql
-- ✅ IMPLEMENTED - Calendar sources for external calendar integration
CREATE TABLE calendar_sources (
  id SERIAL PRIMARY KEY,
  ulid VARCHAR(26) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('google', 'apple', 'outlook', 'ical_url')),
  name VARCHAR(255) NOT NULL,
  url TEXT, -- For iCal feeds
  access_token TEXT, -- Encrypted OAuth tokens
  refresh_token TEXT, -- Encrypted
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  is_private BOOLEAN DEFAULT false,
  sync_frequency INTEGER DEFAULT 60,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 🔄 PLANNED for Phase 2 - External events cache (for availability checking)
CREATE TABLE external_events (
  id SERIAL PRIMARY KEY,
  calendar_source_id INTEGER NOT NULL REFERENCES calendar_sources(id),
  external_id VARCHAR(255) NOT NULL,
  summary TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_all_day BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'busy', -- busy, free, tentative
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(calendar_source_id, external_id)
);

-- Indexes for performance
CREATE INDEX idx_calendar_sources_user_id ON calendar_sources(user_id);
CREATE INDEX idx_external_events_source_time ON external_events(calendar_source_id, start_time, end_time);
```

### 🔄 Existing Table Modifications - PLANNED for Phase 2

```sql
-- Add calendar integration flags to users
ALTER TABLE users ADD COLUMN calendar_timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN calendar_week_start INTEGER DEFAULT 1; -- 1=Monday, 0=Sunday
ALTER TABLE users ADD COLUMN calendar_work_hours_start TIME DEFAULT '09:00';
ALTER TABLE users ADD COLUMN calendar_work_hours_end TIME DEFAULT '17:00';
ALTER TABLE users ADD COLUMN calendar_work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5]; -- Mon-Fri
```

## API Documentation

### ✅ Calendar Feed Endpoints - IMPLEMENTED

```yaml
/calendar/users/{userSlug}/calendar.ics:
  get:
    summary: Get user's personal calendar feed
    security: [] # Public endpoint with optional authentication
    parameters:
      - name: start
        in: query
        schema:
          type: string
          format: date
        description: Start date (default: 1 month ago)
      - name: end
        in: query  
        schema:
          type: string
          format: date
        description: End date (default: 1 year from now)
    responses:
      200:
        description: iCalendar file
        content:
          text/calendar:
            schema:
              type: string
      404:
        description: User not found

/calendar/groups/{groupSlug}/calendar.ics:
  get:
    summary: Get group's calendar feed
    security: [] # Public endpoint with optional authentication for private groups
    parameters:
      - name: start
        in: query
      - name: end
        in: query
    responses:
      200:
        description: iCalendar file
        content:
          text/calendar:
            schema:
              type: string
      403:
        description: Access denied to private group calendar
      404:
        description: Group not found
```

### ✅ Calendar Source Management Endpoints - IMPLEMENTED

```yaml
/calendar-sources:
  get:
    summary: Get all calendar sources for authenticated user
    security:
      - bearerAuth: []
    responses:
      200:
        description: List of calendar sources
        content:
          application/json:
            schema:
              type: array
              items:
                $ref: '#/components/schemas/CalendarSource'
  
  post:
    summary: Create new calendar source connection
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/CreateCalendarSourceDto'
    responses:
      201:
        description: Calendar source created successfully

/calendar-sources/{id}:
  get:
    summary: Get calendar source by ID
    security:
      - bearerAuth: []
    responses:
      200:
        description: Calendar source details
      404:
        description: Calendar source not found
      403:
        description: Access denied
        
  patch:
    summary: Update calendar source
    security:
      - bearerAuth: []
    responses:
      200:
        description: Calendar source updated
        
  delete:
    summary: Delete calendar source
    security:
      - bearerAuth: []
    responses:
      204:
        description: Calendar source deleted

/calendar-sources/{id}/sync:
  post:
    summary: Trigger manual sync for calendar source
    security:
      - bearerAuth: []
    responses:
      200:
        description: Sync triggered (Phase 2 implementation)
```

## Security Considerations

1. **OAuth Token Storage**: ✅ Encrypt access/refresh tokens in database (architecture ready)
2. **Calendar Feed Access**: ✅ Authenticate private calendar feeds (implemented)
3. **User Authorization**: ✅ Ownership validation prevents unauthorized access (implemented)
4. **External API Rate Limits**: 🔄 Implement proper rate limiting for external calendar APIs (Phase 2)
5. **Data Privacy**: 🔄 Only cache necessary external event data, respect user privacy settings (Phase 2)
6. **CORS Configuration**: ✅ Properly configure CORS for calendar subscription feeds (implemented)

## Performance Considerations

1. **Calendar Feed Caching**: 🔄 Cache generated iCal files with appropriate TTL (Phase 2)
2. **External Event Sync**: 🔄 Implement incremental sync, avoid full refreshes (Phase 2)
3. **Database Indexing**: ✅ Proper indexes on time-based queries (implemented in migration)
4. **Background Jobs**: 🔄 Use job queues for external calendar synchronization (Phase 2)
5. **Rate Limiting**: 🔄 Respect external API limits, implement backoff strategies (Phase 2)
6. **Service Layer**: ✅ Proper domain boundaries prevent N+1 queries (implemented)

## Testing Strategy

### ✅ Unit Tests - IMPLEMENTED (40/40 passing)
- Calendar source entity validation ✅
- iCal generation for complex scenarios ✅
- Service layer with proper domain boundaries ✅
- Authorization and ownership validation ✅
- Privacy controls and access management ✅

### 🔄 Integration Tests - PLANNED Phase 2
- OAuth flow with external providers
- Calendar feed generation end-to-end
- Event creation with conflict detection
- Cross-timezone scheduling scenarios

### 🔄 E2E Tests - PLANNED Phase 3
- Complete calendar connection workflow
- Event creation with availability checking
- Calendar subscription in external apps
- Conflict resolution user flows

## Rollout Plan

### ✅ Phase 1: Core Infrastructure - COMPLETE (May 31, 2025)
- ✅ Calendar source management (13 tests passing)
- ✅ Basic calendar feeds (27 tests passing)  
- ✅ Simple iCal subscription
- ✅ User authorization and privacy controls
- ✅ Service layer architecture
- ✅ Database migration ready

### 🔄 Phase 2: External Integration - READY TO START
- Google Calendar OAuth
- Apple Calendar support 
- Availability checking
- External event sync implementation
- EventQueryService enhancements

### 🔄 Phase 3: UI Enhancement - PLANNED
- Internal calendar component
- Conflict detection UI
- Advanced scheduling features

### 🔄 Phase 4: Optimization - PLANNED
- Performance improvements
- Advanced conflict resolution
- Smart scheduling algorithms

## Success Metrics

1. **Adoption**: % of users who connect external calendars
2. **Usage**: Calendar feed subscription rates
3. **Conflict Reduction**: % decrease in scheduling conflicts
4. **User Satisfaction**: Calendar integration NPS scores
5. **Technical**: Calendar sync success rates, API response times

## Future Enhancements

1. **Bidirectional Sync**: Create OpenMeet events from external calendars
2. **AI Scheduling**: Machine learning for optimal time suggestions
3. **Team Calendars**: Shared team availability dashboards
4. **Mobile Calendar**: Native mobile app calendar integration
5. **Calendar Analytics**: Usage patterns and optimization insights

---

## Progress Tracking

### ✅ **Phase 1: Foundation - COMPLETE (May 31, 2025)**
- ✅ Calendar source entity and repository
- ✅ User calendar feed endpoint (updated security model)
- ✅ Group calendar feed endpoint
- ✅ Enhanced iCalendar service for multi-event export
- ✅ Database migration prepared
- ✅ Complete test coverage (54 tests passing)
- ✅ Proper service layer architecture
- ✅ User authorization and privacy controls
- ✅ Performance optimizations (eliminated unnecessary DB queries)

### ✅ **Phase 2: External Integration - COMPLETE WITH TENANT ISOLATION**
- ✅ External calendar service implementation (Google + iCal)
- ✅ Google Calendar OAuth integration (complete flow)
- ✅ iCal URL fetching and parsing (complete implementation)
- ✅ Apple Calendar integration (via iCal delegation)
- ✅ EventQueryService method additions (findUserEvents, findGroupEvents)
- ✅ **ExternalEvent Entity**: Database storage with proper tenant isolation
- ✅ **ExternalEventRepository**: Tenant-aware repository using TenantConnectionService
- ✅ **Database Migration**: Updated migration includes external_events table
- ✅ **Tenant Isolation**: All external calendar operations properly isolated by tenant schema
- ✅ Security and performance optimizations
- ✅ **Service Integration**: ExternalCalendarModule properly registered in AppModule
- ✅ **32 Tests Passing**: Complete test coverage with tenant-aware mocking

### ✅ **Phase 3: REST APIs & Availability - COMPLETE**
- ✅ **ExternalCalendarController**: OAuth flow, manual sync, connection testing (12 tests)
- ✅ **AvailabilityController**: Check availability and find conflicts (8 tests)
- ✅ **AvailabilityService**: Business logic for conflict detection (9 tests)
- ✅ **Enhanced CalendarSourceService**: ULID-based methods for user-facing APIs
- ✅ **Enhanced ExternalEventRepository**: Time range queries for availability
- ✅ **API Documentation**: Complete Swagger/OpenAPI documentation
- ✅ **TDD Implementation**: 29 new tests following test-driven development

### 🔄 **Phase 4: Advanced Features - PLANNED**
- 🔄 Smart scheduling service
- 🔄 Advanced scheduling UI
- 🔄 Performance optimizations
- 🔄 Analytics and monitoring

### Architecture Notes
- **Service Layer**: CalendarFeedService properly uses UserService, GroupService, and EventQueryService instead of direct repository access
- **Request Scoping**: CalendarSourceService uses proper request-scoped pattern with tenant isolation
- **Testing**: Comprehensive test coverage with proper mocking and dependency injection
- **Security**: User ownership validation prevents unauthorized access to calendar sources and feeds
- **TODOs**: Clear markers for Phase 2 continuation in `findUserEvents()` and `findGroupEvents()` methods

### Next Steps for Phase 2 Completion
1. ✅ ~~Add `findUserEvents()` and `findGroupEvents()` methods to EventQueryService~~ COMPLETE
2. ✅ ~~Implement Google Calendar OAuth flow~~ COMPLETE
3. 🔄 Add iCal URL fetching and parsing (next priority)
4. 🔄 Create ExternalEvent entity and repository for caching
5. 🔄 Create REST API controllers for OAuth flows
6. 🔄 Implement background job scheduling for periodic sync
7. 🔄 Add Microsoft Outlook Calendar OAuth integration
8. 🔄 Create availability checking service
9. 🔄 Build calendar connection UI components

### Current Status Summary  
**Phase 3 Progress: 100% COMPLETE**
- ✅ **ExternalCalendarController**: Complete OAuth flow, manual sync, connection testing
- ✅ **AvailabilityController**: Check availability and find conflicts APIs
- ✅ **AvailabilityService**: Business logic for conflict detection across calendar sources
- ✅ **Enhanced CalendarSourceService**: ULID-based methods following OpenMeet guidelines
- ✅ **Enhanced ExternalEventRepository**: Time range queries for availability checking
- ✅ **TDD Implementation**: 61 total tests passing (32 from Phase 2 + 29 new in Phase 3)
- ✅ **API Integration**: All controllers properly registered in ExternalCalendarModule
- ✅ **Tenant Isolation**: All operations maintain proper tenant separation
- 🔄 **Phase 4**: Background scheduling and advanced features (next phase)