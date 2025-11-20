# Visibility Model V2: Implementation Plan

**Status:** 📋 Ready for Development
**Date:** 2025-11-18
**Design Doc:** `visibility-model-v2-private-events.md`
**Related:** `event-visibility-and-permissions.md`, `activity-feed-system.md`

## Overview

This document contains the detailed implementation plan for migrating to Visibility Model V2, which introduces true **Private** events requiring authentication and invitation, and renames **Authenticated** to **Unlisted**.

**Timeline:** 6 weeks total (2-week pre-migration + 4-week implementation)

---

## Phase 0: Pre-Migration Audit & Notification (Weeks -2 to 0)

**Critical:** Must complete BEFORE deploying VisibilityGuard fix to avoid breaking existing links.

### Step 1: Identify Affected Events & Groups

**Query 1: Find All Private Events**
```sql
-- Find all events currently marked as 'private'
SELECT
  e.id,
  e.slug,
  e.name,
  e.visibility,
  e.status,
  e.startDate,
  u.id as host_user_id,
  u.email as host_email,
  u.firstName || ' ' || u.lastName as host_name,
  g.id as group_id,
  g.name as group_name,
  g.visibility as group_visibility,
  COUNT(DISTINCT ea.id) as attendee_count
FROM events e
LEFT JOIN users u ON e.userId = u.id
LEFT JOIN groups g ON e.groupId = g.id
LEFT JOIN "eventAttendees" ea ON e.id = ea.eventId
WHERE e.visibility = 'private'
  AND e.status IN ('published', 'cancelled')
GROUP BY e.id, u.id, g.id
ORDER BY e.createdAt DESC;
```

**Query 2: Find Private Groups**
```sql
SELECT
  g.id,
  g.slug,
  g.name,
  g.visibility,
  u.email as creator_email,
  COUNT(DISTINCT gm.id) as member_count,
  COUNT(DISTINCT e.id) as event_count
FROM groups g
LEFT JOIN users u ON g.createdBy = u.id
LEFT JOIN "groupMembers" gm ON g.id = gm.groupId
LEFT JOIN events e ON g.id = e.groupId
WHERE g.visibility = 'private'
  AND g.status = 'active'
GROUP BY g.id, u.id
ORDER BY g.createdAt DESC;
```

**Query 3: Find Activity Feed Privacy Leaks**
```sql
-- Find private event activities in public feeds
SELECT COUNT(*) as leaked_activities
FROM activity_feed af
JOIN events e ON af.eventId = e.id
WHERE e.visibility = 'private'
  AND af.visibility != 'members_only'
  AND af.feedScope = 'sitewide';
```

### Step 2: Create Migration Tracking Table

```sql
CREATE TABLE visibility_migration_preferences (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  host_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  choice VARCHAR(50) NOT NULL, -- 'convert_to_unlisted', 'keep_private', 'no_response'
  responded_at TIMESTAMP,
  notification_sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reminder_sent_at TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_choice CHECK (
    choice IN ('convert_to_unlisted', 'keep_private', 'no_response')
  )
);

CREATE INDEX idx_migration_prefs_event ON visibility_migration_preferences(event_id);
CREATE INDEX idx_migration_prefs_user ON visibility_migration_preferences(host_user_id);
```

### Step 3: Notification System

**Email Template: Private Event Host**
```
Subject: Action Required: Security Update for "{EVENT_NAME}"

Hi {HOST_NAME},

We're fixing a security issue with private events. Your event "{EVENT_NAME}"
is currently accessible to anyone with the link (unintended).

Choose how to handle your event:

1. Convert to "Unlisted" - Anyone with link can view (current behavior)
   [Convert to Unlisted Button]

2. Keep as "Private" - Requires login + invitation to view
   [Keep Private Button]

If no response by {DEADLINE}: We'll convert to "Unlisted" to maintain
current link-sharing behavior.

Event: {EVENT_NAME}
Date: {EVENT_DATE}
Attendees: {ATTENDEE_COUNT}
```

### Step 4: Migration Decision Tracking

**API Endpoints:**
```typescript
// POST /api/v1/migration/visibility-choice
interface VisibilityMigrationChoiceDto {
  eventId: number;
  choice: 'convert_to_unlisted' | 'keep_private';
}

// GET /api/v1/migration/my-affected-events
// Returns events requiring migration choice for logged-in user
```

### Step 5: Execute Migration (Week 0)

**Apply Host Choices:**
```sql
-- Auto-convert to 'unlisted' for non-responders and explicit choice
UPDATE events
SET visibility = 'unlisted'
WHERE id IN (
  SELECT event_id
  FROM visibility_migration_preferences
  WHERE choice IN ('convert_to_unlisted', 'no_response')
);

-- Mark as processed
UPDATE visibility_migration_preferences
SET processed_at = NOW()
WHERE choice IN ('convert_to_unlisted', 'no_response');
```

