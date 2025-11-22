# Visibility Model V2: Private Groups

**Status:** 📋 Ready for Review
**Date:** 2025-11-18
**Parallel to:** `visibility-model-v2-private-events.md`
**Related:** Issue #380 (to be created), `event-visibility-and-permissions.md`, `activity-feed-system.md`

---

## Executive Summary

This document defines the V2 visibility model for **Groups**, following the same security principles as Events V2. The key change: **Private groups require both authentication AND membership to view**.

### The Problem

**Critical Security Vulnerability:** Groups marked as "Private" are currently accessible to anyone with the URL due to a bug in VisibilityGuard that reads from HTTP headers instead of URL parameters.

**Impact:**
- Private support groups → Member lists visible to anyone
- Private political groups → Members exposed
- Private family groups → Full details accessible to anyone
- Private business groups → Confidential structure revealed

---

## New Visibility Model

### Three-Tier Visibility System

| Visibility | Search Index | Anyone with Link | Logged In (Not Member) | Members Only |
|-----------|--------------|------------------|------------------------|--------------|
| **Public** | ✅ Yes | ✅ Full details | ✅ Full details | ✅ Full details |
| **Unlisted** | ❌ No | ✅ Full details | ✅ Full details | ✅ Full details |
| **Private** | ❌ No | 🔒 Login required | 🚫 403 Forbidden | ✅ Full details |

### Terminology Change

**Before:** Public, Authenticated, Private
**After:** Public, Unlisted, Private

**Rationale:** "Authenticated" is confusing and doesn't clearly communicate "anyone with link can view, just not searchable."

---

## Detailed Visibility Rules

### 1. Public Groups

**Philosophy:** Fully discoverable and open to everyone

- **Indexed:** Yes - appears in search results, sitemaps, Google
- **Unauthenticated Access:** Can view full details and member list
- **Authenticated Access:** Can view full details, member list, and join
- **Activity Feed:** Visible in sitewide feed
- **Link Previews:** Yes - Open Graph tags for social sharing
- **Use Case:** Public clubs, community groups, open organizations

**Examples:**
- "Local Photography Club" - anyone can discover and join
- "Portland Runners" - public community group
- "Open Source Contributors" - visible to all

---

### 2. Unlisted Groups

**Philosophy:** Not searchable, but transparent if you have the link

**Renamed from:** "Authenticated" (confusing terminology)

- **Indexed:** No - not in search results or sitemaps
- **Unauthenticated Access:** Can view full details and member list
- **Authenticated Access:** Can view full details, member list, and join
- **Activity Feed:** NOT visible in sitewide feed
- **Link Previews:** Yes - for sharing in messaging apps
- **Bot Access:** Preview only for link unfurling
- **Use Case:** Groups shared via link but not advertised publicly

**Examples:**
- "Book Club" - shared via email, anyone with link can join
- "Study Group" - shared among students, not advertised
- "Neighborhood Watch" - shared in local community, not public

---

### 3. Private Groups

**Philosophy:** Truly private - login + membership required

- **Indexed:** No
- **Unauthenticated Access:** 403 Forbidden - "Login required"
- **Authenticated (Not Member):** 403 Forbidden - "Access denied - membership required"
- **Authenticated (Member):** Full details
- **Activity Feed:** NOT visible in sitewide feed (members-only activities only)
- **Link Previews:** No - returns 403
- **Bot Access:** Blocked - returns 403
- **Use Case:** Private communities, confidential groups, sensitive organizations

**Examples:**
- "Executive Board" - only board members
- "Private Support Group" - only approved members
- "Family Group" - only family members
- "Internal Strategy Team" - only team members

---

## Access Control Flows

### Private Group: Logged-Out User

**User Action:** Visits a private group URL while not logged in

**System Response:**
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

**After Login:** Redirect back to group URL and check membership status

---

### Private Group: Logged-In User (Not Member)

**User Action:** Visits private group URL while logged in but not a member

**System Response:**
```
┌─────────────────────────────────────┐
│  🔒 Access Denied                   │
├─────────────────────────────────────┤
│  You do not have permission to      │
│  view this group.                    │
│                                      │
│  This group is private and          │
│  requires membership.                │
└─────────────────────────────────────┘
```

**HTTP Response:** 403 Forbidden

