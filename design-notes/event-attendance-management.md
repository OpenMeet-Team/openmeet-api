# Event Attendance Management

> **🚧 V2 FEATURE SPECIFICATION**
>
> This document describes **V2 features** (2-3 months timeline).
>
> **MVP includes:** Going/Not Going RSVP only, hard capacity limits, no waitlist.
>
> **See:** `ACCESS-AND-ATTENDANCE-ROADMAP.md` for phased implementation plan.

**Status:** 🚧 V2 Feature Spec (Not MVP)
**Date:** 2025-11-19
**Estimated Effort:** 4-6 weeks (after MVP ships)
**Related:** `visibility-model-v2-private-events.md`, `ACCESS-AND-ATTENDANCE-ROADMAP.md`

---

## Executive Summary

This document defines the **complete attendance management system** for events, including two-step invitations, RSVP flow, capacity management, waitlists, and guest policies.

**Key Principle:** Invitation acceptance ≠ Attendance. These are two separate steps that serve different purposes.

**MVP Simplification:** MVP uses single-step RSVP (Going/Not Going only) without invitation acceptance step.

---

## Core Concepts

### Two-Step Process: Invitation → RSVP (V2 Feature)

> **Note:** MVP uses single-step RSVP. Two-step process is V2.

```
Step 1: Accept Invitation (V2)
  → Grants VIEW access to event details
  → Status: "invited"
  → Does NOT count against capacity
  → Can see full event info, attendee list, location
  → Required for private events only

Step 2: RSVP to Event (Separate Action)
  → Signals attendance intent to host
  → "Going" RSVPs count against capacity (status: "confirmed")
  → "Not Going" does not count (status: "cancelled")
  → Required for both public and private events
```

**Why Two Steps? (V2 Rationale)**
- Host can invite 100 people to a 50-person event
- First 50 to RSVP "Going" get confirmed spots
- Others can still see event details but are waitlisted
- Separates "who can see the event" from "who is attending"

**MVP Approach:**
- No invitation acceptance step
- Direct RSVP: Going or Not Going
- Private event access via group membership or manual add

---

## RSVP States

### User-Facing RSVP Choices

Users have **two simple choices** when RSVPing:

| User Choice | Counts Against Capacity | Receives Updates | Can See Event Details |
|-------------|------------------------|-----------------|---------------------|
| **Going** | ✅ Yes | ✅ All updates | ✅ Yes |
| **Not Going** | ❌ No | ⚠️ Major updates only | ✅ Yes (if invited) |

> **Note on "Maybe" Status:**
> - "Maybe" was considered but **deferred indefinitely**
> - Adds complexity without clear value
> - Most events need binary: Going or Not Going
> - Some references to "Maybe" remain in this doc (legacy from earlier design)

### System-Managed Statuses

The system assigns these statuses based on event state:

| Status | Description | User Action Required |
|--------|-------------|---------------------|
| **Invited** | Accepted invitation, hasn't RSVP'd yet | User needs to choose Going/Not Going |
| **Pending** | RSVP awaiting host approval | Wait for host to approve/reject |
| **Waitlist** | Event is full, user is on waitlist | Wait for spot to open, then claim it |
| **Rejected** | Host rejected their RSVP request | None - cannot attend |
| **Attended** | User actually showed up to event | None - post-event tracking |

### State Transitions

**From "Invited" (hasn't RSVP'd):**
- User clicks "Going" → Status becomes "Confirmed" (if spots available) or "Waitlist" (if full)
- User clicks "Not Going" → Status becomes "Cancelled"

**From "Going" (Confirmed):**
- User changes to "Not Going" → Frees capacity spot, waitlist notified

**From "Not Going" (Cancelled):**
- User changes to "Going" → Status becomes "Confirmed" (if spots available) or "Waitlist" (if full)