**Create Invitations for Keep-Private Events:**
```typescript
// Auto-create invitation tokens for existing attendees
async function createInvitationsForExistingAttendees(eventId: number) {
  const event = await this.eventRepository.findOne({
    where: { id: eventId },
    relations: ['attendees']
  });

  for (const attendee of event.attendees) {
    await this.eventInvitationService.createInvitation({
      eventId: event.id,
      userId: attendee.userId,
      token: generateSecureToken(),
      expiresAt: null, // No expiry for existing attendees
      createdByUserId: event.userId,
    });
  }
}
```

**Success Criteria:**
- [ ] 100% of affected hosts notified
- [ ] All migration preferences recorded
- [ ] Zero events left with 'authenticated' visibility
- [ ] Invitations created for all 'keep_private' events

---

## Phase 1: Database Migration (Week 1)

### Step 1: Rename Enum Values

```sql
-- Rename 'authenticated' to 'unlisted' in events table
UPDATE events
SET visibility = 'unlisted'
WHERE visibility = 'authenticated';

-- Same for groups table
UPDATE groups
SET visibility = 'unlisted'
WHERE visibility = 'authenticated';

-- Update activity feed
UPDATE activity_feed
SET visibility = 'unlisted'
WHERE visibility = 'authenticated';
```

### Step 2: Update TypeScript Enums

```typescript
// src/core/constants/constant.ts

// Before
export enum EventVisibility {
  Public = 'public',
  Authenticated = 'authenticated',
  Private = 'private'
}

// After
export enum EventVisibility {
  Public = 'public',
  Unlisted = 'unlisted',
  Private = 'private'
}

export enum GroupVisibility {
  Public = 'public',
  Unlisted = 'unlisted',
  Private = 'private'
}
```

### Step 3: Update All Code References

```bash
# Find all references to 'Authenticated' visibility
rg "EventVisibility.Authenticated" --type ts
rg "GroupVisibility.Authenticated" --type ts

# Replace with 'Unlisted'
# Manual review required for each file
```

---

## Phase 2: VisibilityGuard Security Fix (Week 1-2)

**Current Implementation (Broken):**
```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const eventSlug = request.headers['x-event-slug'] as string;  // ❌ Never set

  if (eventSlug) {  // ❌ Always false, skips all checks
    // ... visibility checks ...
  }

  return true;  // ❌ Always returns true!
}
```

**New Implementation:**
```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();

  // Read from params (primary) or headers (fallback)
  const eventSlug = (request.params.slug || request.headers['x-event-slug']) as string;
  const groupSlug = (request.params.slug || request.headers['x-group-slug']) as string;

  const user = request.user;

  if (eventSlug) {
    return this.checkEventVisibility(eventSlug, user, request);
  }

  if (groupSlug) {
    return this.checkGroupVisibility(groupSlug, user, request);
  }

  return true;
}

private async checkEventVisibility(
  slug: string,
  user: any,
  request: any
): Promise<boolean> {
  const event = await this.eventQueryService.findEventBySlug(slug);

  if (!event) {
    throw new NotFoundException('Event not found');
  }

  // Only published/cancelled events accessible
  if (event.status !== EventStatus.Published &&
      event.status !== EventStatus.Cancelled) {
    throw new NotFoundException('Event not found');
  }

  switch (event.visibility) {
    case EventVisibility.Public:
      return true;

    case EventVisibility.Unlisted:
      return true;  // Anyone with link can view

    case EventVisibility.Private:
      if (!user) {
        // Store requested URL for redirect after login
        request.session.returnTo = request.url;
        throw new ForbiddenException(
          'This is a private event. Please log in to view.'
        );
      }

      // Check if user is attendee or invited
      const attendee = await this.eventAttendeeService
        .findEventAttendeeByUserId(event.id, user.id);

      if (!attendee) {
        // Logged in but not invited - hard 403
        throw new ForbiddenException(
          'Access denied. This event requires an invitation.'
        );
      }

      return true;  // User is invited/attendee

    default:
      throw new ForbiddenException('Invalid event visibility');
  }
}
```

---

## Phase 3: Frontend Error Handling (Week 2)

**No Teaser Pages - Hard 403 Only**

The frontend should handle 403 errors from private events/groups gracefully:

**Error Display:**
- Show generic "Access Denied" message
- No event details disclosed
- Provide login button if user not authenticated
- No "request invitation" mechanism

**Frontend Implementation Notes:**
- API returns 403 with generic message
- Frontend displays error page without event data
- Logged-out users see "Please log in" prompt
- Logged-in users see "Invitation required" message
- No event name, host, or any details shown

---

## Phase 4: Invitation Token System (Week 2-3)

