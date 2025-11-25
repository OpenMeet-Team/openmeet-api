# Invitation System - Specification

**Status:** ✅ **DESIGN APPROVED - Phased Implementation**
**Related PRs:** #387 (shareable invites for groups), #392 (visibility e2e tests)
**Total Effort Estimate:** 12.5 days (phased across 3 releases)

---

## Executive Summary

This document defines a **three-phase invitation system** for private events and groups:

1. **Phase 1 (MVP):** Direct invite of existing OpenMeet users
2. **Phase 2 (V1.5):** Email invitations with personal codes
3. **Phase 3 (V2):** Viral invitations with accountability chains

**Key Decision:** Viral invitations REPLACE simple generic links. Instead of one link everyone forwards, each person gets their own traceable sub-link.

---

## ✅ DESIGN DECISIONS (Resolved)

**Date:** 2025-01-23
**Resolution:** Use viral invitations instead of generic shareable links

### Decision 1: Private Events + Shareable Links ✅

**Answer:** Yes, BUT only via viral invitations (not generic links)

**Rationale:**
- Generic links (one URL for everyone) have security risks
- Viral invitations provide accountability while keeping shareability
- Each person gets their own traceable invitation link
- Full invitation chain visible to host

### Decision 2: Security Mitigations ✅

**Answer:** Viral invitation chains provide accountability

Instead of:
```
Generic Link: openmeet.net/events/party?invite=abc123
- Everyone uses same URL
- No accountability
- Can't trace who shared with whom
```

Use:
```
Viral Invitations: Each person gets personal sub-link
- Alice: openmeet.net/events/party?invite=alice-xyz789
- Bob: openmeet.net/events/party?invite=bob-xyz789
- Full chain tracked: Host → Alice → Dave → Emma
- Can revoke Alice's entire branch
```

### Decision 3: MVP Scope ✅

**Answer:** Three-phase rollout

1. **Phase 1 (MVP - 5 days):** Direct invite (existing OpenMeet users)
2. **Phase 2 (V1.5 - +3 days):** Email invitations (personal codes)
3. **Phase 3 (V2 - +4.5 days):** Viral invitations (replaces generic links)

### Decision 4: Revocation Behavior ✅

**Answer:** Granular control per branch

- Disable link: Stops new uses, existing attendees keep access
- Remove person: Remove individual only
- Remove branch: Remove entire invitation subtree

### Decision 5: Auto-RSVP ✅

**Answer:** No auto-RSVP

- Accepting invitation grants view access only
- User must manually RSVP for events
- User becomes member for groups (auto-join)

### OPEN QUESTION: Membership Approval for Groups

**The idea:** Allow groups to require admin approval after someone accepts an invitation.

**Auto-Approval (current behavior):**
- User accepts invitation → Immediately becomes a member

**Manual Approval (proposed):**
- Admin enables "Require Approval" setting
- User accepts invitation → Status: "Pending Approval"
- Admin reviews and approves/rejects

**Concerns:**
- Does this add unnecessary complexity?
- If you're sending an invitation, haven't you already decided to let them in?
- When would you want approval AFTER sending an invitation?

**Possible use cases:**
- Viral invitations where host wants to vet friends-of-friends?
- Large organizations with HR approval workflows?

**Status:** Needs more discussion and input.

---

## Security Analysis: Generic Links vs Viral Invitations

### Generic Shareable Links Have Security Risks:

#### Security Risks of URL-Based Tokens

When invitation token appears in URL (`openmeet.net/events/party?invite=abc123`):

**❌ Token Exposure Vectors:**
1. **Server access logs** - Web servers log full URLs including tokens
2. **Browser history** - Tokens persist indefinitely in user's browser autocomplete
3. **Referrer headers** - Token leaks to third-party sites if user clicks external links
4. **Analytics tools** - Google Analytics, error trackers log full URLs with tokens
5. **Proxy servers** - Corporate/ISP proxies log all URLs
6. **Screen recordings** - Tokens visible when users share screens/screenshots

**Real-World Attack Scenario:**
```
1. Alice receives invitation to "Executive Compensation Committee Meeting"
2. Opens link at work using company WiFi
3. Corporate proxy logs full URL with token
4. IT administrator sees token in logs
5. IT admin uses token to access confidential salary discussion
6. No audit trail (appears as if Alice granted access)
```

**Industry Standard:** OAuth2, Auth0, GitHub all **explicitly forbid** tokens in URLs for this exact reason.

