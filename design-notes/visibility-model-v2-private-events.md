# Visibility Model V2: Private Events & Groups

* **Status:** ✅ Design Approved - Ready for Implementation
* **Date:** 2025-11-18
* **Replaces:** Current "Authenticated" visibility model
* **Related:** `event-visibility-and-permissions.md`, `activity-feed-system.md`

## Executive Summary

This document defines a new visibility model that clarifies the distinction between **Unlisted** (formerly "Authenticated") and **Private** events/groups. The key change: **Private entities require both authentication AND invitation/membership to view**.

---

## Problems with Current Model

### 1. Confusing Terminology
- "Authenticated" doesn't clearly communicate "unlisted but viewable with link"
- Users expect "Private" to require login, but it's currently broken (no enforcement)

### 2. Security Vulnerability
- VisibilityGuard currently reads from custom headers instead of URL params
- **Critical:** Private events are accessible to anyone with the URL
- Private birthday parties, confidential meetings, and sensitive events are fully exposed

### 3. Unclear Access Patterns
- What information is visible before login?
- What information is visible after login but before invitation?
- What happens when you click a private event link?

---

## New Visibility Model

### Overview

| Visibility | Search Index | Anyone with Link | Logged In (Not Invited) | Invited/Member Only |
|-----------|--------------|------------------|------------------------|---------------------|
| **Public** | ✅ Yes | ✅ Full details | ✅ Full details | ✅ Full details |
| **Unlisted** | ❌ No | ✅ Full details | ✅ Full details | ✅ Full details |
| **Private** | ❌ No | 🔒 Login required | 📋 Teaser info only | ✅ Full details |

### Public Events
**Philosophy:** Fully discoverable and open

- **Indexed:** Yes (appears in search results, sitemaps, Google)
- **Access:** Anyone can view full details
- **Link Previews:** Yes (Open Graph tags)
- **Bot Access:** Full access
- **Activity Feed:** Visible in sitewide feed
- **Use Case:** Public workshops, community events, open meetups

### Unlisted Events
**Philosophy:** Not searchable, but transparent if you have the link

**Renamed from:** "Authenticated" (confusing name)

- **Indexed:** No (not in search, not in sitemaps)
- **Access:** Anyone with link can view full details (no login required)
- **Link Previews:** Yes (Open Graph tags for sharing)
- **Bot Access:** Preview only (for link unfurling)
- **Activity Feed:** NOT visible in sitewide feed, or anonymized
- **Use Case:** Events you want to share via link but not advertise publicly

**Examples:**
- "Friends Game Night" - not advertised, but anyone invited can see details
- "Study Group" - shared in Discord/Slack, no login required
- "Neighborhood BBQ" - shared via NextDoor link

### Private Events
**Philosophy:** Truly private - login + invitation required

- **Indexed:** No
- **Access (Logged Out):** Shows "Private event - login required" message
- **Access (Logged In, Not Invited):** Shows teaser info + "Request Invitation" option
- **Access (Invited):** Full details
- **Link Previews:** No (returns 403/404)
- **Bot Access:** Blocked (403/404)
- **Activity Feed:** NOT visibile in sitewide feed, or anonymized 
- **Use Case:** Confidential meetings, private parties, sensitive events

**Examples:**
- "Emma's 6th Birthday Party" - only invited families can see details
- "Board Meeting" - only board members can view
- "Support Group Session" - only registered members

---

## Access Control Flows

### Private Event: Logged-Out User

**User Action:** Visits `/events/emmas-birthday-party` (not logged in)

**System Response:**
```
┌─────────────────────────────────────┐
│  🔒 Private Event                   │
├─────────────────────────────────────┤
│  This is a private event.           │
│  You must log in and be invited     │
│  to view event details.              │
│                                      │
│  [ Log In ]  [ Create Account ]     │
└─────────────────────────────────────┘
```

**HTTP Response:** 403 Forbidden (reveals event exists)

**After Login:** Redirect back to event URL → Check invitation status

