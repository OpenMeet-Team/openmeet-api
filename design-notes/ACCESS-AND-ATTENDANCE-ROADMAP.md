# Access & Attendance System Roadmap

**Last Updated:** 2025-01-19
**Status:** Active Development Plan

---

## Overview

The Access & Attendance System controls who can view events/groups and how users RSVP to events. This roadmap defines a phased approach prioritizing security, simplicity, and user value.

**System Name:** Access & Attendance
**Scope:** Events and Groups visibility, permissions, invitations, and RSVP management

---

## MVP (Weeks 1-4) - Security & Foundations

**Goal:** Fix critical security issues, ship working private events with simple RSVP

**Estimated Effort:** 3-4 weeks
**Priority:** P0 (Critical)

**Status:** Validated against codebase on 2025-01-19

### P0: Security Fixes (Week 1) - 7 days

**Critical vulnerabilities to fix immediately:**

1. **Fix VisibilityGuard** - Currently broken, allows unauthorized access
   - Problem: Reads from `request.headers['x-event-slug']` which is never set
   - Location: `src/shared/guard/visibility.guard.ts:32-33`
   - Solution: Read from `request.params.slug` first, headers as fallback
   - Impact: Private events/groups currently accessible to anyone (service-layer workaround exists)
   - Effort: 1 day
   - Files affected: `visibility.guard.ts`, `visibility.guard.spec.ts`

2. **Fix Event Series Group Association** - Series events lose groupId ⭐ NEW
   - Problem: Series events don't inherit groupId from parent event
   - Location: Documented in `/design-notes/architecture-issues.md`
   - Impact: Private group series events won't respect group membership access
   - Effort: 1 day

3. **Fix Activity Feed - Group Membership Check** - Missing authorization
   - Problem: `GET /groups/:slug/feed` doesn't verify group membership
   - Location: `src/activity-feed/activity-feed.controller.ts:103-144`
   - Solution: Add membership check before returning group activities
   - Impact: Non-members can see private group activities
   - Effort: 1 day

4. **Fix Activity Feed - Event Attendee Check** - Missing authorization
   - Problem: `GET /events/:slug/feed` doesn't verify attendee status
   - Location: `src/activity-feed/activity-feed.controller.ts:174-223`
   - Solution: Add attendee check before returning event activities
   - Impact: Non-attendees can see private event activities
   - Effort: 1 day

5. **Fix Activity Feed - Sitewide Privacy Filter** - Information disclosure ⭐ NEW
   - Problem: Sitewide feed shows activities from private events/groups
   - Location: `src/activity-feed/activity-feed.controller.ts:29-81`
   - Solution: Filter activities by source entity visibility
   - Impact: Private event RSVPs appear in public sitewide feed
   - Effort: 1 day

6. **Rename Authenticated → Unlisted** - Confusing terminology
   - Problem: "Authenticated" doesn't match industry standard (YouTube, GitHub use "Unlisted")
   - Solution: DB migration + code update to use "Unlisted"
   - Impact: Breaking change, needs migration
   - Effort: 2 days
   - Files affected: `constant.ts`, migration script, all references

### P1: Three-Tier Visibility Model (Week 1-2) - ✅ ALREADY IMPLEMENTED

**Status:** Already working in codebase! Just needs bug fixes above.

**Public:**
- Anyone can view (logged in or out)
- Appears in search/discovery
- Anyone can RSVP (requires login)
- Implementation: `EventVisibility.Public` / `GroupVisibility.Public`

**Unlisted:** (currently "Authenticated")
- Anyone with link can view (logged in or out)
- Does NOT appear in search/discovery
- Anyone can RSVP (requires login)
- Implementation: `EventVisibility.Authenticated` (to be renamed)

**Private:**
- Must be invited/member to view
- Hard 403 Forbidden if not authorized (no teaser pages)
- Requires login + invitation/membership
- Implementation: `EventVisibility.Private` with guard checks

**Code Locations:**
- Enums: `src/core/constants/constant.ts:92-108`
- Guard: `src/shared/guard/visibility.guard.ts`
- Service filtering: `src/event/services/event-query.service.ts:290-325`

**Effort:** 0 days (already done, just fix bugs)