#### The Fundamental Incompatibility

**Shareable links require:**
- Token in URL (so it can be shared)
- Token reusable by multiple people
- No per-person tracking of who shares with whom

**Truly private/confidential events require:**
- No token leakage via logs/proxies
- Control over who has access
- Audit trail of invitation distribution

**These requirements are mutually exclusive.**

### Use Case Analysis

**Events that need shareable links:**
- ✅ Birthday parties (casual, not confidential)
- ✅ Game nights (convenience over security)
- ✅ Family gatherings (low risk)
→ **These should use "Unlisted" visibility, not "Private"**

**Events that need true privacy:**
- ❌ Medical support groups (HIV+, cancer, addiction recovery)
- ❌ Political organizing (union meetings, activism)
- ❌ Business confidential (layoff planning, M&A discussions)
- ❌ Legal proceedings (divorce support, custody matters)
→ **These cannot risk URL-based token leakage**

### Open Questions

**We must decide:**

1. **Should private events support shareable links at all?**
   - Option A: Remove shareable links entirely from private events
   - Option B: Keep them but add prominent security warnings
   - Option C: Create two-tier system (Unlisted = shareable, Private = email-only)

2. **If we keep shareable links for private events, how do we mitigate URL logging?**
   - Option A: Accept the risk, document limitations clearly
   - Option B: Use POST-based token redemption (extra user click)
   - Option C: Client-side URL cleanup (still logged once on server)
   - Option D: Move to per-person tokens only (breaks "shareable" model)

3. **What's the MVP for inviting non-users to private events?**
   - Option A: Manual add only (requires user create account first, poor UX)
   - Option B: Email invitations with unique tokens (2-3 days effort, V2 feature)
   - Option C: Shareable links with clear warnings (fast but risky)
   - Option D: Don't solve this problem in MVP (use Unlisted for shareable events)

4. **Should revocation remove existing attendees?**
   - Current spec: Revoke link → Remove all users who joined via it (destructive)
   - Alternative: Separate "Disable Link" vs "Remove Attendees" actions
   - **Decision:** Use separate actions (agreed in review)

5. **Should accepting invitation auto-RSVP as "Going"?**
   - Issue: User hasn't seen event details before committing
   - **Decision:** Grant view access automatically, require manual RSVP click (agreed in review)

### Why Viral Invitations Solve the Problem

**Viral invitations maintain shareability while adding accountability:**

✅ **Traceability:** Every person traceable to original inviter
✅ **Accountability:** Host can ask "Alice, who is Dave?"
✅ **Granular Revocation:** Remove individuals or entire branches
✅ **Controlled Growth:** Set depth limits and per-person quotas
✅ **Audit Trail:** Full invitation tree visible to host

**Trade-off:** Slightly more complex implementation, but much better security model.

---

## Three-Phase Implementation Plan

### Phase 1: Direct Invite (MVP - 5 days)

**Goal:** Enable hosts to invite existing OpenMeet users

**Solves:** Critical blocker - private groups have no way to add members

**Features:**
- Search OpenMeet users by name/username
- Click "Invite" to send in-app + email notification
- Invited user gets instant access (no codes needed)
- Works for both events and groups

**Priority:** HIGHEST - This is the blocker

---

### Phase 2: Email Invitations (V1.5 - +3 days)

**Goal:** Invite non-OpenMeet users via email with personal codes

**Solves:** Birthday party scenario - invite family members not on platform

**Features:**
- Paste email list (comma-separated)
- Send personalized emails with unique tokens
- Each token locked to specific email address
- Track: Sent → Opened → Clicked → Accepted
- Auto-match invitation when user signs up

**Priority:** HIGH - Needed for real-world private events

---

### Phase 3: Viral Invitations (V2 - +4.5 days)

**Goal:** Allow invitees to invite their friends (with accountability)

**Solves:** Large events where host doesn't know everyone (birthday party with extended network)

**Features:**
- Host enables "Allow invitees to invite others"
- Each invitee gets personal sub-link to share
- Set depth limit (e.g., friends of friends only)
- Set per-person quota (e.g., 5 invites each)
- Full invitation tree visible to host
- Granular revocation (per-person or per-branch)
- Contact chain ("Who is Leo?" → "Leo invited by Karen, invited by Carol, invited by YOU")

**Priority:** MEDIUM - Enhancement for larger events

**This replaces generic shareable links** - No need for generic links once viral invitations exist.

---

