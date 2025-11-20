# Visibility Model V2: Remaining Corrections

**Date:** 2025-11-19
**Status:** 📋 Implementation work needed

---

## Overview

This document lists implementation issues that still need to be corrected in the codebase.

---

## 1. Activity Feed Implementation Issues

**Current V2 Implementation Suggests:**
```typescript
// visibility-model-v2-private-events-impl.md:545-559
const visibility = event.visibility === EventVisibility.Private
  ? 'members_only'
  : 'public';

const feedScope = event.groupId ? 'group' : 'sitewide';
```

**Should Be:**
```typescript
// Visibility mapping
function mapVisibility(entityVisibility: EventVisibility | GroupVisibility) {
  switch (entityVisibility) {
    case EventVisibility.Public:
    case GroupVisibility.Public:
      return 'public';

    case EventVisibility.Unlisted:  // Renamed from Authenticated
    case GroupVisibility.Unlisted:
    case EventVisibility.Private:
    case GroupVisibility.Private:
      return 'members_only';

    default:
      return 'public';
  }
}

// Feed scope mapping for Events
function getEventFeedScope(event: Event): 'sitewide' | 'group' | 'event' {
  // Only public standalone events appear in sitewide feed
  if (event.visibility === EventVisibility.Public && !event.groupId) {
    return 'sitewide';
  }

  // Events in groups use group feed
  if (event.groupId) {
    return 'group';
  }

  // Unlisted/Private standalone events use event-scoped feed
  return 'event';
}

// Feed scope mapping for Groups
function getGroupFeedScope(group: Group): 'sitewide' | 'group' {
  // Only public groups appear in sitewide feed
  if (group.visibility === GroupVisibility.Public) {
    return 'sitewide';
  }

  // Unlisted/Private groups use group-scoped feed
  return 'group';
}
```

**Summary Table:**

| Entity Type | Visibility | Feed Scope | Activity Visibility | Appears in Sitewide? |
|------------|-----------|------------|-------------------|---------------------|
| Event (standalone) | Public | sitewide | public | ✅ Yes |
| Event (standalone) | Unlisted | event | members_only | ❌ No |
| Event (standalone) | Private | event | members_only | ❌ No |
| Event (in group) | Any | group | (from group) | ❌ No |
| Group | Public | sitewide | public | ✅ Yes |
| Group | Unlisted | group | members_only | ❌ No |
| Group | Private | group | members_only | ❌ No |

---

### Issue 1.3: Activity Feed Endpoints Don't Enforce Membership/Attendee Checks

**Current Code (SECURITY ISSUE):**

```typescript
// src/activity-feed/activity-feed.controller.ts:103-128
// Group feed endpoint
@Public()
@Get(':slug/feed')
async getGroupFeed(@Param('slug') slug: string) {
  const group = await this.groupService.getGroupBySlug(slug);
  // ❌ NO MEMBERSHIP CHECK!
  return this.activityFeedService.getGroupFeed(group.id);
}

// Event feed endpoint
@Public()
@Get(':slug/feed')
async getEventFeed(@Param('slug') slug: string) {
  const event = await this.eventQueryService.findEventBySlug(slug);
  // ❌ NO ATTENDEE CHECK!
  return this.activityFeedService.getEventFeed(event.id);
}
```

**Problem:**
- Anyone can call `/groups/private-group/feed` and see all activities
- Anyone can call `/events/private-event/feed` and see all activities
- Activities marked `visibility: 'members_only'` are leaked to everyone

**Required Fix:**

