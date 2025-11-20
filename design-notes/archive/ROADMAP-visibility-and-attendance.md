# OpenMeet: Visibility & Attendance Management Roadmap

> **⚠️ DEPRECATED:** This document represents the complete 21-week vision.
>
> **See instead:** `ACCESS-AND-ATTENDANCE-ROADMAP.md` for the phased MVP → V2 → Future approach.
>
> **This document is kept for reference** showing the full feature set, but implementation follows the new roadmap's prioritization.

**Date:** 2025-11-19
**Status:** 📚 Reference Document (Full Feature Set)

---

## Overview

This roadmap consolidates all features for the Visibility Model V2 and Event Attendance Management systems based on the approved design documents.

**NOTE:** This represents the complete vision. The actual implementation is split into:
- **MVP** (2-4 weeks): Security fixes, basic private events, simple RSVP
- **V2** (2-3 months): Invitations, waitlist, two-step RSVP
- **Future** (6+ months): Advanced features

**Key Documents:**
- `visibility-model-v2-private-events.md` - Private events design
- `visibility-model-v2-private-groups.md` - Private groups design
- `event-attendance-management.md` - RSVP and capacity management
- `visibility-model-v2-private-events-impl.md` - Implementation plan

---

## Feature Summary

### Visibility Model V2
- **Three-tier visibility:** Public, Unlisted (renamed from Authenticated), Private
- **True private events/groups:** Require authentication + invitation/membership
- **Zero information disclosure:** No data leakage for private entities
- **Activity feed privacy:** Only public standalone entities in sitewide feed
- **All event-group combinations supported:** 9 possible visibility combinations

### Attendance Management
- **Two-step invitation process:** Invitation (view access) → RSVP (attendance)
- **Simple user choices:** Going or Not Going
- **System-managed statuses:** Invited, Pending, Waitlist, Rejected, Attended
- **Capacity management:** Hard limits with waitlist system
- **Guest policies:** Configurable +N guests per RSVP
- **Waitlist system:** 24-hour claim windows, automatic progression
- **RSVP cutoffs:** Configurable deadlines for final headcount

### Invitation Systems
- **Email-locked invitations:** Multi-email account support
- **Three invitation methods:** Shareable links, email lists, platform user search
- **Viral invitations:** Attendees can invite others (configurable depth)
- **Token management:** Expiration, max uses, revocation, tracking

---

## Implementation Phases

### Phase 0: Pre-Migration & Audit (2 weeks)

**Goal:** Identify affected events/groups and collect host preferences

**Tasks:**
- [ ] Query all events with `visibility: 'private'`
- [ ] Query all groups with `visibility: 'private'`
- [ ] Create `visibility_migration_preferences` table
- [ ] Email all affected hosts with migration options
- [ ] Track host responses (convert to unlisted vs keep private)
- [ ] Set default behavior for non-responders (auto-convert to unlisted)

**Deliverables:**
- Migration tracking system
- Host notification emails sent
- All preferences recorded

**Timeline:** Weeks -2 to 0 (before deployment)

---

### Phase 1: Core Visibility & Security Fix (6 weeks)

**Priority:** P0 - Critical Security Issue

#### Week 1: Database Migration
- [ ] Rename `authenticated` → `unlisted` in events table
- [ ] Rename `authenticated` → `unlisted` in groups table
- [ ] Rename `authenticated` → `unlisted` in activity_feed table
- [ ] Update TypeScript enums (EventVisibility, GroupVisibility)
- [ ] Update all code references to use new enum values

#### Week 2: VisibilityGuard Security Fix
- [ ] Fix VisibilityGuard to read from URL params (not headers)
- [ ] Implement hard 403 for private events (no teaser pages)
- [ ] Implement hard 403 for private groups (no teaser pages)
- [ ] Add group membership verification
- [ ] Remove all teaser page code from frontend

#### Week 3-4: Event Invitation System
- [ ] Create `event_invitations` table
- [ ] Create `event_invitation_uses` table
- [ ] Build invitation token generation API
- [ ] Build invitation validation API
- [ ] Build invitation acceptance API (with email verification)
- [ ] Implement email-locked validation
- [ ] Create auto-invitations for existing private event attendees

#### Week 5-6: Testing & Deployment
- [ ] Write E2E tests for all visibility scenarios
- [ ] Test invitation flows (shareable links, email, platform users)
- [ ] Test email-locked invitation validation
- [ ] Test activity feed privacy enforcement
- [ ] Deploy to production
- [ ] Monitor for issues

**Deliverables:**
- Secure visibility system with hard 403s
- Working event invitation system
- Zero information disclosure for private entities
- All existing private events/groups migrated

---

### Phase 2: Attendance Management (4 weeks)

**Priority:** P1 - Core MVP Features

#### Week 7-8: Core RSVP System
- [ ] Implement two-step invitation→RSVP process
- [ ] Update EventAttendee model with new statuses
- [ ] Build RSVP API endpoints (Going/Not Going)
- [ ] Implement capacity tracking
- [ ] Build guest/+1 policy system
- [ ] Implement RSVP cutoff dates
- [ ] Host dashboard for attendee management