**Important:** No group details are shown. No "request to join" mechanism is provided.

**Rationale:** Maximum security - no information disclosure to prevent:
- Enumeration attacks (discovering private group names/members)
- Leaking sensitive information (political, medical, business affiliations)
- Social engineering attacks

---

### Private Group: Member

**User Action:** Visits private group URL while logged in as a member

**System Response:**
```
┌─────────────────────────────────────┐
│  Executive Board                     │
├─────────────────────────────────────┤
│  Created by: John Smith              │
│  Members: 12                         │
│                                      │
│  Private strategy group for...      │
│  [full description]                  │
│                                      │
│  👥 Members (12)                     │
│  [member list]                       │
│                                      │
│  📅 Upcoming Events (3)              │
│  [events list]                       │
│                                      │
│  💬 Discussions                      │
│  [discussion threads]                │
└─────────────────────────────────────┘
```

**HTTP Response:** 200 OK (full details)

---

## Information Disclosure Model

### Private Groups: Zero Disclosure Policy

For **Private** groups, **no information** is disclosed to non-members:

**Unauthenticated or Non-Member Users See:**
- ❌ Group name
- ❌ Creator name
- ❌ Member count
- ❌ Description
- ❌ Member list
- ❌ Events list
- ❌ Discussions
- ❌ Files/resources
- ✅ Only: "Access Denied - Group is private"

**Members See:**
- ✅ Group name
- ✅ Creator name
- ✅ Full description
- ✅ Member count
- ✅ Member list (with roles)
- ✅ Events list (all group events)
- ✅ Discussions
- ✅ Files/resources
- ✅ Group settings (if admin)

**Rationale:** Maximum security approach prevents information leakage, enumeration attacks, and protects sensitive groups (political organizing, support groups, business strategy).

---

## Membership & Invitation Mechanisms

### For Private Groups

Private groups are **invitation-only**. There are three ways to invite people:

#### 1. Shareable Invitation Links (Batch Invite)

**Best for:** Inviting multiple people via one link (WhatsApp groups, email lists, Slack channels)

**How it works:**
1. Group creator/admin creates an invitation link with settings:
   - Expiration: 7/30/90 days or custom date
   - Max uses: Unlimited or limited (e.g., "first 20 people")
2. Share single link with everyone
3. Recipients click link → Log in (or create account) → Auto-granted membership
4. Can now view full group details

**Link Management:**
- Creator/admin can create multiple links (family link, colleagues link, etc.)
- Can see who used each link
- Can revoke link (removes all users who joined via that link)

**Example:**
```
Share in family WhatsApp group:
"Join our family group for planning reunions!
Click to join: https://openmeet.net/groups/smith-family?invite=xyz789"

Everyone in the group clicks the same link, logs in, and becomes a member.
```

---

#### 2. Email Invitations (Individual Invites)

**Best for:** Sending personalized invitations with tracking

**How it works:**
1. Group creator/admin enters email addresses (paste list or one per line)
2. Optionally adds personal message
3. System sends individual emails with unique tokens to each person

**Email Content:**
```
Subject: You're invited to join "Executive Board"

Hi Alice,

John Smith has invited you to join:

Executive Board
A private group with 12 members

[Accept Invitation & Join]  ← Button with unique token

This invitation link is just for you and expires in 30 days.
```

**Invitation Tracking:**
- Creator/admin sees status for each email:
  - ✅ Sent
  - 📧 Opened
  - 👁️ Viewed (clicked link)
  - ✓ Accepted (joined)
- Can resend invitation to specific people
- Each person gets their own unique token

**Handling Non-Users:**
- System creates pending invitation record
- When they sign up with that email → Auto-matched to invitation
- No manual importing needed

**Email-Locked Invitations:**

Email invitations are locked to the specific email address:

```typescript
interface GroupInvitation {
  token: string;
  groupId: number;
  invitedEmail: string;     // ← LOCKED to this email
  invitedUserId?: number;   // NULL until claimed
  expiresAt: Date;
}
```

**Validation Flow:**
1. Invitation sent to alice@work.com
2. Alice signs up with alice@personal.com
3. Alice tries to use invitation
4. System checks: Does user own alice@work.com (verified)?
5. Not found → Error: "This invitation is for alice@work.com. Please add and verify this email."
6. Alice adds alice@work.com as secondary email
7. Alice verifies alice@work.com
8. System auto-grants membership