```typescript
// Group feed endpoint
@Public()
@Get(':slug/feed')
async getGroupFeed(
  @Param('slug') slug: string,
  @Request() req: any
) {
  const group = await this.groupService.getGroupBySlug(slug);

  if (!group) {
    throw new NotFoundException('Group not found');
  }

  const user = req.user;

  // Check group visibility and membership
  if (group.visibility === GroupVisibility.Private) {
    if (!user) {
      throw new ForbiddenException('Login required');
    }

    const isMember = await this.groupMemberService.findGroupMemberByUserId(
      group.id,
      user.id
    );

    if (!isMember) {
      throw new ForbiddenException('Must be a group member');
    }
  }

  // Determine which activities to show based on membership
  const visibilityFilter = this.getVisibilityFilter(group, user);

  return this.activityFeedService.getGroupFeed(group.id, {
    visibility: visibilityFilter
  });
}

private getVisibilityFilter(
  group: Group,
  user?: User
): string[] {
  // Non-members only see public activities (if group is public/unlisted)
  if (!user) {
    return ['public'];
  }

  // Check if user is member
  const isMember = await this.groupMemberService.findGroupMemberByUserId(
    group.id,
    user.id
  );

  if (isMember) {
    // Members see all activities (public + members_only)
    return ['public', 'authenticated', 'members_only'];
  } else {
    // Non-members see public activities only
    return ['public'];
  }
}
```

**Similar fix needed for Event feed endpoint.**

**Files to Update:**
- src/activity-feed/activity-feed.controller.ts (GroupActivityFeedController, EventActivityFeedController)
- design-notes/visibility-model-v2-private-events-impl.md (add Phase 5.1: Activity Feed Access Control)

---

## 2. Current Implementation Issues

### Issue 2.1: Current Code Creates Wrong Feed Scopes

**Files with wrong logic:**
- src/activity-feed/activity-feed.listener.ts:100-113 - Private/Authenticated groups create anonymized sitewide activity
- src/activity-feed/activity-feed.listener.ts:182-196 - Private groups create anonymized sitewide activity
- src/activity-feed/activity-feed.listener.ts:328-340 - Public events in non-public groups create anonymized sitewide activity
- src/activity-feed/activity-feed.listener.ts:346-358 - Private/Authenticated events create anonymized sitewide activity

**These should be removed/changed to use proper feed scopes.**

---

## 3. Groups-Specific Content Missing

The V2 docs focus primarily on Events. Need parallel documentation for Groups:

### Missing: Group Invitation System

**Need to add:**

#### Database Schema
```sql
CREATE TABLE group_invitations (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by_user_id INT REFERENCES users(id),
  invited_user_id INT REFERENCES users(id), -- NULL if shareable link
  max_uses INT DEFAULT NULL, -- NULL = unlimited
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_group_invitations_token (token),
  INDEX idx_group_invitations_group (group_id)
);

CREATE TABLE group_invitation_uses (
  id SERIAL PRIMARY KEY,
  invitation_id INT REFERENCES group_invitations(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  used_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_invitation_uses_invitation (invitation_id),
  INDEX idx_invitation_uses_user (user_id)
);
```

#### API Endpoints
```typescript
// Generate group invitation token
@Post(':slug/invitations')
@UseGuards(JWTAuthGuard, PermissionsGuard)
@Permissions({
  context: 'group',
  permissions: [GroupMemberPermission.ManageGroup]
})
async createInvitation(
  @Param('slug') slug: string,
  @Body() dto: CreateGroupInvitationDto
): Promise<GroupInvitationEntity> {
  return this.groupInvitationService.createInvitation(slug, dto);
}

// Validate group invitation token
@Get(':slug/validate-invitation')
@Public()
async validateInvitation(
  @Param('slug') slug: string,
  @Query('token') token: string
): Promise<{ valid: boolean; expiresAt?: Date }> {
  return this.groupInvitationService.validateInvitation(slug, token);
}

// Accept group invitation
@Post(':slug/accept-invitation')
@UseGuards(JWTAuthGuard)
async acceptInvitation(
  @Param('slug') slug: string,
  @Query('token') token: string,
  @AuthUser() user: User
): Promise<GroupMemberEntity> {
  return this.groupInvitationService.acceptInvitation(
    slug,
    token,
    user.id
  );
}

// Revoke group invitation
@Delete(':slug/invitations/:token')
@UseGuards(JWTAuthGuard, PermissionsGuard)
@Permissions({
  context: 'group',
  permissions: [GroupMemberPermission.ManageGroup]
})
async revokeInvitation(
  @Param('slug') slug: string,
  @Param('token') token: string
): Promise<{ removed: number }> {
  return this.groupInvitationService.revokeInvitation(slug, token);
}
```