### Database Schema

```sql
CREATE TABLE event_invitations (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by_user_id INT REFERENCES users(id),
  invited_user_id INT REFERENCES users(id), -- NULL if sharable link
  max_uses INT DEFAULT NULL, -- NULL = unlimited
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_event_invitations_token (token),
  INDEX idx_event_invitations_event (event_id)
);

CREATE TABLE event_invitation_uses (
  id SERIAL PRIMARY KEY,
  invitation_id INT REFERENCES event_invitations(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  used_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_invitation_uses_invitation (invitation_id),
  INDEX idx_invitation_uses_user (user_id)
);
```

### API Endpoints

```typescript
// Generate invitation token
@Post(':slug/invitations')
@UseGuards(JWTAuthGuard, PermissionsGuard)
@Permissions({
  context: 'event',
  permissions: [EventAttendeePermission.ManageEvent]
})
async createInvitation(
  @Param('slug') slug: string,
  @Body() dto: CreateInvitationDto
): Promise<InvitationEntity> {
  return this.eventInvitationService.createInvitation(slug, dto);
}

// Validate invitation token
@Get(':slug/validate-invitation')
@Public()
async validateInvitation(
  @Param('slug') slug: string,
  @Query('token') token: string
): Promise<{ valid: boolean; expiresAt?: Date }> {
  return this.eventInvitationService.validateInvitation(slug, token);
}

// Accept invitation
@Post(':slug/accept-invitation')
@UseGuards(JWTAuthGuard)
async acceptInvitation(
  @Param('slug') slug: string,
  @Query('token') token: string,
  @AuthUser() user: User
): Promise<EventAttendeeEntity> {
  return this.eventInvitationService.acceptInvitation(
    slug,
    token,
    user.id
  );
}

// Revoke invitation (removes all users who joined via token)
@Delete(':slug/invitations/:token')
@UseGuards(JWTAuthGuard, PermissionsGuard)
@Permissions({
  context: 'event',
  permissions: [EventAttendeePermission.ManageEvent]
})
async revokeInvitation(
  @Param('slug') slug: string,
  @Param('token') token: string
): Promise<{ removed: number }> {
  return this.eventInvitationService.revokeInvitation(slug, token);
}
```

### Group Membership Auto-Access

```typescript
// Check if user can access private event via group membership
async canAccessPrivateEvent(
  eventId: number,
  userId: number
): Promise<boolean> {
  const event = await this.eventRepository.findOne({
    where: { id: eventId },
    relations: ['group']
  });

  if (!event || event.visibility !== EventVisibility.Private) {
    return false;
  }

  // Check if event is in a private group
  if (event.group?.visibility === GroupVisibility.Private) {
    // Check if user is group member
    const member = await this.groupMemberRepository.findOne({
      where: {
        groupId: event.group.id,
        userId: userId
      }
    });

    return !!member;
  }

  // Check explicit invitation or attendee status
  const attendee = await this.eventAttendeeRepository.findOne({
    where: { eventId, userId }
  });

  return !!attendee;
}
```

---

## Phase 5: Activity Feed Privacy (Week 3)

### Visibility Mapping

**Key Rules:**
- Only Public standalone events appear in sitewide feed
- Events in groups use group feed (regardless of event visibility)
- Unlisted/Private events use event-scoped feed
- Activity feed endpoints MUST enforce membership/attendee checks

**Activity Visibility Mapping:**
- Public → `public`
- Unlisted → `members_only`
- Private → `members_only`

**Feed Scope Mapping:**
- Public standalone event → `sitewide`
- Event in group (any visibility) → `group`
- Unlisted standalone event → `event`
- Private standalone event → `event`

### Access Control for Feed Endpoints

**Critical Security Fix:** Feed endpoints must verify access before returning activities.

**Sitewide Feed:**
- Only show `public` activities from `sitewide` scope
- No authentication required
- Excludes all unlisted/private entities

**Group Feed:**
- Verify group membership before returning activities
- Public groups: Anyone can view
- Unlisted groups: Anyone with link can view
- Private groups: Only members can view
- Return 403 if non-member tries to access private group feed

**Event Feed:**
- Verify event access before returning activities
- Public events: Anyone can view
- Unlisted events: Anyone with link can view
- Private events: Only invited/attendees can view
- Return 403 if non-invited tries to access private event feed

**Implementation Notes:**
- Add membership checks to group feed endpoint
- Add attendee/invitation checks to event feed endpoint
- Enforce visibility rules at API controller level
- Log unauthorized access attempts

---

## Phase 6: Testing & Validation (Week 3-4)

### Critical Test Cases

**Test 1: Private Event - Logged Out**
```typescript
it('should return 403 for private event when logged out', async () => {
  const response = await request(app.getHttpServer())
    .get('/events/private-event')
    .expect(403);

  expect(response.body.message).toContain('log in');
});
```