### Private Event: Logged-In User (Not Invited)

**User Action:** Visits private event URL (logged in, but not invited)

**System Response:**
```
┌─────────────────────────────────────┐
│  🔒 Emma's 6th Birthday Party       │
├─────────────────────────────────────┤
│  Hosted by: Sarah Johnson           │
│  Date: June 15, 2025                │
│  Location: Hidden until invited     │
│                                      │
│  This is a private event.            │
│  You can request an invitation.      │
│                                      │
│  [ Request Invitation ]              │
└─────────────────────────────────────┘
```

**Shown (Teaser Info):**
- Event name
- Host name
- Date & time
- "Private event" badge

**Hidden (Member-Only Info):**
- Full description
- Exact location
- Attendee list
- RSVP button
- Chat/discussion

**HTTP Response:** 200 OK (shows teaser page)

### Private Event: Invited User

**User Action:** Visits private event URL (logged in, invited/RSVP'd)

**System Response:**
```
┌─────────────────────────────────────┐
│  Emma's 6th Birthday Party          │
├─────────────────────────────────────┤
│  Hosted by: Sarah Johnson           │
│  Date: June 15, 2025 at 2:00 PM     │
│  Location: 123 Main St, Springfield │
│                                      │
│  Join us for Emma's 6th birthday... │
│  [full description]                  │
│                                      │
│  👥 Attendees (8)                    │
│  [attendee list]                     │
│                                      │
│  [ Going ]  [ Can't Go ]             │
└─────────────────────────────────────┘
```

**HTTP Response:** 200 OK (full details)

---

## Information Disclosure Model

### Public Information (Shown to Anyone)
For **Private** events, minimal info is shown to indicate event exists but is restricted:

- ✅ Event name
- ✅ Host name
- ✅ Date & time (no timezone details)
- ✅ "Private event" indicator
- ❌ Description
- ❌ Location
- ❌ Attendee list
- ❌ Discussion/chat

### Member-Only Information (Shown to Invited)
Full event details available only after authentication + invitation:

- ✅ Full description
- ✅ Exact location with map
- ✅ Attendee list
- ✅ RSVP status
- ✅ Event discussion/chat
- ✅ Host contact info
- ✅ Event updates

**Rationale:** This allows hosts to control sensitive information while still allowing invited users to know the event exists and request access.

---

## Invitation Mechanisms

### For Private Events

#### 1. Invitation Tokens (Shareable Links)
Host generates shareable link with token:

```
https://openmeet.net/events/birthday?invite=abc123xyz
```

**Behavior:**
- Link can be shared via email, messaging, etc.
- Token auto-grants "invited" status
- Recipient must still log in to view full details
- Tracks who used the invitation

**Token Properties:**
- **Expiration:** 30 days default (host configurable: 7/30/90 days or custom)
- **Max Uses:** Unlimited by default, or set a limit (e.g., "first 10 people")
- **Revocation:** Host can revoke token, which removes all users who joined via it
- **Tracking:** System tracks invitation creation, usage, and acceptance

#### 2. Group Membership (Auto-Invitation)
Private events in private groups:

**Rule:** If you're a member of a **private group**, you can view all **private events** in that group automatically.

**Example:**
- "Book Club" is a private group
- "Monthly Book Discussion" is a private event in that group
- All Book Club members can see the event automatically without explicit invitation

**Group Inheritance:**
- Events created in private groups default to "private" visibility
- Event creator can override to "unlisted" or "public" if desired

#### 3. Manual Email Invitations
Host manually enters email addresses:

- System sends invitation emails with token links
- Email contains event teaser + invitation button
- Tracks invitation status (sent, opened, RSVP'd)
- Supports inviting non-users via email (they create account to RSVP)

---

## Host User Flows: Inviting People to Events

### Public Event: Simple Link Sharing

**Host Experience:**
1. Create event, set visibility to "Public"
2. Click "Share" button → Copy event URL
3. Share link anywhere (email, social media, messaging)

**Guest Experience:**
- Click link → See full event details immediately
- Can RSVP without logging in (email required)
- Event appears in public search results

**Key Point:** No invitation system needed - just share the URL

---

### Unlisted Event: Private Link Sharing

**Host Experience:**
1. Create event, set visibility to "Unlisted"
2. Click "Share" button → Copy event URL
3. Share link privately (email, Discord, Slack, group chat)

**Guest Experience:**
- Click link → See full event details immediately
- Can RSVP without logging in (email required)
- Event does NOT appear in search results

**Key Point:** Same as public, but not searchable - only accessible via direct link

**Use Case:** "Friends Game Night" where you want anyone invited to see details, but don't want it advertised publicly

---

### Private Event: Invitation System Required

Private events offer **three invitation methods**:

#### Option 1: Shareable Invitation Link (Batch Invite)

**Best for:** Inviting multiple people via one link (WhatsApp group, group email, Discord)

**Host Experience:**
1. Create event, set visibility to "Private"
2. Go to event page → Click "Invite People"
3. Click "Create Shareable Link"
4. **Configure link settings:**
   - Set expiration (7/30/90 days or custom)
   - Set max uses (unlimited or limit like "first 20 people")
5. Click "Create Link" → Get URL: `https://openmeet.net/events/birthday?invite=abc123xyz`
6. **Copy and share** this one link with everyone

**Guest Experience:**
- Click invitation link
- If not logged in → Prompted to log in or create account
- After login → Automatically granted access to view full event
- Can now RSVP and see all event details

**Example:**
```
Host shares in family WhatsApp group:
"Emma's birthday party this Saturday!
Click to RSVP: https://openmeet.net/events/emma-bday?invite=abc123"

Everyone in the group clicks the same link, logs in, and can RSVP.
```

**Link Management:**
- Host can create multiple different links (e.g., one for family, one for friends)
- Host can see who used each link
- Host can revoke a link (removes everyone who joined via it)

---

#### Option 2: Email List (Individual Invitations)

**Best for:** Inviting a specific list of people with personalized emails

**Host Experience:**
1. Create event, set visibility to "Private"
2. Go to event page → Click "Invite People"
3. Click "Invite by Email"
4. **Enter email addresses** (paste list, comma-separated or one per line):
   ```
   alice@example.com
   bob@example.com
   carol@example.com
   ```
5. Optionally add personal message
6. Click "Send Invitations"
7. System sends **individual emails** to each person

**Email Content:**
```
Subject: You're invited to Emma's 6th Birthday Party

Hi Alice,

Sarah Johnson has invited you to:

Emma's 6th Birthday Party
June 15, 2025 at 2:00 PM

[View Invitation & RSVP]  ← Button with unique token

This invitation link is just for you and expires in 30 days.
```

**Guest Experience (Existing User):**
- Receives email with invitation button
- Clicks button → Logs in → Auto-granted access
- Can RSVP and see full event details

**Guest Experience (Non-User):**
- Receives email with invitation button
- Clicks button → Prompted to create account
- After signup → Auto-granted access to event
- Can RSVP and see full event details

**Invitation Tracking:**
- Host can see invitation status for each email:
  - ✅ Sent
  - 📧 Opened (email tracking)
  - 👁️ Viewed (clicked link)
  - ✓ Accepted (RSVP'd)
  - ❌ Declined
- Host can resend invitation to specific people
- Each person gets their own unique token

**Handling Non-Users:**
- System creates pending invitation record
- When they sign up with that email → Auto-matched to invitation
- No manual "importing" needed - they self-signup

---

#### Option 3: Search and Invite Users (Platform Members)

**Best for:** Inviting people you know are already on OpenMeet

**Host Experience:**
1. Create event, set visibility to "Private"
2. Go to event page → Click "Invite People"
3. Click "Search Users"
4. Type names to search existing users
5. Click "Invite" next to each person

**Guest Experience:**
- Receives in-app notification: "Sarah invited you to Emma's 6th Birthday Party"
- Receives email notification
- Clicks notification → Auto-granted access
- Can RSVP and see full event details

**Key Point:** No email addresses needed - search by name or username

---

### Comparison: When to Use Each Method

| Method | Best For | Link Type | System Sends Email? |
|--------|----------|-----------|---------------------|
| **Shareable Link** | Batch invite via messaging apps | One link, multiple uses | ❌ No - you share manually |
| **Email List** | Formal invitations, non-users | One link per person | ✅ Yes - individual emails |
| **Search Users** | Inviting platform members | Direct invitation | ✅ Yes - notification + email |

### Mixing Methods

**You can use multiple methods for the same event:**

Example: Birthday party with 50 guests
- **Email List:** Send formal invitations to 20 close family members
- **Shareable Link:** Share in family WhatsApp group (15 relatives)
- **Search Users:** Directly invite 10 friends already on OpenMeet
- **Another Shareable Link:** Share in kid's class parent group (5 classmates)

All 50 people get access, and host can track who used which method.

---

### What About Public/Unlisted Events?

**No invitation system needed!** Just:
1. Click "Share" → Copy URL
2. Share the URL anywhere

**Why no invitation system for public/unlisted?**
- Anyone with the link can already see everything
- No need to track who's invited vs not invited
- Simpler UX - just share the link

---

## Activity Feed Privacy

### Private Event Activities

When Alice RSVPs to a private event:

**Sitewide Feed (Public):**
```
❌ "Alice joined Emma's Birthday Party"  -- BAD: Leaks private info
✅ [Don't show anything]                  -- GOOD: No leak
```

**Group Feed (Members-Only):**
```
✅ "Alice joined Emma's Birthday Party"   -- OK: Only members see
```

**Event Feed (Attendees-Only):**
```
✅ "Alice is attending Emma's Birthday Party"  -- OK: Only attendees see
```

### Activity Visibility Rules

| Event Visibility | Activity Visibility | Who Can See Activity |
|-----------------|-------------------|---------------------|
| Public | `public` | Everyone (sitewide feed) |
| Unlisted | `public` | Everyone (sitewide feed) |
| Private | `members_only` | Attendees only (event/group feed) |

**Key Point:** Private event activities are completely hidden from sitewide feeds to prevent information leakage.

---

## Error Handling & HTTP Status Codes

### Event Exists vs. Doesn't Exist

**Design Decision:** Reveal existence of private events to help users understand why they can't access it.

| Scenario | HTTP Status | User Experience |
|----------|-------------|-----------------|
| Event doesn't exist | 404 Not Found | "Event not found" |
| Private event (logged out) | 403 Forbidden | "This is a private event. Please log in." |
| Private event (logged in, not invited) | 200 OK | Shows teaser page with "Request Invitation" |
| Private event (invited) | 200 OK | Shows full details |
| Unlisted event | 200 OK | Shows full details (no auth required) |
| Public event | 200 OK | Shows full details |

**Rationale:**
- **403 vs 404:** Different errors help users understand what's happening
- **Information Leakage:** Acceptable trade-off - users know event exists but can't see sensitive details
- **User Experience:** Better than cryptic 404 when a friend shares a private event link

---

## Security Considerations

### Information Leakage Vectors

**Timing Attacks:**
- Response time might reveal if event exists
- **Mitigation:** Consistent response times, don't optimize "not found" path

**Enumeration Attacks:**
- Attacker tries `/events/private-1`, `/events/private-2`, etc.
- Learns which private events exist
- **Mitigation:** Acceptable - revealing existence is OK, details are protected

**Activity Feed Leaks:**
- "Alice joined X" reveals event name
- **Mitigation:** Filter private event activities from sitewide feed

**Error Message Leaks:**
- Different errors for "not found" vs "private"
- **Mitigation:** Acceptable trade-off for better UX

### Best Practices

1. **Default Deny:** If in doubt, require auth + invitation
2. **Principle of Least Privilege:** Show minimal info until access verified
3. **Audit Logging:** Log all access attempts to private events
4. **Rate Limiting:** Prevent enumeration attacks via rate limits
5. **HTTPS Only:** All private event links must use HTTPS

---

## Design Decisions & Clarifications

### 1. Group-Event Inheritance
**Decision:** ✅ Yes - Private group events default to private visibility

- Events created in private groups inherit `visibility: 'private'` by default
- Event creator can override to 'unlisted' or 'public' if desired
- Provides expected privacy behavior for group contexts

### 2. Invitation Token Expiry
**Decision:** ✅ Custom expiry (30 days default, configurable by host)

- Default expiration: 30 days from creation
- Host can customize: no expiry, 7 days, 30 days, 90 days, or custom date
- Tokens for existing attendees (during migration): no expiry

### 3. Token Revocation
**Decision:** ✅ Revoke all access

- Revoking a token disables the link AND removes all users who joined via that token
- Provides host control over who has access
- Attendees can be re-invited with new token if needed

### 4. Invitation Notifications
**Decision:** ✅ Email notifications when explicitly invited

- Send email when host creates invitation token for specific user
- Email includes direct link with token
- No notification for auto-access (e.g., group membership grants event access)

### 5. Analytics Privacy
**Decision:** ✅ Anonymized aggregates + host-only individual metrics

- Platform analytics: Anonymized aggregates only ("50 private events created this month")
- Individual event analytics: Only visible to event host
- No private event details in admin dashboards unless authorized

---

## Migration Strategy

### Current Situation
- "Authenticated" visibility is confusing terminology
- "Private" events are broken (accessible to anyone with URL)
- Existing users may have shared "private" event links expecting them to work

### Migration Approach

#### Phase 0: Pre-Migration (2 weeks before deployment)
**Goal:** Notify hosts of affected events and collect their preferences

1. **Identify Affected Events**
   - Find all events currently marked as `visibility: 'private'`
   - Find all groups marked as `visibility: 'private'`

2. **Notify Event Hosts**
   - Email each host explaining the security fix
   - Present two options:
     - **Convert to "Unlisted"** - Maintains current link-sharing behavior
     - **Keep as "Private"** - Requires login + invitation (we'll help set up)

3. **Default Behavior**
   - If host doesn't respond within 2 weeks: Auto-convert to "Unlisted"
   - Maintains backward compatibility, prevents broken links

4. **For Events Staying Private**
   - Auto-create invitation tokens for existing attendees
   - Ensures current attendees don't lose access

#### Phase 1-7: Implementation
See `visibility-model-v2-private-events-impl.md` for detailed implementation plan

**Timeline:**
- **Phase 0** (Weeks -2 to 0): Pre-migration audit & host notification
- **Phase 1** (Week 1): Database migration (authenticated → unlisted)
- **Phase 2** (Week 1-2): VisibilityGuard security fix
- **Phase 3** (Week 2): Frontend teaser pages
- **Phase 4** (Week 2-3): Invitation token system
- **Phase 5** (Week 3): Activity feed privacy
- **Phase 6** (Week 3-4): Testing & validation
- **Phase 7** (Week 4): Deployment & monitoring

**Total Duration:** ~6 weeks (including 2-week pre-migration period)

---

## Success Metrics

- [ ] Zero unauthorized access to private event details
- [ ] Zero private event info in activity feeds for non-members
- [ ] Clear user feedback when accessing private events
- [ ] No increase in 404 errors (should see increase in 403s instead)
- [ ] Invitation tokens work correctly
- [ ] Group members can access group private events
- [ ] 100% of affected hosts notified before deployment
- [ ] No broken event links after migration

---

## References

- **Implementation Details:** `visibility-model-v2-private-events-impl.md`
- **Original Vulnerability:** Issue #279
- **Related Design Docs:**
  - `event-visibility-and-permissions.md`
  - `activity-feed-system.md`
  - `link-preview-meta-tags.md`

---

**Status:** ✅ Design Approved - Ready for Implementation
**Next Steps:** Begin Phase 0 (Pre-migration audit) → See implementation doc for technical details
