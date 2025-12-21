# OpenMeet Roadmap: January - June 2026

**Status:** Living Document
**Last Updated:** 2025-12-21

---

## What is OpenMeet?

OpenMeet is a **free, open-source event platform** for community organizers. Think of it as Meetup without the fees—completely free for groups of any size.

**Key differences from Meetup:**
- **Free forever** for community groups (no $200/year organizer fees)
- **Open source** — run your own instance or use ours at [platform.openmeet.net](https://platform.openmeet.net)
- **AT Protocol integration** — sign in with your Bluesky account, events sync to your data store

**Live today:**
- [platform.openmeet.net](https://platform.openmeet.net) — Main event platform
- [survey.openmeet.net](https://survey.openmeet.net) — Standalone polling/survey tool with AT Protocol integration

---

## Who Uses OpenMeet?

See https://platform.openmeet.net/groups for a live list of groups, summarized below.

| Use Case | Example |
|----------|---------|
| **Local interest groups** | Book clubs, running groups, photography meetups |
| **Tech communities** | Developer meetups, open source project gatherings |
| **Private communities** | Invite-only groups, member organizations |
| **AT Protocol enthusiasts** | Groups that want events on the decentralized social web |
| **Meetup refugees** | Organizers tired of paying $200+/year for basic features |

**Common pain points we solve:**
- Meetup's organizer fees are too expensive for small groups
- Need private events that aren't publicly listed
- I don't want to marketed at or have my data sold
- Want to own your data, not be locked into a platform

---

## H1 2026 Priorities

1. **Private Groups & Events + Invitations** — Core need for community organizers
2. **Meetup Feature Parity** — Waitlists, RSVP deadlines, capacity management, guest +1
3. **Survey Bot Completion** — Finish AI-powered survey creation on AT Protocol
4. **Sponsorship System** — Let the community fund hosting costs ($350/month)
5. **Quality & Polish** — Bug fixes, accessibility, notification controls

---

## What OpenMeet Does Today

OpenMeet is functional and being used by real groups as a Meetup replacement, though still maturing.

### Events
- Create one-time or recurring events with date, time, location, description
- RSVP management with confirmed/waitlist status
- Capacity limits with automatic waitlisting
- Public events (discoverable) or unlisted (link-only access)
- Quick RSVP — guests can RSVP with just email, no account required
- Calendar invites sent automatically on RSVP
- Event images and rich text descriptions

### Groups
- Create communities around shared interests
- Group membership management
- Group-owned events
- Public or unlisted visibility
- Group chat via Matrix integration

### Communication
- **Matrix chat** — Real-time chat rooms for groups and events (auto-created)
- **Direct messages** — Attendees can message event/group organizers
- **Email outreach** — Organizers can email members and attendees
- **Notifications** — Email notifications for RSVPs, event updates, messages

### Authentication
- Email/password registration
- Passwordless login (6-digit codes)
- OAuth: Google, GitHub, Bluesky (AT Protocol)
- Quick RSVP accounts that can upgrade later

### AT Protocol Integration
- Sign in with your Bluesky account
- Your events and RSVPs sync to your Personal Data Server (PDS)
- Activity visible on the decentralized social web
- Own your data — export anytime

### Survey Service (survey.openmeet.net)
- Standalone polling/survey tool
- Web UI for creating surveys and voting
- AT Protocol OAuth login
- AI-powered survey generation (describe what you want, get a survey)
- Survey data stored on user's PDS

---

## Q1 2026 (January - March)

### Month 1: January - Bugs + Survey Bot

**Theme:** Fix critical bugs, complete Survey bot integration

#### Critical Bug Fixes
| Issue | Repo | Description |
|-------|------|-------------|
| [#421](https://github.com/OpenMeet-Team/openmeet-api/issues/421) | API | Series occurrence wrong date offset |
| [#422](https://github.com/OpenMeet-Team/openmeet-api/issues/422) | API | Event image not reflecting on display |
| [#317](https://github.com/OpenMeet-Team/openmeet-platform/issues/317) | Platform | Event image not reflecting (FE) |
| [#424](https://github.com/OpenMeet-Team/openmeet-api/issues/424) | API | ATProto handle not updated after change |
| [#119](https://github.com/OpenMeet-Team/openmeet-platform/issues/119) | Platform | Deleting series doesn't delete events |

#### Survey Bot (Phase 3)

> **Survey Service**: Go-based standalone survey/polling app at survey.openmeet.net. Phase 2 complete (web UI, ATProto OAuth, PDS writes, Jetstream consumer). Phase 3 adds bot integration: `@survey.openmeet.net` account for Bluesky, database job queue for async processing, natural language detection to convert mentions into surveys via GPT-4o-mini, and conversation state for multi-step creation flow.

| Task                                                                   | Status |
| ---------------------------------------------------------------------- | ------ |
| Database migrations (bot_jobs, bot_conversations, ai_generation_usage) | Ready  |
| Bot account setup (`@survey.openmeet.net`)                             | Ready  |
| Consumer extension - detect bot mentions in Jetstream                  | Ready  |
| Bot worker (`cmd/bot-worker`)                                          | Ready  |
| AT Protocol client with app password auth                              | Ready  |
| NL detection for natural language vs strict format                     | Ready  |
| Reply posting - survey preview, handle "create"                        | Ready  |
| Cost tracking migration to database                                    | Ready  |
| "My Surveys" view                                                      | Ready  |

### Month 2: February - Private Groups/Events

**Theme:** Enable private community management with invitations

#### Private Groups & Events - Phase 1 (MVP)

> **Invitation System**: Three-phase approach—Phase 1 (MVP): Direct invite existing users by username. Phase 2: Email invitations with personal codes for non-users. Phase 3: Viral invitations with accountability chains (each invitee gets personal sub-link, full tree visible to host). Key decision: viral invites replace generic shareable links for better security and traceability.

| Task                                                    | Description                                |
| ------------------------------------------------------- | ------------------------------------------ |
| Direct invite existing OpenMeet users to private events | Users can invite members by username/email |
| Direct invite existing OpenMeet users to private groups | Same for group membership                  |
| Invitation acceptance flow                              | Recipients see and respond to invitations  |
| Revocation control for hosts                            | Organizers can revoke pending invitations  |

#### Private Groups & Events - Phase 2 (Email Invites)
| Task                                  | Description                               |
| ------------------------------------- | ----------------------------------------- |
| Email invitations with personal codes | Invite non-users via email                |
| Account creation on acceptance        | New user created when invitation accepted |

### Month 3: March - Meetup Feature Parity (Waitlists)

**Theme:** Make waitlists actually work - critical for Meetup refugees

#### RSVP Phase 1: Waitlist Promotion

> **RSVP Features for Meetup Refugees**: Make waitlists actually work. Current gaps: waitlist promotion (users stuck on waitlist forever), RSVP deadlines, guest +1 support. Solution: Add `OfferedSpot` status with 24-hour acceptance window. When confirmed user cancels → oldest waitlisted user gets offer → 24hrs to accept/decline → auto-expire moves them to back of line.

| Task                                                               | Complexity |
| ------------------------------------------------------------------ | ---------- |
| Add `OfferedSpot` status to enum                                   | Low        |
| Add `offeredAt` column to eventAttendees                           | Low        |
| Offer spot on cancellation (auto-promote next waitlisted user)     | Medium     |
| Accept/decline endpoints for offered spots                         | Medium     |
| 24-hour timeout cron job (expire offers, move to back of waitlist) | Medium     |
| Waitlist position in API response                                  | Low        |
| Email notifications for spot offers                                | Low        |
| Frontend: OfferedSpot dialog with countdown timer                  | Medium     |

---

## Q2 2026 (April - June)

### Month 4: April - RSVP Deadlines

**Theme:** Complete RSVP feature parity

#### RSVP Phase 2: Deadlines

> **RSVP Deadlines**: Add `rsvpDeadline` field to events. Enforce in `attendEvent()` - reject RSVPs after deadline. Show deadline on event page with countdown.

| Task                                                          | Issue                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Add `rsvpDeadline` field to events                            | [#123](https://github.com/OpenMeet-Team/openmeet-platform/issues/123) |
| Enforce deadline in `attendEvent()`                           |                                                                       |
| UI: Date picker in event form, deadline display on event page |                                                                       |

### Month 5: May - Notifications + Account Linking

**Theme:** Polish notification system, consolidate authentication

#### Notification Improvements
| Issue | Description |
|-------|-------------|
| [#423](https://github.com/OpenMeet-Team/openmeet-api/issues/423) | Option to suppress notification emails on event edit |
| [#318](https://github.com/OpenMeet-Team/openmeet-platform/issues/318) | Toggle for notification emails (FE) |
| [#394](https://github.com/OpenMeet-Team/openmeet-api/issues/394) | Notification when attendee removed |
| [#180](https://github.com/OpenMeet-Team/openmeet-platform/issues/180) | Toggle email notifications by event type |

#### Account Linking
| Issue | Description |
|-------|-------------|
| [#348](https://github.com/OpenMeet-Team/openmeet-api/issues/348) | Single account, multiple login methods |
| [#329](https://github.com/OpenMeet-Team/openmeet-api/issues/329) | AT Protocol account merge with Quick RSVP |

### Month 6: June - Guest +1 + Polish

**Theme:** Complete RSVP features, quality improvements

#### RSVP Phase 3: Guest +1

> **Guest +1**: Allow attendees to bring guests. Add `guestCount` to EventAttendee, `maxGuestsPerAttendee` to Event. Capacity check becomes: confirmed + total guests >= maxCapacity.

| Task                                                     | Issue                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Add `guestCount` to EventAttendee                        | [#124](https://github.com/OpenMeet-Team/openmeet-platform/issues/124) |
| Add `maxGuestsPerAttendee` to Event                      |                                                                       |
| Update capacity calculations (confirmed + guests >= max) |                                                                       |
| Frontend: +1 selector in RSVP dialog                     |                                                                       |

#### Quality & Polish
| Issue | Description |
|-------|-------------|
| [#420](https://github.com/OpenMeet-Team/openmeet-api/issues/420) | Rate limiting documentation |
| [#419](https://github.com/OpenMeet-Team/openmeet-api/issues/419) | OpenAPI descriptions for group endpoints |
| [#389](https://github.com/OpenMeet-Team/openmeet-api/issues/389) | Replace hardcoded platform URLs |
| [#316](https://github.com/OpenMeet-Team/openmeet-platform/issues/316) | Accessibility improvements |
| [#182](https://github.com/OpenMeet-Team/openmeet-platform/issues/182) | Change Group Slug |
| [#151](https://github.com/OpenMeet-Team/openmeet-platform/issues/151) | Group member list sorting |

---

## Later / Backlog

| Feature | Reference | Notes |
|---------|-----------|-------|
| Venue feature | [API #200](https://github.com/OpenMeet-Team/openmeet-api/issues/200), [Platform #37](https://github.com/OpenMeet-Team/openmeet-platform/issues/37) | Nice-to-have |
| Full text search | [#159](https://github.com/OpenMeet-Team/openmeet-api/issues/159) | Important at scale |
| Sponsorship Phase 1 (Sponsor wall, badges) | — | After more users; supporter wall, badges, progress meter |
| Matrix integration UX | [#249](https://github.com/OpenMeet-Team/openmeet-platform/issues/249) | Deferred |
| E2E test suite | [#20](https://github.com/OpenMeet-Team/openmeet-platform/issues/20) | Ongoing |
| ATProto group integration | — | Complex; threshold signing for group keys on AT Protocol |
| No-show tracking | — | Nice-to-have; track RSVPs who don't attend |
| OpenMeet + Survey integration | — | After bot complete; embed surveys in events |

---

## Sustainability Goal

**Target: $500/month in community funding** to cover hosting and infrastructure costs.

Current hosting costs ~$350/month (AWS, databases, etc.). Reaching $500/month ensures OpenMeet stays free for community groups indefinitely.

**How to help:**
- [Support OpenMeet](https://platform.openmeet.net/support) — one-time or recurring contributions
- **Sponsor a feature** — want something prioritized? Let's talk. Reach out on [Discord](https://discord.gg/eQcYADgnrc)

### Milestone Markers
- [ ] January: Survey bot live, critical bugs fixed
- [ ] February: Private group/event invitations working
- [ ] March: Waitlist promotion functional
- [ ] April: RSVP deadlines complete
- [ ] May: Notification controls, account linking
- [ ] June: Guest +1, polish complete

---

## How to Contribute

OpenMeet is open source and welcomes contributions!

### For Developers

| Repository | Description | Stack |
|------------|-------------|-------|
| [openmeet-api](https://github.com/OpenMeet-Team/openmeet-api) | Backend API | NestJS, TypeScript, PostgreSQL |
| [openmeet-platform](https://github.com/OpenMeet-Team/openmeet-platform) | Frontend web app | Vue 3, Quasar, TypeScript |
| [survey](https://github.com/OpenMeet-Team/survey) | Survey/polling service | Go, Templ, HTMX |

**Good first issues:** Look for `good first issue` labels in each repo.

**Getting started:**
1. Fork the repo you want to contribute to
2. Check the README for local development setup
3. Pick an issue or propose a feature
4. Submit a PR — we review within a few days

### For Users

- **Report bugs:** Open an issue on GitHub
- **Request features:** Open an issue describing your use case
- **Spread the word:** Tell other community organizers about OpenMeet
- **Support us:** Help cover hosting costs at [platform.openmeet.net/support](https://platform.openmeet.net/support)

### Community

- **Bluesky:** Follow [@openmeet.net](https://bsky.app/profile/openmeet.net) for updates
- **Discord:** Join us at [discord.gg/eQcYADgnrc](https://discord.gg/eQcYADgnrc)

---

*Last updated: 2025-12-21*