**Test 2: Private Event - Logged In (Not Invited)**
it('should return 403 when logged in but not invited', async () => {
  const response = await request(app.getHttpServer())
    .get('/events/private-event')
    .set('Authorization', `Bearer ${userToken}`)
    .expect(403);

  expect(response.body.message).toContain('invitation required');
});

**Test 3: Invitation Token Flow**
```typescript
it('should grant access via invitation token', async () => {
  // Create invitation
  const invitation = await eventInvitationService.createInvitation(
    'private-event',
    { expiresAt: addDays(new Date(), 30) }
  );

  // Accept invitation
  await request(app.getHttpServer())
    .post(`/events/private-event/accept-invitation?token=${invitation.token}`)
    .set('Authorization', `Bearer ${userToken}`)
    .expect(201);

  // Now can access full event
  const response = await request(app.getHttpServer())
    .get('/events/private-event')
    .set('Authorization', `Bearer ${userToken}`)
    .expect(200);

  expect(response.body.description).toBeDefined();
  expect(response.body.location).toBeDefined();
});
```

**Test 4: Activity Feed Privacy**
```typescript
it('should not show private event activities in sitewide feed', async () => {
  // Alice RSVPs to private event
  await eventAttendeeService.createAttendee(privateEvent.id, alice.id);

  // Bob checks sitewide feed
  const feed = await activityService.getSitewideFeed(bob.id);

  const privateEventActivities = feed.filter(
    a => a.eventId === privateEvent.id
  );

  expect(privateEventActivities).toHaveLength(0);
});
```

**Test 5: Group Membership Auto-Access**
```typescript
it('should grant access to private event via group membership', async () => {
  // Create private group with private event
  const group = await createPrivateGroup();
  const event = await createPrivateEvent({ groupId: group.id });

  // Add user to group
  await groupMemberService.addMember(group.id, user.id);

  // User should access event without explicit invitation
  const response = await request(app.getHttpServer())
    .get(`/events/${event.slug}`)
    .set('Authorization', `Bearer ${userToken}`)
    .expect(200);

  expect(response.body.description).toBeDefined();
});
```

---

## Phase 7: Deployment & Monitoring (Week 4)

### Pre-Deployment Checklist
- [ ] All affected hosts notified (Phase 0 complete)
- [ ] Database migrations tested on staging
- [ ] VisibilityGuard tests passing
- [ ] Frontend teaser pages tested
- [ ] Invitation system tested end-to-end
- [ ] Activity feed privacy validated
- [ ] Rollback plan documented

### Monitoring Queries

```sql
-- Verify no 'authenticated' visibility remains
SELECT COUNT(*) FROM events WHERE visibility = 'authenticated';
-- Expected: 0

-- Check private event access patterns
SELECT
  DATE(createdAt) as date,
  COUNT(*) as private_events_created
FROM events
WHERE visibility = 'private'
  AND createdAt > NOW() - INTERVAL '7 days'
GROUP BY DATE(createdAt);

-- Monitor invitation token usage
SELECT
  COUNT(*) as total_invitations,
  SUM(uses_count) as total_uses,
  AVG(uses_count) as avg_uses_per_token
FROM event_invitations
WHERE created_at > NOW() - INTERVAL '7 days';

-- Check for activity feed leaks
SELECT COUNT(*) as leaked_activities
FROM activity_feed af
JOIN events e ON af.eventId = e.id
WHERE e.visibility = 'private'
  AND af.visibility != 'members_only'
  AND af.feedScope = 'sitewide';
-- Expected: 0
```

### Rollback Plan

```sql
-- Backup before deployment
CREATE TABLE events_visibility_backup_v2 AS
SELECT id, visibility, updatedAt FROM events;

-- Rollback if needed
UPDATE events e
SET visibility = b.visibility
FROM events_visibility_backup_v2 b
WHERE e.id = b.id;
```

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 0 | Weeks -2 to 0 | Host notifications, migration preferences collected |
| Phase 1 | Week 1 | Database migration, enum updates |
| Phase 2 | Week 1-2 | VisibilityGuard security fix deployed |
| Phase 3 | Week 2 | Frontend teaser pages |
| Phase 4 | Week 2-3 | Invitation token system |
| Phase 5 | Week 3 | Activity feed privacy |
| Phase 6 | Week 3-4 | Testing & validation |
| Phase 7 | Week 4 | Production deployment + monitoring |

**Total Duration:** ~6 weeks (including 2-week pre-migration period)

---

## References

- Design doc: `visibility-model-v2-private-events.md`
- Original vulnerability: Issue #279
- Related: `event-visibility-and-permissions.md`, `activity-feed-system.md`