#### Week 9-10: Waitlist System
- [ ] Implement automatic waitlist when capacity reached
- [ ] Build waitlist progression logic
- [ ] Implement 24-hour claim windows
- [ ] Build notification system for spot availability
- [ ] Handle waitlist after RSVP cutoff
- [ ] Waitlist claim deadline handling

**Deliverables:**
- Working RSVP system with Going/Not Going
- Capacity enforcement with waitlists
- Guest policy configuration
- RSVP cutoffs

---

### Phase 3: Group Integration (4 weeks)

**Priority:** P1 - Core Features

#### Week 11-12: Group Invitation System
- [ ] Create `group_invitations` table
- [ ] Create `group_invitation_uses` table
- [ ] Build group invitation token generation API
- [ ] Build group invitation validation API
- [ ] Build group invitation acceptance API
- [ ] Implement email-locked validation for groups
- [ ] Create auto-invitations for existing private group members

#### Week 13-14: Group-Event Integration
- [ ] Implement group membership → event auto-access
- [ ] Handle member removal → event access revocation
- [ ] Test all 9 event-group visibility combinations
- [ ] Group activity feed privacy enforcement
- [ ] Add membership checks to group feed endpoints

**Deliverables:**
- Working group invitation system
- Group membership grants event access
- All visibility combinations working

---

### Phase 4: Advanced Invitations (3 weeks)

**Priority:** P2 - Enhanced Features

#### Week 15-16: Viral Invitations
- [ ] Implement attendee invitation permissions
- [ ] Build invitation depth control (1 level, 2 levels, unlimited)
- [ ] Track invitation trees (who invited whom)
- [ ] Host dashboard for invitation management
- [ ] Revocation with cascading removal

#### Week 17: Email Invitations & Analytics
- [ ] Build email invitation system
- [ ] Track invitation sources and usage
- [ ] Invitation analytics dashboard
- [ ] Inline RSVP buttons in emails (optional)

**Deliverables:**
- Viral invitation system
- Email invitation tracking
- Host analytics

---

### Phase 5: Activity Feed Privacy (2 weeks)

**Priority:** P0 - Critical Security Fix

#### Week 18-19: Feed Access Control
- [ ] Fix activity feed visibility mapping
- [ ] Implement feed scope logic (sitewide/group/event)
- [ ] Add membership verification to group feed endpoints
- [ ] Add attendee verification to event feed endpoints
- [ ] Remove anonymized sitewide activities for private entities
- [ ] Update activity feed listener logic

**Deliverables:**
- Secure activity feed endpoints
- No private entity leakage in sitewide feed
- Membership/attendee-only access enforced

---

## Feature Matrix

### Visibility Features

| Feature | Public | Unlisted | Private |
|---------|--------|----------|---------|
| Search indexed | ✅ Yes | ❌ No | ❌ No |
| Anyone with link can view | ✅ Yes | ✅ Yes | ❌ No (auth required) |
| Login required | ❌ No | ❌ No | ✅ Yes |
| Invitation required | ❌ No | ❌ No | ✅ Yes |
| Link previews (OG tags) | ✅ Yes | ✅ Yes | ❌ No |
| Sitewide activity feed | ✅ Yes (standalone) | ❌ No | ❌ No |

### Attendance Features

| Feature | Status |
|---------|--------|
| Two-step invitation process | ✅ Phase 2 |
| Going/Not Going RSVP | ✅ Phase 2 |
| Capacity management | ✅ Phase 2 |
| Waitlist system | ✅ Phase 2 |
| 24-hour claim windows | ✅ Phase 2 |
| Guest/+1 policies | ✅ Phase 2 |
| RSVP cutoff dates | ✅ Phase 2 |
| Viral invitations | ✅ Phase 4 |
| Email invitations | ✅ Phase 4 |
| Invitation analytics | ✅ Phase 4 |

### Invitation Methods

| Method | Event Support | Group Support |
|--------|---------------|---------------|
| Shareable links with tokens | ✅ Phase 1 | ✅ Phase 3 |
| Email list invitations | ✅ Phase 4 | ✅ Phase 3 |
| Platform user search | ✅ Phase 1 | ✅ Phase 3 |
| Email-locked validation | ✅ Phase 1 | ✅ Phase 3 |
| Multi-email account support | ✅ Phase 1 | ✅ Phase 3 |

---

## Event-Group Visibility Combinations

All 9 combinations are supported:

| Group Visibility | Event Visibility | Who Can View Event | Use Case |
|-----------------|------------------|-------------------|----------|
| Public | Public | ✅ Everyone | Community yoga class |
| Public | Unlisted | ✅ Anyone with link | Study group (not advertised) |
| Public | Private | 🔐 Invited only | Memorial service for member |
| Unlisted | Public | ✅ Everyone (indexed) | Rare - event more public than group |
| Unlisted | Unlisted | ✅ Anyone with link | Friend group game night |
| Unlisted | Private | 🔐 Invited only | Private birthday within friend group |
| Private | Public | ✅ Everyone (indexed) | Open membership recruitment night |
| Private | Unlisted | ✅ Anyone with link | Member-shared event, not searchable |
| Private | Private | 🔐 Members only (auto) | Executive board meeting |