## Removed Approaches

### ❌ Approach 1: No Shareable Links for Private Events
```
Private Event Invitation Methods (MVP):
✅ Manual add by username (existing users only)
✅ Group membership (existing users in private groups)
❌ Shareable links (removed - incompatible with privacy model)
❌ Email invitations (deferred to V2 - proper per-person tokens)

Trade-offs:
+ Maximum security, no token leakage
+ Clear privacy model
- Cannot invite non-users in MVP
- Poor UX for real-world private events ("create account first, then tell me your username")
```

**Decision:** Rejected - Too restrictive, doesn't solve non-user problem

### ❌ Approach 2: Email Invitations Only
```
Private Event Invitation Methods:
✅ Manual add by username
✅ Group membership
✅ Email invitations with per-person unique tokens
   - Each user gets: openmeet.net/invite/{unique-token-for-bob}
   - Token single-use, locked to specific email address
   - Proper email delivery system
❌ Shareable links (too risky for private events)

Trade-offs:
+ Secure per-person tokens
+ Can invite non-users
+ Audit trail of who was invited
- 2-3 days additional development
- Requires email infrastructure
- Less flexible than shareable links
```

**Decision:** Adopted as Phase 2

### ❌ Approach 3: Generic Shareable Links with Warnings
```
Private Event Invitation Methods:
✅ Manual add by username
✅ Group membership
✅ Shareable links with prominent security warnings
   - Warning: "This link can be intercepted by network admins"
   - Recommendation: "For confidential events, use Unlisted + manual add"
   - Document limitations clearly

Trade-offs:
+ Solves MVP problem quickly (1.5 days)
+ Flexible for users
- Security risk for truly confidential events
- Users may not understand implications
- False sense of security
```

**Decision:** Rejected - Replaced by viral invitations (better accountability)

### ✅ Approach 4: Viral Invitations (ADOPTED)
```
Private Events + Viral Invitations:
✅ Direct invite (Phase 1)
✅ Email invitations (Phase 2)
✅ Viral invitations with depth limits (Phase 3)
✅ Full invitation tree tracked
✅ Granular revocation per branch
✅ Each person accountable to chain

Example Flow:
1. Host invites Alice, Bob, Carol
2. Alice invites Dave, Emma (her friends)
3. Dave invites Frank (his friend)
4. Host sees: Host → Alice → Dave → Frank
5. Stranger shows up? Host asks: "Alice, who is Dave? Dave, who is Frank?"
6. If needed: Remove Frank, or remove Dave's branch, or remove Alice's entire tree

Philosophy:
- Viral invitations provide shareability WITH accountability
- No need for generic "one link for everyone" approach
- Always know who invited whom
```

---

## Problem Statement

**Current State:**
1. Private groups have NO way to add members (critical blocker)
2. Cannot invite non-OpenMeet users to private events
3. Generic shareable links have security risks (no accountability)

**Real-World Impact:**
- Private group created → Nobody can join
- Birthday party → Can't invite family not on platform
- Someone forwards link → Host doesn't know who invited strangers

---

## Solution: Three-Phase Invitation System

**Phase 1 (MVP):** Direct invite existing users
**Phase 2 (V1.5):** Email invitations for non-users
**Phase 3 (V2):** Viral invitations with accountability chains

**Example Flow:**
```
Host creates private event "Emma's Birthday Party"
→ Phase 1: Directly invites 10 friends on OpenMeet
→ Phase 2: Emails invitation codes to 15 family members not on platform
→ Phase 3: Enables viral invites (each person can invite 5 friends)
→ Alice invites her 5 friends (Dave, Emma, Frank, Grace, Henry)
→ Dave invites his 3 friends (Ivan, Jane, Karen)
→ Host sees full tree: Host → Alice → Dave → Ivan
→ Stranger shows up? Host traces: "Alice, who is Dave? Dave, who is Ivan?"
```

---

## User Flows by Phase

### Phase 1: Direct Invite (MVP)

**Host Flow:**
1. Opens private event/group page
2. Clicks "Invite People"
3. Sees "Search OpenMeet Users" as PRIMARY option
4. Types "Alice" → Sees search results with profiles
5. Clicks "Invite" next to Alice Smith
6. Alice instantly added, receives in-app + email notification

**Guest (Alice) Flow:**
1. Gets in-app notification: "Sarah invited you to Emma's Birthday Party"
2. Gets email: "You've been invited..." [View Event]
3. Clicks notification → Already logged in → See event details
4. For events: Can RSVP Going/Not Going
5. For groups: Already a member, sees all content