**Edge Cases:**
- **Forwarded links:** Cannot be used by different email owner
- **Email change:** Works if old email remains verified
- **Unverified email:** Must verify before using invitation

---

#### 3. Search and Invite Users (Platform Members)

**Best for:** Inviting people you know are already on OpenMeet

**How it works:**
1. Group creator/admin searches for users by name
2. Clicks "Invite" next to each person
3. User receives in-app notification
4. User receives email notification
5. User clicks notification → Auto-granted membership

**User Experience:**
- In-app notification: "John invited you to join Executive Board"
- Email notification with details
- One-click to accept

**Key Point:** No email addresses needed - search by name or username

---

### Mixing Invitation Methods

You can use multiple methods for the same group:

**Example: Professional networking group with 50 members**
- **Email List:** Send formal invitations to 20 colleagues
- **Shareable Link:** Share in company Slack (15 employees)
- **Search Users:** Directly invite 10 people already on OpenMeet
- **Another Shareable Link:** Share in industry Discord (5 professionals)

All 50 people get access, and admin can track who used which method.

---

## Membership Approval Workflow

Groups can be configured with optional approval requirements:

### Auto-Approval (Default)

- User accepts invitation
- Immediately becomes a member
- Can view all group content

### Manual Approval (Optional)

- Group admin enables "Require Approval" setting
- User accepts invitation → Status: "Pending Approval"
- Admin reviews request in approval dashboard
- Admin approves or rejects with optional message
- User notified of decision

**Recommended for:** High-security private groups, exclusive communities, professional organizations

**Approval Dashboard Shows:**
- Pending membership requests
- Requester profile information
- Option to approve/reject
- History of past approvals

---

## Group-Event Relationship

### Private Group Events

**Rule:** Members of a **private group** automatically have access to **all events** in that group (regardless of event visibility).

**Example:**
- "Executive Board" is a private group
- "Q4 Strategy Meeting" is a private event in that group
- All Executive Board members can see the event automatically
- No separate event invitation needed

**Event Visibility Inheritance:**
- Events created in private groups default to "private" visibility
- Event creator can override to "unlisted" or "public" if desired
- Private events in private groups = double privacy protection

**Access Matrix:**

| Group Visibility | Event Visibility | Non-Member Access | Member Access |
|-----------------|------------------|-------------------|---------------|
| Public | Public | ✅ Full details | ✅ Full details |
| Public | Unlisted | ✅ Full details | ✅ Full details |
| Public | Private | 🚫 403 (need event invite) | ✅ Auto-access |
| Unlisted | Any | ✅ Full details | ✅ Full details |
| Private | Any | 🚫 403 | ✅ Auto-access |

**Key Point:** Being a member of a private group grants automatic access to all group events.

---

### Event-Group Visibility Combinations Explained

**All combinations are supported.** Here are real-world use cases:

#### Public Event in Private Group
```
Example: "Silicon Valley Angel Investors" (private) hosts "How to Pitch to VCs" (public)

Benefits:
- Event attributed to group (builds brand/reputation)
- Public can attend without seeing member list
- Members see it on group calendar
- Uses group resources/location

Access:
✅ Event appears in public search
✅ Anyone can view and RSVP
✅ Group membership stays private
❌ Attendees don't auto-join group
```

#### Private Event in Public Group
```
Example: "Seattle Nonprofit Coalition" (public, 500 members) hosts "Board Meeting" (private)

Why private?
- Only board members should attend (12 people)
- Not all 500 group members need access
- Requires explicit invitation
- Confidential/sensitive discussion

Access:
❌ Event NOT in search
❌ Not visible to all group members
✅ Only invited members can attend
✅ Must explicitly invite each board member

Recommendation: For private events in public groups, explicitly invite members
(they don't auto-get access like they would in private groups)
```

**Other Real-World Examples:**

**Unlisted Event in Public Group:**
```
Example: "Local Art Association" hosts "Members-Only Studio Tour" (unlisted)

- Not searchable publicly
- All group members can see with link
- Share link in group discussion
- Not advertised outside group
```