**From "Waitlist":**
- User removes self → Status becomes "Cancelled"
- Spot opens → User gets notification to claim spot within 24 hours
- User claims spot → Status becomes "Confirmed"
- User misses deadline → Moved to back of waitlist

**Key Rule:** Users can always change between "Going" and "Not Going" at any time.

---

## Capacity Management

### Basic Capacity

**Host sets capacity when creating event:**
```
Event Capacity: 50 people
- First 50 "Going" RSVPs get confirmed spots
- RSVP #51 automatically goes to waitlist
- Capacity includes +guests (see Guest Policy section)
```

**Capacity Enforcement:**
- Soft limit: Recommend capacity, warn when exceeded
- Hard limit: Stop accepting "Going" RSVPs at capacity (our approach)

**Tracking:**
```
Event Dashboard shows:
├─ Confirmed: 45 people (going)
├─ Available: 5 spots
├─ Waitlist: 8 people
├─ Maybe: 12 people (not counted)
└─ Declined: 5 people (not counted)
```

---

## Waitlist System

### Automatic Waitlist

**When capacity is reached:**
1. User tries to RSVP "Going"
2. System checks: 50/50 spots filled
3. System responds: "Event is full. Join waitlist?"
4. User joins waitlist → Position #1

**Waitlist Display to User:**
```
Emma's 6th Birthday Party
Saturday, June 15, 2025 at 2:00 PM

⚠️ Event is Full (50/50 spots)
You are #3 on the waitlist

If a spot opens, you'll be notified and have 24 hours to claim it.

[ Leave Waitlist ]
```

---

### Waitlist Progression

**When someone cancels (frees up spots):**

**Example: 3-spot opening**
```
Timeline:
1. Sarah (Going + 2 guests) changes to "No"
2. 3 spots freed: 47/50 confirmed
3. System notifies Bob (waitlist #1)

Bob's Notification:
"3 spots opened for Emma's Birthday Party!
 You can RSVP with up to 3 people (including yourself).
 Claim within 24 hours or spot goes to next person.
 [Claim Spot]"

Scenarios:

A) Bob claims 3 spots within 24 hours:
   - Bob moves to "Going + 2 guests"
   - Capacity: 50/50 (full again)
   - Waitlist: Carol is now #1

B) Bob claims 1 spot within 24 hours:
   - Bob moves to "Going + 0 guests"
   - Capacity: 48/50
   - 2 spots still available
   - System notifies Carol (now #1) immediately

C) Bob doesn't respond within 24 hours:
   - Bob stays on waitlist, moves to end (position #8)
   - System notifies Carol (was #2, now #1)
   - Carol gets same 24-hour window
```

**Claiming Rules:**
- Can claim fewer spots than available (remaining spots stay open)
- Can claim with +guests (if event allows)
- Must claim within 24-hour window
- Missing deadline = move to back of waitlist

---

### Waitlist After RSVP Cutoff

**Special rule: Waitlist continues even after RSVP deadline**

```
Event: June 15, 2025 at 6:00 PM
RSVP Cutoff: June 8 (1 week before)

Before June 8:
├─ Anyone can RSVP "Going" (if spots available)
├─ Waitlist can be joined
│
After June 8 (RSVP cutoff passed):
├─ ❌ No new RSVPs accepted (period closed)
├─ ✅ BUT: If someone cancels, waitlist still processes
│
June 10:
├─ Alice changes "Going" → "No" (spot opens)
├─ Bob (waitlist #1) gets notified
├─ Bob can claim until June 15 at 6:00 PM
│
June 14:
├─ Carol changes "Going" → "No" (spot opens)
├─ David (waitlist #1) gets notified
├─ David can claim until event starts
```

**Why?** Host wants final headcount by cutoff date, but better to fill last-minute cancellations than have empty spots.

---

## Guest/+1 Policy

### Event-Level Configuration

**Host configures when creating/editing event:**