### P2: Private Event Access (Week 2-3) - 5 days

**How users gain access to private events:**

1. **Group Membership Grants Access** - ✅ ALREADY WORKING
   - Private event in private group → all group members can view
   - Group members (not Guests) can see event without explicit invitation
   - Can RSVP Going/Not Going once they view it
   - Implementation: `src/shared/guard/visibility.guard.ts:103-120`
   - Also used in: `src/event/services/event-management.service.ts` (requireGroupMembership flag)
   - Effort: 0 days (already implemented)

2. **Manual Add Attendees**
   - Host can add specific users to any private event
   - Creates `eventAttendee` record with status: `invited`
   - Invited users can view event and RSVP
   - Backend: ✅ Already exists (`EventAttendeeService`)
   - Frontend: ❌ Needs "Manage Attendees" admin UI panel
   - Effort: 3 days (frontend work)
   - Files: New frontend component + API integration

3. **RSVP Pre-Access Check** - ⭐ NEW REQUIREMENT
   - Problem: User can currently RSVP to private event without invitation check
   - Solution: Add visibility check before allowing RSVP
   - Location: `src/event/services/event-management.service.ts:1350`
   - Effort: 1 day

4. **Private Access Flow Tests**
   - E2E tests for group membership access
   - E2E tests for manual attendee addition
   - Integration tests for visibility rules
   - Effort: 1 day

### P3: Simple RSVP (Week 3-4) - SCOPE DECISION NEEDED

**Original MVP Plan:**
- `Confirmed` = "Going" (counts toward capacity)
- `Cancelled` = "Not Going" (does not count)

**Current Code Reality:**
- ✅ All 8 statuses already implemented: `invited`, `confirmed`, `attended`, `cancelled`, `rejected`, `maybe`, `pending`, `waitlist`
- ✅ Capacity enforcement working (via `allowWaitlist` flag)
- ✅ Approval workflows working (via `requireApproval` flag)
- ✅ Backend logic complete

**⚠️ DECISION NEEDED:** What to do with existing V2 features?

**Option 1: Keep Existing Implementation** (RECOMMENDED)
- Keep: `confirmed`, `cancelled`, `invited`, `pending`, `waitlist`
- Remove: `maybe` (genuinely unclear behavior)
- Remove: `attended`, `rejected` (not needed for MVP)
- Pro: Already tested and working
- Con: More complexity than "simple RSVP"
- Effort: 3 days (frontend UI + tests)

**Option 2: Strictly MVP - Confirmed/Cancelled Only**
- Remove all other statuses from UI
- Keep code but hide features
- Pro: Simpler user experience
- Con: Throwing away working code
- Effort: 2 days (UI simplification)

**Option 3: Full Feature Set**
- Keep all 8 statuses
- Ship complete RSVP system now
- Pro: Maximum features for users
- Con: Most complex, might delay MVP
- Effort: 5 days (complete frontend + tests)

**Work Items (assuming Option 1):**
1. Frontend RSVP status UI (2 days)
2. Event full messaging (1 day)
3. Capacity enforcement tests (1 day)
4. Remove `maybe` status from codebase (0.5 days)

**Total Effort:** 4 days

---

## 📊 MVP Summary (After Code Review)

### Revised Timeline

| Phase | Original Est. | Actual Work | Status |
|-------|--------------|-------------|--------|
| P0: Security Fixes | 4 days | 7 days | ⚠️ +3 days (new issues found) |
| P1: Visibility Model | 5 days | 0 days | ✅ Already implemented |
| P2: Private Access | 5 days | 5 days | ⚠️ Backend done, needs frontend |
| P3: Simple RSVP | 4 days | 2-5 days | ⚠️ Scope decision needed |
| **Total** | **18 days** | **14-19 days** | **3-4 weeks** |

### Critical Findings

**Good News:**
- ✅ Visibility model fully implemented
- ✅ Group membership access working
- ✅ RSVP backend complete with advanced features
- ✅ Capacity enforcement working
- ✅ Service-layer workarounds prevent worst security issues

**Bad News:**
- ❌ VisibilityGuard bug confirmed (header vs params)
- ❌ Activity feed has NO access controls (major security issue)
- ❌ Event series lose groupId (private group series broken)
- ❌ Sitewide feed leaks private activities
- ❌ RSVP endpoint missing visibility pre-check