---

### Phase 2: Email Invitations

**Host Flow:**
1. Clicks "Invite People"
2. Chooses "Send Email Invitations"
3. Pastes email list:
   ```
   alice@gmail.com
   bob@yahoo.com
   carol@work.com
   ```
4. Optionally adds personal message
5. Clicks "Send Invitations"
6. Sees tracking: alice@gmail.com - Sent ✓

**Guest (Has Account) Flow:**
1. Gets email: "Sarah invited you to Emma's Birthday Party"
2. Clicks unique link: `openmeet.net/invite/xyz789alice`
3. Already logged in → Auto-granted access
4. Sees event/group details → Can RSVP/Join

**Guest (No Account) Flow:**
1. Gets email with unique link
2. Clicks → Redirected to signup (email pre-filled)
3. Signs up → Auto-matched to invitation → Auto-granted access
4. Sees event/group details → Can RSVP/Join

---

### Phase 3: Viral Invitations

**Host Flow:**
1. Clicks "Invite People"
2. Invites initial people (Alice, Bob, Carol)
3. Enables "Allow invitees to invite others"
4. Configures:
   - Depth limit: 2 levels (friends of friends)
   - Per-person quota: 5 invites each
   - Expiration: 30 days

**Alice (First-level invitee) Flow:**
1. Accepts invitation → Becomes member
2. Sees on event page: "Invite your friends"
3. Clicks "Generate my invitation link"
4. Gets personal link: `openmeet.net/events/party?invite=alice-xyz789`
5. Shares with 5 friends via WhatsApp

**Dave (Second-level invitee) Flow:**
1. Clicks Alice's personal link
2. Logs in/signs up
3. Auto-granted access
4. Sees: "You were invited by Alice"
5. Can see: "Invite your friends" (if depth allows)
6. OR sees: "Invitation limit reached" (if at max depth)

**Host Manages Viral Tree:**
1. Views invitation tree:
   ```
   Host
   ├─ Alice (invited 5 people)
   │  ├─ Dave
   │  ├─ Emma
   │  └─ Frank
   ├─ Bob (invited 3 people)
   └─ Carol (invited 0 people)
   ```
2. Clicks "Who is Dave?" → Shows: Dave invited by Alice, invited by Host
3. Can message Alice: "Who is Dave?"
4. Can remove Dave individually
5. Can remove Alice's entire branch (Alice + her 5 invitees)

---

## Data Model

### Phase 1: Direct Invites (Simple)

**Approach:** Use existing `event_attendees` and `group_members` tables
- Add `invited_by_user_id` field (who sent the invitation)
- Add `invitation_method` enum: 'direct' | 'email' | 'viral'

**No separate invitation table needed** - direct invites immediately grant access

---

### Phase 2 & 3: Email + Viral Invitations

### event_invitations

**Fields:**
- id
- event_id → events
- token (unique, URL-safe string, 32+ chars)
- invitation_type ('email' | 'viral') - NEW
- invited_email (nullable - set for email, NULL for viral)
- invited_by_user_id - NEW (who created this invitation)
- parent_invitation_id - NEW (links to parent for viral chains)
- depth - NEW (0 = host, 1 = first level, 2 = second level)
- max_depth - NEW (how many levels down can this branch go)
- can_invite_others - NEW (whether this person can create sub-invitations)
- max_invites_per_person - NEW (quota for sub-invitations)
- max_uses (nullable - NULL = unlimited, 1 = email-locked, N = limited viral)
- uses_count (increments each use)
- expires_at (nullable - when link expires)
- created_by_user_id → users (host or admin)
- revoked_at (nullable - when disabled)
- status (active/expired/revoked)
- created_at
- updated_at

**Indexes:**
- token (unique)
- event_id
- status
- parent_invitation_id (for tree queries)
- invited_by_user_id (for accountability)

### group_invitations

**Same structure as event_invitations**, but with `group_id` instead of `event_id`

### event_invitation_uses

Tracks who used each invitation.

**Fields:**
- id
- invitation_id → event_invitations
- user_id → users
- used_at
- ip_address (for security/abuse detection)

**Constraints:**
- Unique(invitation_id, user_id) - prevent duplicate uses

### event_invitation_chain

**NEW:** Tracks the full invitation tree for accountability