```
Guest Policy Settings:

○ No guests allowed
  Each RSVP = exactly 1 person
  Example: Intimate dinner party, assigned seating

● Allow +1 guest per RSVP
  Each RSVP can bring 0-1 guest (2 people max)
  Example: Wedding plus-ones, networking events

○ Allow +N guests per RSVP
  Each RSVP can bring 0-N guests
  Example: Family event (+2 = family of 3), birthday parties
```

**Default:** Allow +1 guest per RSVP

---

### RSVP with Guests

**User Flow:**

```
Emma's 6th Birthday Party
Capacity: 50 people (45 confirmed, 5 spots remaining)
Guest policy: +2 guests allowed

Your RSVP:
☑ I'm going

How many people total? (including yourself)
[▼ 1] ← Dropdown: 1 (just me), 2 (+1 guest), 3 (+2 guests)

Note: This will reserve 3 spots from available capacity.

[ Confirm RSVP ]
```

**Capacity Impact:**
```
Before:
├─ Capacity: 45/50 confirmed
├─ Available: 5 spots

Alice RSVPs: Me + 2 guests (3 people total):
├─ Capacity: 48/50 confirmed
├─ Available: 2 spots

Bob RSVPs: Me + 2 guests (3 people total):
├─ Capacity: 50/50 confirmed (FULL)
├─ Available: 0 spots

Carol tries to RSVP: Just me (1 person):
├─ Event is full
├─ Carol automatically added to waitlist (#1)
```

---

### Managing Guests

**Changing Guest Count:**
- User can update number of guests any time before event
- Decreasing guests: Frees up spots, notifies waitlist
- Increasing guests: Only allowed if spots available, otherwise waitlist

**Example:**
```
Alice RSVP'd: Me + 2 guests (3 spots used)

Alice updates to: Just me (1 spot used)
Result:
├─ 2 spots freed
├─ Capacity: 48/50
├─ Waitlist #1 notified of 2 available spots
```

**Guest Names (Optional Feature):**
- Host can require guest names for security/planning
- Example: "John Smith +1 (Jane Doe)" vs "John Smith +1"
- Useful for venues requiring guest lists

---

## Invitation Permissions (Viral Invitations)

### Who Can Invite

**Event-Level Configuration:**

```
Invitation Permissions:

○ Only me (event creator)
  Most restrictive, full control

○ Me + designated co-hosts/organizers
  Share invitation duties with trusted helpers

● Any confirmed attendee (viral)
  Most flexible, fastest growth
```

**Default:** Only creator (for private events)

---

### Viral Invitation Flow

**Scenario: Viral invitations enabled**

```
1. Emma creates "Board Game Night" (private event, capacity 20)
2. Emma invites 5 close friends
3. Sarah (invited) accepts invitation, RSVPs "Going"
4. Sarah can now invite others:

   Sarah's view:
   ┌─────────────────────────────────────┐
   │  Board Game Night                    │
   ├─────────────────────────────────────┤
   │  You're attending (Going)            │
   │                                      │
   │  Want to invite friends?             │
   │  [ Share Invitation Link ]           │
   └─────────────────────────────────────┘

5. Sarah generates her own invitation link
6. Sarah shares with 3 friends
7. They accept, view event, can RSVP

Result:
├─ Emma's network: 5 people
├─ Sarah's network: 3 people
└─ Total: 8 people can access event
```

---

### Viral Depth Control

**Configure how far invitations can spread:**

```
Viral Invitation Depth:

○ 1 level (default)
  Emma invites Sarah → Sarah invites Bob → Bob CANNOT invite
  Prevents runaway growth

○ 2 levels
  Emma → Sarah → Bob → Alice CANNOT invite
  Controlled network expansion

○ Unlimited
  Anyone invited can keep inviting indefinitely
  Maximum growth potential, higher risk
```