### Scope Decisions Required

Before creating GitHub issues, we need to decide:

1. **RSVP Status Set** - Which statuses to keep?
   - Option A: Confirmed/Cancelled only (strictly MVP)
   - Option B: Add Invited/Pending/Waitlist (already implemented)
   - Option C: Keep all 8 statuses (maximum features)

2. **Guard Architecture** - How to handle duplicated checks?
   - Option A: Fix guard only, keep service checks (belt + suspenders)
   - Option B: Fix guard, remove service checks (clean architecture)
   - Option C: Document both as intentional (pragmatic)

3. **Activity Feed Scope** - How deep to fix?
   - Quick fix: Add membership/attendee checks to endpoints (MVP)
   - Full fix: Redesign activity visibility model (V2)

### Risk Assessment

**High Risk:**
- Database migration for Unlisted rename
- Guard pattern changes might affect unknown endpoints
- Frontend dependency for Manual Add Attendees UI

**Medium Risk:**
- Activity feed query performance
- E2E test coverage for private access flows
- Scope creep from stakeholder requests

**Low Risk:**
- Backend implementation (mostly done)
- RSVP status cleanup
- Bug fixes for specific issues

### Next Steps

1. **Answer scope decisions** (this discussion)
2. **Create detailed GitHub issues** with file paths and acceptance criteria
3. **Assign priorities** (P0, P1, P2)
4. **Start implementation** with P0 security fixes

---

## V2 (Months 2-3) - Enhanced Features

**Goal:** Add invitation system, waitlist, two-step RSVP

**Estimated Effort:** 6-8 weeks
**Priority:** P1 (High Value)

### Invitation Token System (2-3 weeks)

**User Story:** Host wants to generate shareable invitation links with control over usage

**Features:**
- Token-based invitations (not single shared code)
- Shareable links with expiration
- Per-user or multi-use tokens
- Revocation support
- Usage tracking and analytics

**Database:**
```sql
event_invitations {
  id, event_id, token,
  created_by_user_id, invited_user_id,
  max_uses, uses_count,
  expires_at, revoked_at
}
```

**Why not in MVP?**
- Group membership + manual add covers most use cases
- Proper invitation system requires careful design
- Can add incrementally after MVP ships

### Waitlist System (1-2 weeks)

**User Story:** Users want to join waitlist when event is full

**Features:**
- `Waitlist` status when event is full
- Auto-promotion when spots open (FIFO)
- Notification system for promotions
- Waitlist visibility on event page

**Implementation:**
- Requires event status tracking system
- Notification infrastructure
- Background jobs for auto-promotion

### Two-Step RSVP Flow (1-2 weeks)

**User Story:** Separate viewing access from attendance commitment

**Current (MVP):** View event → RSVP Going (immediately confirmed)

**V2 Flow:**
1. Accept invitation → Status: `invited` (can view, not attending yet)
2. RSVP Going → Status: `confirmed` (attending, counts toward capacity)

**Benefits:**
- Invited users don't count toward capacity until they commit
- Clearer distinction between "can view" and "will attend"
- Supports larger invitation lists

### Approval Workflows (2-3 weeks)

**User Story:** Host wants to manually approve RSVPs for sensitive events

**Features:**
- `Pending` status for users awaiting approval
- Host dashboard to approve/reject
- `Rejected` status with optional message
- Notification flow for approval decisions

**Use Cases:**
- Exclusive events
- Age-restricted events
- Events with questionnaires

---

## Future (6+ Months) - Advanced Features

**Goal:** Enterprise features based on user feedback

**Priority:** P2 (Nice to Have)

### Viral Invitations
- Attendees can invite others (with depth control)
- Track invitation chains
- Limit viral spread per user

### Email Invitations
- Send invitations via email
- Track opens and clicks
- Bulk invitation management

### Guest +N Policies
- Allow attendees to bring guests
- Track guest count per attendee
- Separate capacity for guests

### RSVP Cutoffs
- Set deadline for RSVPs
- Lock RSVPs after cutoff
- Reminder emails before cutoff