---

## Database Requirements

### New Tables

**Event Invitations:**
- `event_invitations` - Invitation tokens and metadata
- `event_invitation_uses` - Track who used which invitation

**Group Invitations:**
- `group_invitations` - Invitation tokens and metadata
- `group_invitation_uses` - Track who used which invitation

**Migration Tracking:**
- `visibility_migration_preferences` - Track host migration choices

**User Emails:**
- `user_emails` - Multiple verified emails per user (for email-locked invitations)

### Schema Updates

**EventAttendee Status Enum:**
- `invited` - Accepted invitation, can view, hasn't RSVP'd
- `confirmed` - Going (counts against capacity)
- `cancelled` - Not Going
- `pending` - Awaiting host approval
- `waitlist` - On waitlist (event full)
- `rejected` - Host rejected
- `attended` - Actually showed up (post-event)
- Remove: `maybe` (not used in simplified flow)

---

## Testing Requirements

### E2E Test Coverage

**Visibility:**
- [ ] Private event - logged out → 403
- [ ] Private event - logged in (not invited) → 403
- [ ] Private event - invited → 200
- [ ] Unlisted event - anyone → 200
- [ ] Public event - anyone → 200
- [ ] Same tests for groups

**Invitations:**
- [ ] Email-locked invitation validation
- [ ] Multi-email account support
- [ ] Invitation token expiration
- [ ] Invitation token revocation
- [ ] Viral invitation depth control

**Attendance:**
- [ ] RSVP with capacity enforcement
- [ ] Waitlist progression
- [ ] 24-hour claim windows
- [ ] Guest policies
- [ ] RSVP cutoffs

**Activity Feed:**
- [ ] No private entity activities in sitewide feed
- [ ] Group feed requires membership
- [ ] Event feed requires attendance/invitation

---

## Success Metrics

### Security
- [ ] Zero unauthorized access to private events/groups
- [ ] Zero information disclosure for private entities
- [ ] Activity feed endpoints enforce access control
- [ ] Email-locked invitations work correctly

### Functionality
- [ ] All 9 event-group combinations work
- [ ] Two-step invitation→RSVP process working
- [ ] Waitlist system functioning
- [ ] Capacity enforcement accurate
- [ ] Viral invitations controlled by depth

### Migration
- [ ] 100% of affected hosts notified
- [ ] All host preferences honored
- [ ] No broken links after migration
- [ ] Existing members/attendees retain access

---

## Risk Mitigation

### High-Risk Areas

**VisibilityGuard Bug:**
- Currently broken (reads headers not params)
- All private events/groups are accessible
- **Mitigation:** Fix in Phase 1 Week 2, deploy ASAP

**Activity Feed Leaks:**
- Private activities may appear in public feeds
- **Mitigation:** Fix in Phase 5, add access control

**Migration Complexity:**
- Hosts may not respond to migration email
- **Mitigation:** Default to unlisted (maintains current behavior)

### Rollback Plan

**Database Backup:**
- Create `events_visibility_backup_v2` before migration
- Create `groups_visibility_backup_v2` before migration

**Rollback SQL:**
- Restore visibility from backup tables
- Revert enum changes
- Remove invitation tables

---

## Future Enhancements (Post-MVP)

**Not in initial roadmap:**
- Ticketing integration (paid tickets + free invitations)
- Check-in system (QR codes, attendance tracking)
- RSVP analytics (flaky users, no-show rates)
- Advanced waitlist (priority, paid, expiration)
- Guest name collection (security/venue requirements)
- Approval workflow (questionnaires, conditional approval)
- Capacity decrease (move recent RSVPs to waitlist)

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 0 | 2 weeks | Pre-migration audit, host notifications |
| Phase 1 | 6 weeks | Core visibility, security fix, event invitations |
| Phase 2 | 4 weeks | RSVP system, capacity, waitlist |
| Phase 3 | 4 weeks | Group invitations, group-event integration |
| Phase 4 | 3 weeks | Viral invitations, email invitations |
| Phase 5 | 2 weeks | Activity feed security |

**Total Duration:** ~21 weeks (5 months)

**Critical Path:** Phase 0 → Phase 1 (security fix must be deployed before others)

**Parallel Work Possible:**
- Phase 2 and Phase 3 can overlap if resources allow
- Phase 4 can start during Phase 3
- Phase 5 can be deployed independently

---

## Next Steps

1. **Review and approve this roadmap**
2. **Create GitHub issues** for each phase
3. **Assign priorities** (P0, P1, P2)
4. **Allocate resources** and timeline
5. **Begin Phase 0** (pre-migration audit)

---

**Status:** 📋 Ready for Review
**Created:** 2025-11-19
**Last Updated:** 2025-11-19