---

### Missing: Group Teaser Pages

**Need to specify:**

#### Logged-Out User Viewing Private Group
```
┌─────────────────────────────────────┐
│  🔒 Private Group                   │
├─────────────────────────────────────┤
│  This is a private group.            │
│  You must log in and be a member    │
│  to view group details.              │
│                                      │
│  [ Log In ]  [ Create Account ]     │
└─────────────────────────────────────┘
```

**HTTP Response:** 403 Forbidden

#### Logged-In User (Not Member) Viewing Private Group
```
┌─────────────────────────────────────┐
│  🔒 Executive Board                 │
├─────────────────────────────────────┤
│  Created by: John Smith              │
│  Members: 12                         │
│                                      │
│  A private group for executive...   │
│  (truncated description)             │
│                                      │
│  This is a private group.            │
│  You can request to join.            │
│                                      │
│  [ Request to Join ]                 │
└─────────────────────────────────────┘
```

**HTTP Response:** 200 OK (teaser page)

**Shown (Teaser Info):**
- ✅ Group name
- ✅ Creator name
- ✅ Brief description (first 100 chars)
- ✅ "Private group" badge
- ✅ Member count (anonymized number)

**Hidden (Member-Only Info):**
- ❌ Full description
- ❌ Member list
- ❌ Events list
- ❌ Discussions
- ❌ Files/resources

---

### Missing: Group VisibilityGuard Logic

**Need to expand VisibilityGuard to handle groups properly:**

```typescript
private async checkGroupVisibility(
  slug: string,
  user: any,
  request: any
): Promise<boolean> {
  const group = await this.groupService.findGroupBySlug(slug);

  if (!group) {
    throw new NotFoundException('Group not found');
  }

  // Only allow access to active groups
  if (group.status !== GroupStatus.Active) {
    throw new NotFoundException('Group not found');
  }

  switch (group.visibility) {
    case GroupVisibility.Public:
      return true;

    case GroupVisibility.Unlisted:
      return true;  // Anyone with link can view

    case GroupVisibility.Private:
      if (!user) {
        // Store requested URL for redirect after login
        request.session.returnTo = request.url;
        throw new ForbiddenException(
          'This is a private group. Please log in to view.'
        );
      }

      // Check if user is a member
      const member = await this.groupMemberService
        .findGroupMemberByUserId(group.id, user.id);

      if (!member) {
        // Logged in but not a member - show teaser page
        request.showTeaserPage = true;
        return true;
      }

      return true;  // User is a member

    default:
      throw new ForbiddenException('Invalid group visibility');
  }
}
```

---

### Missing: Group Migration Strategy

**Need to document:**

1. **Identify affected private groups:**
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

2. **Email template for group creators:**
```
Subject: Action Required: Security Update for "{GROUP_NAME}"

Hi {CREATOR_NAME},

We're fixing a security issue with private groups. Your group "{GROUP_NAME}"
is currently accessible to anyone with the link (unintended).

Choose how to handle your group:

1. Convert to "Unlisted" - Anyone with link can view (current behavior)
   [Convert to Unlisted Button]

2. Keep as "Private" - Requires login + membership to view
   [Keep Private Button]

If no response by {DEADLINE}: We'll convert to "Unlisted" to maintain
current link-sharing behavior.

Group: {GROUP_NAME}
Members: {MEMBER_COUNT}
Events: {EVENT_COUNT}
```

3. **Auto-create invitations for existing members:**
```typescript
async function createInvitationsForExistingMembers(groupId: number) {
  const group = await this.groupRepository.findOne({
    where: { id: groupId },
    relations: ['members']
  });

  for (const member of group.members) {
    await this.groupInvitationService.createInvitation({
      groupId: group.id,
      userId: member.userId,
      token: generateSecureToken(),
      expiresAt: null, // No expiry for existing members
      createdByUserId: group.createdBy,
    });
  }
}
```

---

### Missing: Group E2E Tests

**Need to add test coverage for:**