**Private Event in Private Group (Most Restrictive):**
```
Example: "Executive Board" hosts "Q4 Strategy Meeting" (private)

- Group members auto-get access
- Completely hidden from non-members
- Maximum privacy
```

---

## Activity Feed Privacy

### Private Group Activities

Activities from private groups follow strict privacy rules:

**Sitewide Feed (Public Discovery):**
- ❌ Private group activities NEVER appear
- ❌ Member joins not visible
- ❌ Event creations not visible
- ❌ Discussion posts not visible

**Group Feed (Members Only):**
- ✅ All group activities visible
- ✅ Member joins, leaves, role changes
- ✅ Event creations and updates
- ✅ Discussion posts and comments
- **Access Control:** Only group members can view group feed

### Comparison by Visibility

**Public Group - "Portland Runners":**
```
Sitewide Feed (Everyone sees):
✅ "5 new members joined Portland Runners"
✅ "Portland Runners created: Saturday Morning Run"

Group Feed (Everyone sees):
✅ All activities visible to anyone
```

**Unlisted Group - "Book Club":**
```
Sitewide Feed:
❌ No activities shown

Group Feed (Anyone with link sees):
✅ "Alice joined the group"
✅ "New discussion: What are we reading next?"
```

**Private Group - "Executive Board":**
```
Sitewide Feed:
❌ No activities shown

Group Feed (Members only):
✅ "Bob joined the group"
✅ "New event: Q4 Strategy Meeting"
```

**Key Rule:** Only public groups contribute to sitewide discovery feed.

**Activity Feed Access Control:**
- **Sitewide feed:** Public activities from public groups only
- **Group feed:** Only group members can view (enforced at API level)
- Group feed endpoints MUST verify membership before returning activities

---

## Search & Discovery Behavior

### Public vs. Personalized Search

The term "not searchable" has caused confusion. This section clarifies the distinction between **public discovery** and **personalized search**.

| Visibility | Public Search (Unauthenticated) | Member Search (Authenticated) | Sitemaps/SEO | Dashboard/My Groups |
|-----------|--------------------------------|------------------------------|--------------|---------------------|
| **Public** | ✅ Shown | ✅ Shown | ✅ Indexed | ✅ Shown |
| **Unlisted** | ❌ Hidden | ✅ Shown (if member) | ❌ Not indexed | ✅ Shown |
| **Private** | ❌ Hidden | ✅ Shown (if member) | ❌ Not indexed | ✅ Shown |

**Key Distinction:**
- **"Not searchable"** means excluded from **public discovery** (Google, sitemaps, anonymous/public search results)
- **Members CAN find their own** unlisted/private groups via authenticated search
- This prevents "orphaned" content where members can't find groups they belong to
- Dashboard views (My Groups, Organized, Joined) always show all your groups regardless of visibility

**Implementation Details:**

**All Listing/Search Endpoints (`/groups`, `/home/search`):**
- Anonymous users: Only Public groups shown
- Authenticated users: Public + Unlisted (if member) + Private (if member)
- **Key**: Unlisted/Private require actual membership, not just authentication
- **Consistent behavior**: Search and browse listings use identical filtering

**Dashboard/Personal Views (`/groups/dashboard`):**
- Authenticated users: ALL groups they're members of (Public, Unlisted, Private)

**What "Unlisted" Actually Means:**
- ❌ Not in Google search results
- ❌ Not in sitemaps
- ❌ Not visible to anonymous users in search/listings
- ❌ Not visible to authenticated users who haven't joined
- ✅ Accessible via direct URL (no auth required)
- ✅ Visible to members in search/listings (they joined via the URL)

**Key Point:** "Unlisted" means not discoverable through public channels, but once you have the URL and join, the group appears in your personalized searches and listings.

**Examples:**

**Unlisted Group - "Friends Book Club":**
- Anonymous user browses groups → ❌ Not shown
- Anonymous user searches "book club" → ❌ Not shown
- Anonymous user visits direct URL → ✅ Can view full details and join
- Authenticated non-member browses groups → ❌ Not shown
- Authenticated non-member searches "book club" → ❌ Not shown
- Member browses groups → ✅ Shown (they joined via URL)
- Member searches "book club" → ✅ Shown (they joined via URL)
- Member views "My Groups" → ✅ Shown
- Google indexes site → ❌ Not included