**Fields:**
- id
- event_id
- user_id (person who joined)
- invited_by_user_id (person who invited them)
- invitation_id (the token they used)
- depth (0 = host, 1 = direct invite, 2 = friend of friend)
- joined_at

**Purpose:** Quick lookup of "who invited this person?" and "show full chain"

---

## How Invitation "Uses" Work

**A "use" = one unique person accepts the invitation and gains access**

### Detailed Flow

**First Click (New User):**
1. Alice clicks invitation link
2. Logs in/signs up
3. Backend validates:
   - Token valid, not expired, not revoked
   - Not at max uses (e.g., 5/10 used)
   - Alice has NOT used this token before
   - Alice is NOT already an attendee
4. Actions:
   - Create `event_attendee` (Alice, status: invited)
   - Create `event_invitation_uses` (invitation_id, Alice's user_id)
   - Increment `uses_count` (5 → 6)
5. Alice can now view event and RSVP

**Subsequent Click (Same User):**
1. Alice clicks same link again
2. Backend checks:
   - Token valid
   - Alice HAS used this token before (exists in `event_invitation_uses`)
3. Actions:
   - No-op (doesn't count as another use)
   - `uses_count` stays at 6
   - Alice still has access

**Max Uses Enforcement:**
1. Link has `max_uses = 10`, currently `uses_count = 10`
2. New user (Carol) clicks link
3. Backend checks:
   - Token valid
   - uses_count >= max_uses
4. Actions:
   - Error: "This invitation has reached its maximum uses"
   - Carol does NOT gain access

### Edge Cases

**User Already Attendee (Added Another Way):**
- Scenario: Bob was manually added, then clicks invitation link
- Behavior: No-op (don't create duplicate, don't increment count)

**User Removed Then Re-Clicks:**
- Scenario: Alice used invitation, was removed by host, clicks link again
- Behavior: Invitation already "consumed" for Alice (exists in `event_invitation_uses`)
- Result: No-op, does NOT re-add her or increment count
- Note: Host must manually re-add or create new link

### Summary

**uses_count** tracks unique people who gained access via this link, not total clicks.

**event_invitation_uses** table prevents:
- Same user using invitation multiple times
- Same user counting against max_uses multiple times

**Unique constraint (invitation_id, user_id)** ensures each person can only "use" each invitation once.

**Example:**
```
Invitation: max_uses = 10, uses_count = 0

Click 1 (Alice): ✅ Add attendee, record use, count = 1
Click 2 (Bob):   ✅ Add attendee, record use, count = 2
Click 3 (Alice): ⚪ Already used, no-op, count = 2
Click 4 (Carol): ✅ Add attendee, record use, count = 3
...
Click 11 (Dave): ❌ Max uses reached (count = 10)
```

---

## API Endpoints

### Phase 1: Direct Invites

#### POST /events/:slug/invitations/direct
**Auth:** Required (must be event host)

**Request:**
```json
{
  "userIds": [123, 456, 789]
}
```

**Response:**
```json
{
  "invited": [
    { "userId": 123, "username": "alice", "notified": true },
    { "userId": 456, "username": "bob", "notified": true }
  ],
  "alreadyMembers": [
    { "userId": 789, "username": "carol" }
  ]
}
```

**Same for groups:** `POST /groups/:slug/invitations/direct`

---

### Phase 2: Email Invitations

#### POST /events/:slug/invitations/email
**Auth:** Required (must be event host)

**Request:**
```json
{
  "emails": ["alice@example.com", "bob@example.com"],
  "personalMessage": "Hope you can make it!",
  "expiresIn": "30days"
}
```

**Response:**
```json
{
  "sent": [
    {
      "email": "alice@example.com",
      "token": "xyz789alice",
      "inviteUrl": "https://openmeet.net/invite/xyz789alice",
      "status": "sent"
    }
  ],
  "failed": []
}
```

---

### Phase 3: Viral Invitations

#### POST /events/:slug/invitations/viral/enable
**Auth:** Required (must be event host)

**Request:**
```json
{
  "maxDepth": 2,
  "maxInvitesPerPerson": 5,
  "expiresIn": "30days"
}
```

**Response:**
```json
{
  "enabled": true,
  "settings": {
    "maxDepth": 2,
    "maxInvitesPerPerson": 5,
    "expiresAt": "2025-02-20T12:00:00Z"
  }
}
```

#### POST /events/:slug/invitations/viral/my-link
**Auth:** Required (must be event attendee with invite privileges)

Generates personal sub-invitation link for the current user.

**Response:**
```json
{
  "inviteUrl": "https://openmeet.net/events/party?invite=alice-xyz789",
  "remainingInvites": 5,
  "depth": 1,
  "canInvite": true
}
```

#### GET /events/:slug/invitations/tree
**Auth:** Required (must be event host)

Returns full invitation tree.

**Response:**
```json
{
  "tree": [
    {
      "userId": 1,
      "username": "host",
      "depth": 0,
      "invitedBy": null,
      "children": [
        {
          "userId": 2,
          "username": "alice",
          "depth": 1,
          "invitedBy": 1,
          "invitedCount": 5,
          "children": [
            { "userId": 5, "username": "dave", "depth": 2, "invitedBy": 2 }
          ]
        }
      ]
    }
  ]
}
```

#### DELETE /events/:slug/invitations/branch/:userId
**Auth:** Required (must be event host)

Removes user and their entire invitation subtree.

**Response:**
```json
{
  "removed": ["alice", "dave", "emma", "frank"],
  "count": 4
}
```

---

### Common Endpoints (All Phases)

#### GET /events/:slug?invite=TOKEN
**Auth:** Optional

When `invite` query param present:
- If not authenticated: Redirect to login with return URL
- If authenticated: Validate token and grant access

**Token Validation:**
1. Token exists and active
2. Not revoked or expired
3. Under max uses
4. User hasn't already used it
5. For email invitations: User owns the invited email (verified)
6. For viral: Within depth limit

**On Success:**
- Grant access (create attendee/member record)
- Record usage in event_invitation_uses
- Record invitation chain
- Increment uses_count
- Return event/group details

**On Failure:**
- Return 403 with specific error message

#### GET /events/:slug/invitations
**Auth:** Required (must be event host)

Lists all invitations (direct, email, viral).

**Response:**
```json
{
  "direct": { "count": 10, "users": [...] },
  "email": { "count": 15, "sent": [...], "pending": [...] },
  "viral": {
    "enabled": true,
    "totalInvited": 23,
    "tree": [...]
  }
}
```

---

## Frontend Components

### InviteLinksPanel
**Location:** Event management page (host only)

**Features:**
- Form to create new link (expiry, max uses)
- List of active links with stats
- Copy button for each link
- Revoke button for each link

### EventDetailPage (modification)
**On page load:**
- Check URL for `?invite=TOKEN` query param
- If present and not authenticated → redirect to login
- If present and authenticated → let backend handle (will auto-accept)

---

## Validation Rules

**Token Generation:**
- Cryptographically random
- URL-safe encoding
- Sufficient length (32 bytes → ~44 chars)

**Expiration:**
- 7 days = +7 days from creation
- 30 days = +30 days from creation
- 90 days = +90 days from creation

**Max Uses:**
- NULL = unlimited
- Integer > 0 = specific limit
- Once reached, reject new uses

**Revocation:**
- Sets revoked_at timestamp
- Sets status to 'revoked'
- Immediately blocks all future uses

**Duplicate Use Prevention:**
- User can only accept same invitation once
- Subsequent attempts are no-ops (not errors)

---

## Error Messages

**Expired:**
"This invitation has expired. Please contact the event host for a new link."

**Revoked:**
"This invitation has been revoked. Please contact the event host."

**Max Uses Reached:**
"This invitation has reached its maximum number of uses."

**Invalid Token:**
"Invalid invitation link."

**Not Authenticated:**
"Please log in to accept this invitation."

---

## Security Considerations

### Critical Implementation Requirements

**1. Race Condition Prevention (Max Uses Enforcement)**

**Problem:** Simultaneous token validation can bypass max_uses limit.

```typescript
// ❌ VULNERABLE CODE - Race condition
const invitation = await db.query('SELECT * FROM event_invitations WHERE token = ?');
if (invitation.uses_count >= invitation.max_uses) {
  throw new Error('Max uses reached');
}
// Two users can both pass this check simultaneously
await createAttendee(...);
await db.query('UPDATE event_invitations SET uses_count = uses_count + 1');
```

**Solution:** Use atomic database operations with row-level locking:

```typescript
// ✅ SAFE CODE - Atomic increment with validation
const result = await db.query(`
  UPDATE event_invitations
  SET uses_count = uses_count + 1
  WHERE id = ?
    AND (max_uses IS NULL OR uses_count < max_uses)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  RETURNING *
`);

if (result.rowCount === 0) {
  // Either maxed out, expired, or revoked
  throw new Error('Invitation not available');
}
```

**2. Rate Limiting (Token Validation Attacks)**

**Problem:** Spec only mentions rate limiting for invitation *creation*, not token *validation*.

**Attack vector:** Attacker can brute-force token validation attempts.

**Required rate limits:**
- **Token validation:** Maximum 10 failed validation attempts per IP per hour
- **Invitation creation:** Maximum 10 invitations per event per hour per user
- **Attendee list viewing:** Consider CAPTCHA or rate limits to prevent scraping

**3. Revocation User Experience** ✅ **RESOLVED**

**Decision:** Separate "Disable Link" from "Remove Attendees"

```
Host sees two actions:
1. "Disable Link" - Stops new uses, existing attendees keep access
2. "Remove All Attendees from This Link" - Separate destructive action with confirmation

Confirmation dialog must show:
- Number of attendees who will be removed
- Explicit checkbox: "I understand this will remove N people from the event"
- Cannot be undone warning
```

**4. Transaction Safety**

All invitation acceptance operations must be wrapped in database transaction:

```typescript
await db.transaction(async (trx) => {
  // 1. Validate and increment token (with row lock)
  const invitation = await validateAndIncrementToken(token, trx);

  // 2. Create attendee record
  await createAttendee(invitation, user, trx);

  // 3. Record invitation use
  await recordInvitationUse(invitation, user, trx);

  // All or nothing - prevents data inconsistency
});
```

**5. Attendee List Privacy Controls**

**Problem:** After accepting invitation, users can see full attendee list including emails.

**Required for private events:**
```typescript
// Event model should include:
{
  attendeeListVisibility: 'public' | 'members_only' | 'hosts_only' | 'hidden'
}

// Default for private events: 'hosts_only'
// Default for unlisted/public: 'public'
```

**Privacy levels:**
- `public`: Anyone can see names, emails, profiles
- `members_only`: Only invited attendees see names (emails hidden)
- `hosts_only`: Only event hosts see attendee list
- `hidden`: No attendee list shown to anyone except hosts

### Standard Security Measures

**Token Generation:**
- Use `crypto.randomBytes(32)` or equivalent
- Minimum 32 bytes of entropy (256 bits)
- URL-safe base64 encoding
- Check uniqueness before saving

**Access Control:**
- Only event host can create invitations
- Only event host can view invitation list
- Only event host can disable/revoke invitations
- Anyone with valid token can use it (by design for shareable links)

**Data Retention & GDPR Compliance:**
- Document invitation tracking in privacy policy
- Allow users to request deletion of invitation history
- Consider auto-deletion of invitation_uses records 90 days after event ends
- Handle user account deletion (SET NULL on foreign keys or cascade delete)

---

## Acceptance Criteria

### Phase 1: Direct Invites (MVP)

**For Events:**
- [ ] Host can search OpenMeet users by name/username
- [ ] Host can invite multiple users at once
- [ ] Invited users receive in-app notification
- [ ] Invited users receive email notification
- [ ] Invited users auto-granted "invited" status
- [ ] Invited users can view event details
- [ ] Invited users can RSVP Going/Not Going
- [ ] Host can see list of invited users
- [ ] Non-host cannot invite users

**For Groups:**
- [ ] Admin can search OpenMeet users
- [ ] Admin can invite multiple users at once
- [ ] Invited users auto-granted membership
- [ ] Invited users can see all group content
- [ ] Invited users can see all group events
- [ ] Admin can see list of members
- [ ] Non-admin cannot invite users

---

### Phase 2: Email Invitations

**Backend:**
- [ ] Host can paste email list (comma-separated)
- [ ] System generates unique token per email
- [ ] System sends personalized email to each address
- [ ] Email contains unique link (not shareable)
- [ ] Token locked to specific email address
- [ ] User must verify email ownership to use token
- [ ] Non-user clicking link → Signup with email pre-filled
- [ ] After signup, auto-matched to invitation
- [ ] Host can see invitation status (sent/opened/accepted)
- [ ] Host can resend invitation to specific email
- [ ] Expired tokens show clear error message

**Frontend:**
- [ ] Email invitation UI with textarea for email list
- [ ] Shows validation for email format
- [ ] Shows sending progress
- [ ] Shows tracking: sent/opened/accepted per email
- [ ] Resend button for unaccepted invitations

---

### Phase 3: Viral Invitations

**Enable Viral Invitations:**
- [ ] Host can enable viral invitations on event/group
- [ ] Host sets max depth (how many levels)
- [ ] Host sets per-person quota (invites per person)
- [ ] Host sets expiration for all viral invites
- [ ] Settings apply to all viral sub-invitations

**Invitee Experience:**
- [ ] Invited user sees "Invite your friends" button
- [ ] User clicks → Gets personal invitation link
- [ ] Link format: `?invite=username-token`
- [ ] User can copy and share their personal link
- [ ] User sees remaining quota (e.g., "3/5 invites used")
- [ ] User at max depth cannot generate sub-invites
- [ ] User sees: "You were invited by [Name]"

**Invitation Tree:**
- [ ] Host can view full invitation tree
- [ ] Tree shows: Username, depth, invited by whom
- [ ] Host can expand/collapse branches
- [ ] Host can click any person to see their chain
- [ ] Host can message any inviter in chain
- [ ] Host can see: "Dave invited by Alice, Alice invited by You"

**Revocation:**
- [ ] Host can remove individual person
- [ ] Host can remove entire branch (person + all their invitees)
- [ ] Removal shows confirmation: "Will remove N people"
- [ ] Removed users lose access immediately
- [ ] Removed users cannot use their old links

**Security:**
- [ ] Each viral link is unique to the inviter
- [ ] Depth limits enforced (cannot invite beyond max depth)
- [ ] Per-person quotas enforced (cannot exceed invite limit)
- [ ] Expired viral tokens show error
- [ ] Revoked branches cannot be re-used
- [ ] Full audit trail maintained

---

## Testing Strategy

**Unit Tests:**
- Token generation (uniqueness, format)
- Expiration calculation
- Validation logic (expired, revoked, max uses)
- Access control (host-only operations)

**Integration Tests:**
- Create invitation endpoint
- List invitations endpoint
- Revoke invitation endpoint
- Accept invitation flow

**E2E Tests:**
- Full flow: Create event → Generate link → Share → Guest accepts → RSVP
- Error flows: Expired, revoked, over-used
- Security: Non-host cannot manage invitations

---

## Implementation Timeline

### Phase 1: Direct Invites (MVP - 5 days)

**Backend (3 days):**
- User search API
- Direct invitation logic
- In-app notifications
- Email notifications (simple template)
- Works for events + groups

**Frontend (1.5 days):**
- User search component
- Invite modal
- Notification UI

**Testing (0.5 days):**
- E2E tests for direct invites

**Deliverable:** Private groups now have a way to add members ✅

---

### Phase 2: Email Invitations (V1.5 - +3 days)

**Backend (2 days):**
- Database migration (add viral fields)
- Email-locked token generation
- MJML email templates
- Token validation with email verification
- Invitation tracking

**Frontend (1 day):**
- Email list input UI
- Invitation tracking dashboard
- Resend functionality

**Testing (included):**
- Email invitation flows

**Deliverable:** Can invite non-OpenMeet users via email ✅

---

### Phase 3: Viral Invitations (V2 - +4.5 days)

**Backend (2.5 days):**
- Invitation chain tracking
- Tree building queries
- Per-person link generation
- Depth/quota enforcement
- Branch revocation logic

**Frontend (1.5 days):**
- Viral invitation settings UI
- "Generate my link" button
- Invitation tree visualization
- Granular revocation UI

**Testing (0.5 days):**
- Viral chain scenarios
- Edge cases (max depth, quotas)

**Deliverable:** Full viral invitation system with accountability ✅

---

**Total Implementation:** 12.5 days across 3 phases

---

## Future Enhancements (V3+)

**Advanced Analytics:**
- Invitation funnel visualization
- Conversion rates per inviter
- Most effective invitation methods
- Viral growth metrics

**Invitation Templates:**
- Customizable email templates
- SMS invitations (via phone number)
- WhatsApp integration

**Approval Workflows:**
- Require host approval for 2nd+ level invites
- Questionnaires for new members
- Conditional approval rules

**Bulk Operations:**
- CSV upload for large email lists
- Bulk branch operations
- Export invitation data

---

## Dependencies

**Backend:**
- EventAttendeeService (to create attendee records)
- NotificationService (future: send emails)
- Crypto library (token generation)

**Frontend:**
- Clipboard API (copy to clipboard)
- Router (handle query params)
- Auth store (check authentication)

**Environment:**
- FRONTEND_URL env var (to build invitation URLs)
