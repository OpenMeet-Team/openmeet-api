# Shareable Invitation Links - Specification

**Status:** ⚠️ **DESIGN UNDER REVIEW - Critical Security Questions**
**Original Effort Estimate:** 1.5 days
**Revised Estimate:** TBD pending security decisions

---

## ⚠️ CRITICAL DESIGN QUESTIONS (Unresolved)

**Date:** 2025-01-22
**Issue:** Fundamental tension between "shareable links" and "private/confidential events"

### The Core Problem

Shareable invitation links (one URL shared with multiple people) have **inherent security risks** that may be **incompatible with truly private events**:

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

### Alternative Approaches

#### Approach 1: No Shareable Links for Private Events (Most Secure)
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

#### Approach 2: Email Invitations Only (Secure, More Complex)
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

#### Approach 3: Shareable Links with Warnings (Fastest, Least Secure)
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

#### Approach 4: Two-Tier Visibility Model (Recommended?)
```
Unlisted Events:
✅ Shareable links (anyone with link can view, no login)
✅ Convenient for casual private events
✅ Security risk acceptable (birthday parties, game nights)

Private Events:
✅ Manual add (existing users)
✅ Group membership (existing users)
✅ Email invitations (V2, per-person tokens)
❌ No shareable links (incompatible with confidentiality)

Philosophy:
- If event needs shareable links → Use Unlisted
- If event needs true confidentiality → Use Private (no shareable links)
- Clear separation of use cases
```

### Required Decisions Before Implementation

- [ ] **Decision 1:** Can private events have shareable invitation links? (Yes/No)
- [ ] **Decision 2:** If yes, what security mitigations are required?
- [ ] **Decision 3:** What's the MVP scope for inviting non-users?
- [ ] **Decision 4:** Revocation behavior (Disable vs Remove attendees) - ✅ **RESOLVED: Separate actions**
- [ ] **Decision 5:** Auto-RSVP on invitation acceptance - ✅ **RESOLVED: Manual RSVP required**

**Next Steps:** Make architectural decisions above, then revise spec accordingly.

---

## Problem

Hosts cannot invite non-OpenMeet users to private events. Current solutions only work for existing users, making private events unusable for real-world scenarios (birthday parties, family events).

**NOTE:** This problem statement may need revision based on decisions above. If private events cannot support shareable links for security reasons, the "solution" may be different than originally proposed.

---

## Solution

Enable hosts to generate shareable links that grant access to private events.

**Example:** `openmeet.net/events/party?invite=abc123`

---

## User Flows

### Host Creates Invitation Link

1. Host opens private event management page
2. Clicks "Create Invitation Link"
3. Configures:
   - Expiration: 7/30/90 days (default: 30)
   - Max uses: Unlimited or N people
4. Gets shareable link
5. Copies and shares via WhatsApp/text/Discord/email

### Guest Accepts Invitation

**Not Logged In:**
1. Clicks invitation link
2. Redirected to login/signup with return URL
3. After authentication, returns to event page
4. Backend validates token and grants access
5. User added as attendee with "invited" status
6. Can view event details and RSVP

**Already Logged In:**
1. Clicks invitation link
2. Backend validates token and grants access
3. User added as attendee with "invited" status
4. Can view event details and RSVP

### Host Manages Links

1. Views list of active invitation links
2. Sees usage stats (N/max uses, expiration date)
3. Can copy link again
4. Can revoke link

---

## Data Model

### event_invitations

Stores invitation links created by hosts.

**Fields:**
- id
- event_id → events
- token (unique, URL-safe string)
- invited_email (nullable - NULL for shareable, set for email invites in V2)
- max_uses (nullable - NULL = unlimited)
- uses_count (increments each use)
- expires_at (nullable - when link expires)
- created_by_user_id → users
- revoked_at (nullable - when host revoked)
- status (active/expired/revoked)
- created_at
- updated_at

**Indexes:**
- token (unique)
- event_id
- status

### event_invitation_uses

Tracks who used each invitation.

**Fields:**
- id
- invitation_id → event_invitations
- user_id → users
- used_at

**Constraints:**
- Unique(invitation_id, user_id) - prevent duplicate uses

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

### POST /events/:slug/invitations
**Auth:** Required (must be event host)

**Request:**
```json
{
  "expiresIn": "30days",
  "maxUses": 20
}
```

**Response:**
```json
{
  "id": 123,
  "token": "abc123xyz",
  "inviteUrl": "https://openmeet.net/events/party?invite=abc123xyz",
  "maxUses": 20,
  "usesCount": 0,
  "expiresAt": "2025-02-20T12:00:00Z",
  "status": "active"
}
```

### GET /events/:slug/invitations
**Auth:** Required (must be event host)

**Response:**
```json
[
  {
    "id": 123,
    "inviteUrl": "...",
    "maxUses": 20,
    "usesCount": 5,
    "expiresAt": "...",
    "status": "active",
    "createdAt": "..."
  }
]
```

### DELETE /events/:slug/invitations/:id
**Auth:** Required (must be event host)

Revokes the invitation link.

**Response:**
```json
{ "success": true }
```

### GET /events/:slug?invite=TOKEN
**Auth:** Optional

When `invite` query param present:
- If not authenticated: Return 401 with "login required" message
- If authenticated: Validate token and grant access

**Token Validation:**
1. Token exists
2. Not revoked
3. Not expired
4. Under max uses
5. User hasn't already used it

**On Success:**
- Create event_attendee record (status: invited)
- Record usage in event_invitation_uses
- Increment uses_count
- Return event details

**On Failure:**
- Return 403 with error message

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

- [ ] Host can create invitation link with expiration
- [ ] Host can create invitation link with max uses
- [ ] Host can copy invitation link
- [ ] Host can view list of invitations with stats
- [ ] Host can revoke invitation link
- [ ] Guest clicks link → prompted to login (if not authenticated)
- [ ] After login, guest auto-granted event access
- [ ] Guest added with "invited" status
- [ ] Guest can view event details
- [ ] Guest can RSVP
- [ ] Expired links show error
- [ ] Revoked links show error
- [ ] Over-used links show error
- [ ] Duplicate use by same user is no-op
- [ ] Non-host cannot create invitations
- [ ] Non-host cannot view invitations
- [ ] Non-host cannot revoke invitations

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

## Future Enhancements (V2)

**Email Delivery:**
- Send invitations directly via email
- Use invited_email field
- Track email open/click events
- Per-user tokens (max_uses = 1)

**Bulk Invitations:**
- CSV upload for large lists
- Batch email sending

**Analytics:**
- Invitation funnel (created → clicked → accepted → RSVP'd)
- Conversion rates
- Most effective sharing channels

**Group Invitations:**
- Same system for private groups
- Parallel table: group_invitations

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