**Tracking:**
```
Invitation Tree:
├─ Emma (creator)
│   ├─ Sarah (invited by Emma, can invite)
│   │   ├─ Bob (invited by Sarah, can invite if depth > 1)
│   │   └─ Carol (invited by Sarah)
│   ├─ Alice (invited by Emma)
│   └─ David (invited by Emma)
```

**Host Dashboard Shows:**
- Who invited whom
- Invitation chains
- Option to revoke invitation links
- Option to remove specific attendees

---

## RSVP Cutoff Dates

### Purpose

Host needs final headcount for planning:
- Catering orders
- Venue confirmation
- Supply purchases
- Seating arrangements

### Configuration

```
RSVP Deadline Settings:

☑ Enable RSVP cutoff
  Cut off RSVPs: [▼ 1 week] before event

  Options:
  - 1 day before
  - 3 days before
  - 1 week before
  - 2 weeks before
  - Custom date/time

☐ Disable (accept RSVPs until event starts)
```

**Default:** 1 week before event

---

### Behavior After Cutoff

**For New RSVPs:**
```
User tries to RSVP after cutoff:

⚠️ RSVP Period Has Ended

The host closed RSVPs on June 8, 2025.
You can no longer RSVP for this event.

If you were invited, you can still view event details.

[ View Event Details ]
```

**For Existing RSVPs:**
```
✅ Can still change RSVP status
✅ Can change from "Going" → "No" (frees spot)
✅ Can change from "Maybe" → "Going" (if spots available)
✅ Cannot RSVP if previously declined or never RSVP'd
```

**For Waitlist (Exception):**
```
✅ Waitlist continues to process
✅ If spot opens after cutoff, waitlist #1 notified
✅ Can claim until event starts
```

---

### Timeline Example

```
Event: Emma's Birthday Party
Date: June 15, 2025 at 2:00 PM
RSVP Cutoff: June 8, 2025 (1 week before)

May 15 - June 7:
├─ RSVP period OPEN
├─ Anyone invited can RSVP "Going", "Maybe", "No"
├─ Capacity fills: 50/50 confirmed
├─ 8 people on waitlist

June 8 (cutoff):
├─ RSVP period CLOSED
├─ No new RSVPs accepted
├─ Emma has final headcount: 50 people
├─ Emma orders catering for 50

June 10:
├─ Sarah changes "Going" → "No" (-1 spot)
├─ Capacity: 49/50
├─ Bob (waitlist #1) gets notification
├─ Bob can claim until June 15

June 14:
├─ Alice changes "Going + 2" → "Going + 0" (-2 spots)
├─ Capacity: 47/50
├─ Carol (waitlist #1) gets notification for 3 spots
├─ Emma needs to update catering: 47 people
```

---

## Waitlist Claim Window

### Purpose

When a spot opens, how long does someone have to claim it before moving to the next person?

### Configuration

```
Waitlist Settings:

Claim window per person: [▼ 24 hours]

Options:
- 12 hours (fast turnover)
- 24 hours (balanced) ← Default
- 48 hours (lenient)
- Until event starts (maximum flexibility)
```

**Default:** 24 hours

---

### Notification & Claiming

**When Spot Opens:**

```
Notification to Bob (waitlist #1):

Subject: Spot available for Emma's Birthday Party!

A spot just opened up for Emma's Birthday Party!

Event: Saturday, June 15, 2025 at 2:00 PM
Available spots: 3

You have 24 hours to claim your spot.
[Claim Spot Now]

If you don't respond by June 11 at 3:45 PM,
the spot will go to the next person on the waitlist.
```

**Reminder Notifications:**
- 12 hours left: "Reminder: 12 hours to claim"
- 2 hours left: "Final reminder: 2 hours to claim"
- Expired: "Spot was offered to next person"

---

### Claim Scenarios

**Scenario A: Timely Claim**
```
10:00 AM: Spot opens, Bob notified (24hr window)
2:30 PM: Bob claims spot (within window)
Result: Bob moves to "Going", capacity updated
```