```typescript
// Test: Private group - logged out
it('should return 403 for private group when logged out');

// Test: Private group - logged in (not member)
it('should show teaser page when logged in but not a member');

// Test: Group invitation token flow
it('should grant access via invitation token');

// Test: Activity feed privacy
it('should not show private group activities in sitewide feed');

// Test: Activity feed membership enforcement
it('should only show members_only activities to group members');
```

---

## 4. Testing Gaps

### Issue 4.1: Current Tests Mask the VisibilityGuard Bug

**File:** test/group/group-private-access.e2e-spec.ts

**Lines 57, 78, 97:** Tests manually set headers that are never set in production:
```typescript
.set('x-group-slug', privateGroup.slug)  // ❌ Never set in production
```

**Line 60:** Test expects 200 for unauthenticated private group access:
```typescript
expect(response.status).toBe(200);  // ❌ Should be 403!
```

**This test actually validates the WRONG behavior!**

**Should be:**
```typescript
it('should return 403 for private group when not a member', async () => {
  // Try to access the private group without authentication
  const response = await request(TESTING_APP_URL)
    .get(`/api/groups/${privateGroup.slug}`)
    .set('x-tenant-id', TESTING_TENANT_ID);
    // ❌ Remove: .set('x-group-slug', privateGroup.slug)

  // Should return 403 since it's a private group
  expect(response.status).toBe(403);
  expect(response.body.message).toContain('log in');
});
```

**Files to Fix:**
- test/group/group-private-access.e2e-spec.ts (remove header workarounds, fix expectations)
- Create new test file: test/event/event-visibility-compliance.e2e-spec.ts (mentioned in issue #379)

---

## 5. Documentation Structure

### Recommended File Organization

**Current (Events Only):**
```
design-notes/
├── visibility-model-v2-private-events.md          ✅ EXISTS
├── visibility-model-v2-private-events-impl.md     ✅ EXISTS
└── event-visibility-and-permissions.md            📝 OLD (to be replaced)
```

**Recommended (Events + Groups):**
```
design-notes/
├── visibility-model-v2-private-events.md          ✅ Keep (with corrections)
├── visibility-model-v2-private-events-impl.md     ✅ Keep (with corrections)
├── visibility-model-v2-private-groups.md          ❌ CREATE
├── visibility-model-v2-private-groups-impl.md     ❌ CREATE
├── visibility-model-v2-corrections.md             ✅ THIS FILE
└── event-visibility-and-permissions.md            📝 Replace after V2 complete
```

**GitHub Issues:**
```
#379 - Visibility Model V2: Events          ✅ EXISTS (needs corrections)
#380 - Visibility Model V2: Groups          ❌ CREATE
```

---

## 6. Priority Order for Fixes

### P0: Critical Security Issues
1. ✅ Fix VisibilityGuard to read from params (not headers)
2. ✅ Fix activity feed endpoints to enforce membership checks
3. ✅ Fix activity feed scope logic (no unlisted/private in sitewide)

### P1: Core V2 Features
4. ✅ Implement event invitation system
5. ✅ Implement group invitation system
6. ✅ Implement event teaser pages
7. ✅ Implement group teaser pages
8. ✅ Rename authenticated → unlisted

### P2: Migration & Safety
9. ✅ Pre-migration notifications
10. ✅ Migration preference tracking
11. ✅ Auto-create invitations for existing attendees/members

### P3: Testing & Validation
12. ✅ Fix existing broken tests
13. ✅ Add comprehensive E2E test coverage
14. ✅ Validate activity feed privacy

---

## Summary

**Total Corrections Needed:**
- 3 design doc corrections (activity feed rules)
- 1 critical security fix (activity feed membership enforcement)
- 4 missing group components (invitations, teaser, VisibilityGuard, migration)
- 1 test suite fix (remove header workarounds)
- 6 current code fixes (activity feed listener cleanup)

**Recommended Approach:**
1. Apply all corrections to existing V2 event docs
2. Create parallel V2 group docs
3. Update issue #379 with corrections
4. Create issue #380 for groups
5. Implement events first (6 weeks), then groups (4 weeks)

---

**Next Steps:**
1. Review and approve corrections
2. Update V2 design documents
3. Create group-specific V2 documents
4. Update GitHub issues
5. Begin implementation