**Private Group - "Executive Board":**
- Anonymous user searches "executive" → ❌ Not shown
- Authenticated non-member searches "executive" → ❌ Not shown
- Member searches "executive" → ✅ Shown (they're a member)
- Member views "My Groups" → ✅ Shown
- Sitemap generation → ❌ Not included

**Rationale:**
- "Unlisted" means "not publicly discoverable" and "not in listings", not "unfindable by people who have access"
- Members should be able to search their own groups
- Prevents user frustration ("I know I'm a member but can't find it!")
- Maintains privacy (only people with access can find them)

---

## HTTP Status Codes & Error Handling

### Response Codes by Scenario

| Scenario | HTTP Status | User Experience |
|----------|-------------|-----------------|
| Group doesn't exist | 404 Not Found | "Group not found" |
| Private group (logged out) | 403 Forbidden | "Login required" message |
| Private group (logged in, not member) | 403 Forbidden | "Access denied - membership required" |
| Private group (member) | 200 OK | Full group details |
| Unlisted group | 200 OK | Full details (no auth required) |
| Public group | 200 OK | Full details |

**Design Decision:** Different error codes help users understand what's happening

**Rationale:**
- **403 for all non-member access:** Maximum security - no information disclosure
- **Clear binary access:** Either you have access (200) or you don't (403)
- **No teaser pages:** Prevents enumeration attacks and information leakage

---

## Security Considerations

### Information Leakage Vectors

**Timing Attacks:**
- Response time might reveal if group exists
- **Mitigation:** Consistent response times for all private group queries

**Enumeration Attacks:**
- Attacker tries `/groups/private-1`, `/groups/private-2`, etc.
- **Mitigation:** Returns generic 403 with no details - cannot learn group names, members, or purpose

**Activity Feed Leaks:**
- Group activities could reveal group name and members
- **Mitigation:** Private group activities NEVER appear in sitewide feed

**Member List Leaks:**
- Revealing who's in a private group is highly sensitive
- Examples: Political groups, support groups, business competitors
- **Mitigation:** Member list only visible to members (hard 403 for non-members)

**Group Feed Endpoint Leaks:**
- Anyone could call `/groups/private-group/feed` without membership check
- **Mitigation:** Enforce membership verification before showing feed activities

### Best Practices

1. **Default Deny:** If in doubt, require authentication and membership
2. **Principle of Least Privilege:** Show minimal information until access verified
3. **Audit Logging:** Log all access attempts to private groups
4. **Rate Limiting:** Prevent enumeration attacks via brute force
5. **HTTPS Only:** All private group links must use HTTPS

---

## Design Decisions & Clarifications

### 1. No "Request to Join" Feature for Private Groups

**Decision:** ❌ No public request mechanism for private groups

**Rationale:**
- Private groups are invitation-only by design
- "Request to Join" would reveal group details to non-members (violates zero-disclosure policy)
- Admins can't verify who strangers are
- Invitation links provide controlled access

**Important:** This means no teaser page showing group info to non-members.

**Alternative:** Users who want to join must:
1. Contact group admin directly (outside platform via email, social media, etc.)
2. Receive an invitation link from admin
3. Accept invitation to join

---

### 2. Invitation Token Expiry

**Decision:** ✅ Custom expiry with 30-day default

- Default expiration: 30 days from creation
- Admin can customize: no expiry, 7 days, 30 days, 90 days, or custom date
- Tokens for existing members (during migration): no expiry

**Rationale:** Balance between security and convenience

---

### 3. Token Revocation

**Decision:** ✅ Revoke link AND remove all users who joined via it

- Revoking a token disables the link
- Removes all users who joined via that specific token
- Provides admin control over who has access
- Removed members can be re-invited with new token if needed

**Rationale:** Complete control for group admins in case of security breach

---

### 4. Member Removal from Private Groups

**Decision:** ✅ Remove member → lose access to group AND group events

When a member is removed from a private group:
- Immediately loses access to group details
- Immediately loses access to all group events (even if they RSVP'd)
- Can no longer see group discussions or files
- All group/event activities become invisible to them

**Exception:** Events they created remain, but are moved to standalone (no longer in group)

**Rationale:** Membership is the key to all group-related access

---

### 5. Analytics Privacy

**Decision:** ✅ Anonymized aggregates + admin-only individual metrics

- **Platform Analytics:** Anonymized aggregates only ("50 private groups created this month")
- **Individual Group Analytics:** Only visible to group admins
- **Admin Dashboards:** No private group details unless authorized

**Rationale:** Protect member privacy while allowing platform-wide insights

---

## Migration Strategy

### Current Situation

- "Authenticated" visibility is confusing terminology
- "Private" groups are broken (accessible to anyone with URL)
- Existing users may have shared "private" group links expecting them to work

### Migration Approach

#### Phase 0: Pre-Migration (2 weeks before deployment)

**Goal:** Notify group creators and collect their preferences

**Step 1: Identify Affected Groups**

Find all groups currently marked as 'private':
- Group name, slug, visibility
- Creator name and email
- Member count
- Event count

**Step 2: Email Group Creators**

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

**Step 3: Default Behavior**

- If creator doesn't respond within 2 weeks: Auto-convert to "Unlisted"
- Maintains backward compatibility
- Prevents broken links

**Step 4: For Groups Staying Private**

- Auto-create invitation tokens for existing members
- Ensures current members don't lose access
- Generates one token per member with no expiration

---

#### Implementation Phases

See `visibility-model-v2-private-groups-impl.md` for detailed implementation plan

**Timeline:**
- **Phase 0** (Weeks -2 to 0): Pre-migration audit & creator notification
- **Phase 1** (Week 1): Database migration (authenticated → unlisted)
- **Phase 2** (Week 1-2): VisibilityGuard security fix (hard 403 for non-members)
- **Phase 3** (Week 2): Group invitation token system
- **Phase 4** (Week 2-3): Activity feed privacy & membership enforcement
- **Phase 5** (Week 3-4): Testing & validation
- **Phase 6** (Week 4): Deployment & monitoring

**Total Duration:** ~5-6 weeks (including 2-week pre-migration period)

---

## Success Metrics

### Security
- [ ] Zero unauthorized access to private group details
- [ ] Zero private group info in activity feeds for non-members
- [ ] Member list only visible to members
- [ ] Group feed only accessible to members

### Functionality
- [ ] Invitation tokens work correctly for groups
- [ ] Email invitations send and track properly
- [ ] Member removal correctly revokes access to group events
- [ ] Search excludes unlisted and private groups
- [ ] Sitemaps exclude unlisted and private groups

### Migration
- [ ] 100% of affected creators notified
- [ ] No broken group links after migration
- [ ] All migration preferences honored
- [ ] Existing members retain access to private groups

### Testing
- [ ] E2E test coverage at 100%
- [ ] All visibility scenarios tested
- [ ] Invitation flows validated
- [ ] Activity feed privacy verified
- [ ] Membership enforcement validated

---

## Required Features

### Group Invitation Management

**Create Invitation Token**
- Generate shareable link with optional settings
- Configure expiration and max uses
- Track token creation

**Validate Invitation Token**
- Check if token is valid and not expired
- Return group name only if token is valid
- No other details disclosed

**Accept Invitation**
- User logs in and accepts invitation
- Auto-granted membership
- Token usage tracked

**Revoke Invitation**
- Disable token immediately
- Remove all users who joined via token
- Track revocation event

**List Invitations**
- Admin-only view of all active invitations
- See who created each invitation
- See usage count for each token

### Membership Management

**Add Member**
- Via invitation token acceptance
- Via direct admin invite
- Track join method

**Remove Member**
- Revoke all group access
- Revoke all group event access
- Notify member of removal

**Approve/Reject Membership**
- Admin dashboard for pending requests
- Approve with auto-notification
- Reject with optional message

**Member List**
- Show all members with roles
- Only visible to members
- Filterable and sortable

---

## References

- **Parallel Design:** `visibility-model-v2-private-events.md`
- **Implementation Plan:** `visibility-model-v2-private-groups-impl.md` (to be created)
- **GitHub Issue:** #380 (to be created)
- **Corrections Document:** `visibility-model-v2-corrections.md`
- **Related Docs:** `event-visibility-and-permissions.md`, `activity-feed-system.md`

---

**Status:** 📋 Ready for Review
**Next Steps:** Review design, gather feedback, create implementation plan