**Scenario B: Partial Claim**
```
10:00 AM: 3 spots open, Bob notified
2:30 PM: Bob claims 1 spot (+ 0 guests)
Result:
├─ Bob moves to "Going"
├─ 2 spots still available
├─ Carol (now #1) notified immediately for 2 spots
```

**Scenario C: Missed Deadline**
```
10:00 AM: Spot opens, Bob notified
10:01 AM (next day): Bob doesn't respond
Result:
├─ Bob moves to back of waitlist (now #8)
├─ Carol (was #2) becomes #1
├─ Carol notified with new 24hr window
```

**Scenario D: Declines**
```
10:00 AM: Spot opens, Bob notified
11:00 AM: Bob clicks "No thanks, remove from waitlist"
Result:
├─ Bob removed from waitlist
├─ Carol (was #2) becomes #1
├─ Carol notified immediately
```

---

## RSVP Changes (Always Allowed)

### Philosophy

Life happens. People get sick, have emergencies, or plans change. It's better to free up spots than have no-shows.

### Rules

**Users can always change RSVP status:**
- ✅ From "Going" → "Maybe", "No" (any time, even after cutoff)
- ✅ From "Maybe" → "Going" (if spots available), "No"
- ✅ From "No" → "Going" (if spots available), "Maybe"
- ✅ Even day-of or hours before event

**No penalties (for now):**
- Not tracking "flaky" users
- Not preventing future RSVPs
- Not flagging late cancellations
- Trust-based system

---

### Change Impact

**Going → No (Frees Spot):**
```
Timeline: June 14, event on June 15

3:00 PM: Alice (Going + 2 guests) → No
Result:
├─ 3 spots freed
├─ Capacity: 47/50
├─ Bob (waitlist #1) notified for 3 spots
├─ Bob has until June 15 at 6:00 PM to claim
├─ Host notified: "Alice cancelled, 3 spots available"
```

**Maybe → Going (Claims Spot):**
```
Alice status: Maybe
Capacity: 48/50 (2 spots available)

Alice changes: Maybe → Going + 1 guest
Result:
├─ 2 spots claimed
├─ Capacity: 50/50 (FULL)
├─ Alice moves to confirmed attendee list
├─ Host notified: "Alice confirmed attendance"
```

**Going → Going (Change Guest Count):**
```
Alice status: Going + 2 guests (3 spots)
Alice updates: Going + 0 guests (1 spot)

Result:
├─ 2 spots freed
├─ Capacity: 48/50
├─ Waitlist #1 notified for 2 spots
```

---

### Host Notifications

**Host receives notifications for:**
- Large changes (someone bringing 5+ guests cancels)
- Changes within 24 hours of event
- Capacity changes (event becomes full/unfull)

**Host can configure:**
- Digest mode: Daily summary of changes
- Real-time mode: Every change notified
- Critical only: Only within 48 hours of event

---

## Complete User Flow Examples

### Example 1: Standard RSVP Flow (No Waitlist)

```
1. Emma creates "Board Game Night"
   - Capacity: 20 people
   - Guest policy: +1 allowed
   - RSVP cutoff: 3 days before

2. Emma invites 15 friends via shareable link

3. Sarah clicks link:
   - Accepts invitation (can now view event)
   - Sees capacity: 0/20 confirmed
   - RSVPs: "Going + 1 guest"
   - Capacity: 2/20 confirmed

4. Over next week, 18 more spots filled:
   - Capacity: 20/20 confirmed (FULL)

5. Bob (invited) tries to RSVP:
   - Sees: "Event is full. Join waitlist?"
   - Joins waitlist (#1)

6. Alice changes "Going" → "No":
   - 1 spot freed
   - Bob notified: "Spot available!"
   - Bob claims within 24 hours
   - Capacity: 20/20 confirmed again
```

---

### Example 2: Waitlist Progression

