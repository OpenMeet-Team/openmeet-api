# Visibility Model

**Last Updated:** 2025-01-23

---

## Overview

This document describes how visibility works for Groups, Events, and Activity Feeds in OpenMeet. It covers what's currently implemented and what's planned for future releases.

---

# Part 1: Current State

## The Three Visibility Levels

### Public
- **Discoverable:** Yes - appears in search results, browse pages, sitemaps, Google
- **Who can view:** Anyone, no login required
- **Activity feed:** Visible in sitewide feed
- **Use case:** Community events, public meetups, open groups

### Unlisted
- **Discoverable:** No - hidden from all search, browse, and listing pages
- **Who can view:** Anyone who has the direct URL (no login required)
- **Activity feed:** Not visible in sitewide feed
- **Use case:** Events shared via link in WhatsApp, Discord, email - not advertised publicly

**Important:** Being logged in does NOT let you discover unlisted content. You must already have the URL. Once you have the URL and join/RSVP, it appears in your personal dashboard ("My Events", "My Groups").

### Private
- **Discoverable:** No
- **Who can view:** Must be logged in AND be a member/attendee or have an invitation
- **Activity feed:** Only visible to members (anonymized version shown in sitewide feed for social proof)
- **Use case:** Confidential meetings, support groups, private parties

---

## MVP Status: Private is Disabled

Private visibility is currently grayed out in the UI with a "Coming Soon" message.

**Why:** Private groups and events need an invitation system to be useful. Without a way to invite people, there's no way to add members to a private group or attendees to a private event.

**What's available now:**
- Public - fully working
- Unlisted - fully working
- Private - disabled in UI, backend still supports existing private entities

**Unlisted covers most "private" use cases:**
- Birthday parties (share link in family chat)
- Game nights (share with friends)
- Study groups (share in class Discord)
- Anyone with the link can see details and join

**True private is needed for:** Medical support groups, political organizing, business confidential - these users can wait for the invitation system.

---

## How Access Control Works

### For Events

**Public or Unlisted Event:**
- Anyone with the URL can view full details
- No login required

**Private Event:**
- Must be logged in
- Must be EITHER:
  - An attendee of the event, OR
  - A member of the event's parent group (if the event belongs to a group)
- Otherwise: "Access denied" error

### For Groups

**Public or Unlisted Group:**
- Anyone with the URL can view full details
- No login required

**Private Group:**
- Must be logged in
- Must be a member
- Otherwise: "Access denied" error

---

## Group-Event Relationships

### OPEN QUESTION: Should Group Membership Auto-Grant Event Access?

**The problem:** A private group might want some events visible to all members, but other events restricted to a subset (e.g., leadership meetings).

**Example scenario:**
- "Book Club" (private group, 50 members)
- "Monthly Discussion" → all 50 members should see
- "Officer Planning" → only 5 officers should see

**Options under consideration:**

1. **Group membership = all events:** Simple but inflexible. Can't have subset meetings.

2. **Private events always need invites:** Even within private groups, private events require explicit invitation. More control but more friction for common case.

3. **Two event types:** "Group events" (all members see) vs "Invite-only events" (explicit invitations). More complexity.

**Current implementation:** TBD - needs more discussion.

### Member Removal Cascades

When someone is removed from a private group:
- They immediately lose access to the group
- They lose access to group events (details TBD based on above decision)
- Events they created remain but are moved to standalone (no longer in the group)

---

## Design Decisions

### No "Request to Join" for Private Groups

Private groups are invitation-only by design. There is no "Request to Join" button.

**Why:** A request mechanism would require showing some group details to non-members (name, description) which violates the zero-disclosure policy for truly private groups.

**How users join private groups:**
1. Receive an invitation link from an admin
2. Get directly invited by an admin (search by name)
3. Receive an email invitation

---

## Search and Discovery Rules

### What Anonymous Users See

| Visibility | In Search Results | In Browse Pages | In Sitemaps |
|-----------|-------------------|-----------------|-------------|
| Public | Yes | Yes | Yes |
| Unlisted | No | No | No |
| Private | No | No | No |

### What Logged-In Users See

| Visibility | In Search Results | In Browse Pages | In "My Events/Groups" |
|-----------|-------------------|-----------------|----------------------|
| Public | Yes | Yes | Yes (if joined) |
| Unlisted | No | No | Yes (if joined via URL) |
| Private | No | No | Yes (if member/attendee) |

**Key Point:** Logging in does NOT make unlisted or private content discoverable. You can only find your own unlisted/private content that you've already joined.

---

## Activity Feed Privacy

### Sitewide Feed (Homepage)
- Shows ONLY activities from public groups and events
- Unlisted and private activities never appear in sitewide feed
- Same for guests and logged-in users

### Group/Event Feed
The activity feed for a group or event follows the same access rules as the group/event itself:

| Visibility | Who can see the activity feed |
|------------|-------------------------------|
| Public | Anyone |
| Unlisted | Anyone with the URL |
| Private | Members/attendees only |

---

## Error Messages

| Situation | What User Sees |
|-----------|----------------|
| Event/group doesn't exist | "Not found" |
| Private, not logged in | "This is private. Please log in." |
| Private, logged in but not a member | "You must be a member to view this." |
| Unlisted, user has URL | Full details shown |
| Public | Full details shown |

---

# Part 2: Proposed Changes (Not Yet Implemented)

The following features are planned to enable **private visibility**:

* determine the right kind of invitations to implement
* implement invitations
* reopen private visibility groups and events for general use

---

## Summary: What Works Now vs What's Coming

| Feature | Now | Coming |
|---------|-----|--------|
| Public visibility | Yes | - |
| Unlisted visibility | Yes | - |
| Private visibility | Backend only, UI disabled | Re-enable with invitations |
| Direct user invitations | No | Phase 1 |
| Email invitations | No | Phase 2 |
| Shareable invite links | No | Phase 3 |

---

## Related Documents

- **Invitation System Design:** shareable-invitation-links-spec.md
- **Activity Feed Details:** activity-feed-system.md