### Ticketing Integration
- Paid tickets (Stripe)
- Free tickets with registration
- Ticket types (General, VIP, etc.)

### Advanced Analytics
- RSVP conversion rates
- No-show tracking
- Flaky user identification
- Invitation effectiveness

---

## Design Decisions & Rationale

### Why No Single-Code Invitations in MVP?

**Considered:** One invitation code per event (like "join-party123")

**Decision:** Skip it

**Rationale:**
1. **Throwaway code** - Would be entirely replaced by proper invitation system in V2
2. **Migration pain** - All shared links would break when migrating to token system
3. **V2 is close** - Only 2-3 months away, not worth the technical debt
4. **Alternative exists** - Group membership + manual add covers use cases

**Better approach:** Build permanent features (group membership, manual add) that continue working when V2 ships

### Why No Teaser Pages?

**Considered:** Show limited info (name, host) for private entities with "Request Access" button

**Decision:** Hard 403 Forbidden only

**Rationale:**
1. **Simpler security** - No information disclosure at all
2. **Clear boundaries** - Either you can access it or you can't
3. **MVP focus** - Can add teaser pages later if users request
4. **Consistent model** - Same approach for events and groups

### Why Remove "Maybe" Status?

**Considered:** Keep Maybe for "interested but not committed"

**Decision:** Remove from MVP

**Rationale:**
1. **Ambiguous** - Does Maybe count toward capacity? Unclear.
2. **Low value** - Most events need "Going" or "Not Going" only
3. **Complexity** - Adds edge cases throughout system
4. **Can restore** - Keep enum value, can re-add in V2 if requested

### Why Group Membership + Manual Add Instead of Invitations?

**Decision:** Two-pronged approach for private event access

**Rationale:**
1. **Permanent features** - Both continue working when invitation system launches
2. **Covers use cases** - Group events (membership) + standalone events (manual add)
3. **No migration** - Features don't get replaced, only enhanced
4. **Fast to ship** - ~1 week vs 2-3 weeks for full invitation system

---

## Success Metrics

### MVP Success Criteria

**Security:**
- ✅ Zero unauthorized access to private events/groups
- ✅ All visibility rules enforced correctly
- ✅ Activity feed respects privacy settings

**Functionality:**
- ✅ Users can RSVP Going or Not Going
- ✅ Capacity limits enforced (no overbooking)
- ✅ Group members can access private group events
- ✅ Hosts can manually add attendees to private events

**Quality:**
- ✅ All edge cases tested
- ✅ Clear error messages
- ✅ No half-implemented features

### V2 Success Criteria

**Invitations:**
- ✅ Host can generate shareable invitation links
- ✅ Links respect expiration and revocation
- ✅ Usage tracking works correctly

**Waitlist:**
- ✅ Users auto-promoted when spots open
- ✅ Notifications sent reliably
- ✅ Waitlist visible on event page

**Two-Step RSVP:**
- ✅ Invited users don't count toward capacity
- ✅ Clear distinction between invited and confirmed
- ✅ Smooth transition from invited → confirmed

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **MVP** | Weeks 1-4 | Security fixes, three-tier visibility, simple RSVP, private access (group + manual) |
| **V2** | Months 2-3 | Invitation tokens, waitlist, two-step RSVP, approval workflows |
| **Future** | 6+ months | Viral invitations, email invites, guest policies, advanced features |

---

## Related Documents

**Active:**
- `visibility-model-v2-private-events.md` - Private event specifications
- `visibility-model-v2-private-groups.md` - Private group specifications
- `event-attendance-management.md` - Attendance and RSVP flows (V2 features)
- `activity-feed-system.md` - Activity feed visibility rules

**Archived:**
- `archive/event-visibility-and-permissions.md` - Original design (superseded)
- `archive/visibility-model-v2-corrections.md` - One-off corrections (obsolete)
- `archive/visibility-model-v2-private-events-impl.md` - Implementation notes (code is source of truth)

---

## Next Steps

1. **Review and approve roadmap** with team
2. **Create GitHub issues** for MVP features
3. **Start with P0 security fixes** (Week 1)
4. **Implement private event access** (Week 2-3)
5. **Ship MVP to production** (Week 4)
6. **Gather user feedback** before starting V2