```
1. Event capacity: 10 people
2. Status: 10/10 confirmed, 5 on waitlist

Waitlist:
├─ #1: Bob
├─ #2: Carol
├─ #3: David
├─ #4: Eve
└─ #5: Frank

3. Sarah (Going + 2 guests) → No:
   - 3 spots freed: 7/10 confirmed

4. Bob notified for 3 spots:
   - Bob claims 1 spot (Just me): 8/10
   - 2 spots remain available

5. Carol notified immediately for 2 spots:
   - Carol claims 2 spots (Me + 1): 10/10
   - Event full again

New waitlist:
├─ #1: David
├─ #2: Eve
└─ #3: Frank
```

---

### Example 3: Viral Invitations

```
1. Emma creates "Networking Happy Hour"
   - Capacity: 50 people
   - Visibility: Private
   - Viral invitations: Enabled (1 level)

2. Emma invites 5 colleagues directly

3. Sarah (Emma's invite) accepts & RSVPs:
   - Gets invitation permission
   - Generates her own shareable link
   - Shares with 10 coworkers

4. Bob (Sarah's invite) accepts & RSVPs:
   - Tries to invite others
   - Sees: "You cannot invite others (depth limit)"

5. Result:
   - Emma's network: 5 people
   - Sarah's network: 10 people
   - Total: 15 people can attend
   - Viral spread stopped at level 1

6. Host dashboard shows:
   Emma
   ├─ Sarah (invited 10 people)
   │   ├─ Bob
   │   ├─ Carol
   │   └─ ...8 others
   ├─ Alice (invited 0 people)
   └─ ...3 others
```

---

## Database Requirements

### Core Tables

**event_invitations**
- Tracks who was invited and via what method
- Links to invitation tokens
- Records acceptance timestamp
- Does NOT track RSVP status

**event_attendees**
- Tracks RSVP status (Going, Maybe, No, Waitlist)
- Tracks guest count (+N)
- Links to invitation that brought them
- Records RSVP timestamp
- Records waitlist position

**waitlist_notifications**
- Tracks spot opening notifications
- Records notification sent time
- Records claim deadline
- Tracks claim status (pending, claimed, expired)

**invitation_permissions**
- Tracks who can invite (viral invitations)
- Records invitation chains (who invited whom)
- Enables revocation of invitation branches

---

## Host Dashboard Features

### Overview

```
Emma's Birthday Party
June 15, 2025 at 2:00 PM

Capacity: 48/50 confirmed
├─ Going: 48 people (38 individual + 10 guests)
├─ Maybe: 12 people
├─ No: 5 people
└─ Waitlist: 8 people

RSVP Cutoff: June 8, 2025 (6 days away)

Recent Activity:
- 2 hours ago: Alice RSVP'd "Going + 2"
- 5 hours ago: Bob joined waitlist
- Yesterday: Carol changed to "No"

[View Full Attendee List] [Manage Settings] [Send Update]
```

---

### Attendee Management

**Actions available:**
- View full attendee list with RSVP status
- Filter by: Going, Maybe, No, Waitlist
- See guest counts per person
- View invitation source (who invited whom)
- Export to CSV for venue/catering
- Send message to specific groups (Going only, Waitlist, etc.)
- Remove individual attendees
- Move someone from waitlist to confirmed

---

### Settings Management

**Can change mid-event:**
- ✅ Increase capacity (auto-promotes waitlist)
- ✅ Decrease capacity (only if not full)
- ✅ Change guest policy (+N value)
- ✅ Change RSVP cutoff date
- ✅ Toggle viral invitations on/off
- ✅ Change waitlist claim window
- ❌ Cannot change visibility after people invited

---

## Edge Cases & Considerations

### 1. Capacity Increase

**Scenario:** Event capacity increased from 50 → 75

**Behavior:**
- If waitlist exists: Auto-notify first 25 people on waitlist
- They can claim new spots (24-hour window each)
- If some don't claim, move to next in line
- If no waitlist: New spots simply available for regular RSVPs

---

### 2. Capacity Decrease

**Scenario:** Host tries to decrease capacity from 50 → 40

**Behavior:**
- If 48 people confirmed: Block decrease, show error
- If 35 people confirmed: Allow decrease to 40
- Already-confirmed attendees never bumped

**Rationale:** Cannot remove confirmed attendees by lowering capacity

---

### 3. Guest Policy Change

**Scenario:** Event created with "+2 guests", host changes to "No guests"

**Behavior:**
- Warning: "5 people have already RSVP'd with guests"
- Options:
  - Cancel: Don't change policy
  - Force: Existing +guests kept, new RSVPs cannot add guests
  - Reset: Contact affected attendees to update RSVP

**Recommendation:** Allow policy changes but grandfather existing RSVPs

---

### 4. Multiple Invitations

**Scenario:** Alice invited via Emma's link AND Sarah's link

**Behavior:**
- First invitation wins
- Second invitation shows: "You're already invited"
- Tracks only first invitation source

---

### 5. RSVP After Leaving Waitlist

**Scenario:** Bob on waitlist, removes himself, spot opens later

**Behavior:**
- Bob not notified (he opted out of waitlist)
- If Bob tries to RSVP again before cutoff:
  - If spots available: Can RSVP "Going"
  - If still full: Can rejoin waitlist at end

---

### 6. Event Cancelled

**Scenario:** Host cancels event with 50 confirmed attendees

**Behavior:**
- All attendees notified immediately
- RSVPs frozen (cannot change)
- Event marked as "Cancelled"
- Attendee list preserved for reference

---

### 7. Event Rescheduled

**Scenario:** Host changes date from June 15 → June 22

**Behavior:**
- All attendees notified of new date
- RSVPs remain but attendees can update
- New RSVP cutoff calculated based on new date
- Waitlist positions preserved

---

## Future Enhancements (Not in V1)

### Ticketing Integration

- Paid tickets + free invitations
- Layered access: Invitation → See event → Buy ticket
- VIP tickets vs General admission

### Check-in System

- QR codes for entry
- Host app to scan tickets
- Attendance tracking (who actually showed up)

### RSVP Analytics

- Track "flaky" users (frequently cancel)
- No-show rate per event
- Conversion rate (invited → RSVP'd)

### Advanced Waitlist

- Priority waitlist (VIPs jump the line)
- Paid waitlist ($5 to join, refunded if spot claimed)
- Waitlist expiration (auto-remove after X days)

### Guest Name Collection

- Require names for all +guests
- Security/venue requirements
- Dietary restrictions per guest

### Approval Workflow

- Host must approve each RSVP (not automatic)
- Questionnaire before approval
- Conditional approval (if meets criteria)

---

## Success Metrics

### User Experience
- [ ] Clear separation between invitation and RSVP
- [ ] Intuitive waitlist join/claim flow
- [ ] Host can manage capacity effectively
- [ ] Attendees understand their status

### System Performance
- [ ] Waitlist notifications sent within 60 seconds
- [ ] RSVP changes reflected immediately
- [ ] Capacity tracking accurate in real-time
- [ ] No race conditions (double-booking spots)

### Edge Cases Handled
- [ ] Capacity increases/decreases gracefully
- [ ] Guest policy changes don't break existing RSVPs
- [ ] Viral invitation depth enforced
- [ ] RSVP cutoff enforced correctly
- [ ] Waitlist progression works with claim windows

---

## References

- **Visibility System:** `visibility-model-v2-private-events.md`
- **Invitations for Private Events:** See "Invitation Mechanisms" section in visibility doc
- **Permissions:** `event-visibility-and-permissions.md`
- **Implementation Plan:** To be created

---

**Status:** 📋 Ready for Review
**Next Steps:** Review design, gather feedback, create implementation plan
