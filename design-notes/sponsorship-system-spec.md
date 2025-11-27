# OpenMeet Sponsorship System Specification

## Purpose

This document describes how people can financially support OpenMeet and how we recognize those supporters. It covers the user experience, business rules, and phased rollout plan.

---

## Overview

OpenMeet is free for communities to use. To help cover operating costs and fund development, we allow people to make voluntary financial contributions. We call these people "Sponsors" and their contributions "Sponsorships."

**Important:** OpenMeet is an LLC, not a nonprofit. Contributions are not tax-deductible. This must be clearly stated on all sponsorship pages.

---

## Phased Rollout

We're building sponsorship incrementally to validate demand before investing in complex infrastructure.

| Phase | Summary | Validates |
|-------|---------|-----------|
| 0 | Stripe Payment Link | Will anyone pay at all? |
| 1 | Custom UI + Sponsor Wall | Does recognition matter? |
| 2 | Recurring Contributions | Will people commit monthly? |
| 3 | Site-Wide Badge Display | Is badge visibility valuable? |

Each phase ships independently. We proceed to the next phase based on results.

---

## Phase 0: Payment Link

### Goal

Validate demand with zero custom code. If nobody contributes through a simple link, we save weeks of development.

### User Experience

1. User sees "Support OpenMeet" link in website footer
2. Click opens Stripe-hosted payment page
3. User selects amount ($10 / $25 / $50 or custom)
4. User enters email and payment details
5. Stripe processes payment and shows confirmation
6. User receives email receipt from Stripe

### What We Configure in Stripe

- Product name: "Support OpenMeet"
- Description: "Help keep OpenMeet free for communities. Not tax-deductible."
- Preset amounts: $10, $25 (default), $50
- Custom amount: enabled, minimum $5
- Collect: email (required), name (optional)
- Success URL: redirect to openmeet.net with thank-you message

### What We Don't Have

- No badges
- No sponsor wall
- No progress meter
- No account linking
- No contribution history

### Success Criteria

Run for 2-4 weeks. Proceed to Phase 1 if we receive meaningful contributions (suggested threshold: 5+ contributions or $100+).

### Operational Notes

- Track contributions in Stripe Dashboard
- Manually maintain a simple sponsor list if desired (spreadsheet)
- Can manually thank contributors via email

---

## Phase 1: Basic Integration

### Goal

Accept payments through a custom UI, recognize sponsors publicly, and build the foundation for future group fundraising features.

### User Experience

#### Making a Contribution

1. User clicks "Support Us" in footer → opens `/support` page
2. Page explains what sponsorship funds and shows progress
3. User selects amount ($10 / $25 / $50 or custom)
4. User checks consent for public display (or selects anonymous)
5. User optionally adds a message
6. User clicks "Continue to Payment" → redirects to Stripe Checkout
7. After payment, returns to `/support/thank-you` showing badge earned

#### Viewing Sponsors

1. User clicks "Our Supporters" in footer → opens `/supporters` page
2. Page shows all non-anonymous sponsors grouped by badge level
3. Page shows progress toward monthly goal

#### Profile Badge

1. Sponsors see their badge on their own profile page
2. Other users see the badge when viewing a sponsor's profile
3. Badge display is opt-in (sponsors can hide it in settings)

### Pages

| Page | Path | Purpose |
|------|------|---------|
| Support Page | `/support` | Contribution form with progress meter |
| Thank You | `/support/thank-you` | Confirmation with badge info |
| Supporters Wall | `/supporters` | Public list of sponsors |
| My Contributions | `/settings/contributions` | Personal contribution history |

### What's Included

- Custom contribution form with preset amounts
- Stripe Checkout integration (one-time payments only)
- Contribution storage in billing database
- Sponsor wall (public, grouped by badge level)
- Progress meter toward monthly goal
- Badge display on profile pages
- Opt-in badge visibility setting
- Contribution history for logged-in users

### What's NOT Included (Deferred)

- Recurring/monthly contributions → Phase 2
- Badge display on avatars site-wide → Phase 3
- Guest contributions (no account) → Future
- Active vs Past sponsor distinction → Future
- Sponsor spotlight banner → Future

### Requirements

- User must be logged in to contribute
- Contribution minimum: $5
- Contribution maximum: $10,000
- Currency: USD only

---

## Sponsor Recognition

### Badge Levels

Sponsors earn badges based on total contributions over time.

| Level | Total Contributed | Color |
|-------|-------------------|-------|
| Bronze | $25+ | Bronze/copper |
| Silver | $100+ | Silver |
| Gold | $500+ | Gold |
| Platinum | $2,000+ | Platinum/diamond |

Thresholds are designed for meaningful progression. A $25/month sponsor reaches Silver in 4 months, Gold in 20 months.

### Badge Display (Phase 1)

Badges appear in these locations only:
- Sponsor's own profile page (if display enabled)
- Supporters wall (always, unless anonymous)
- Thank-you page after contribution

Badges do NOT appear in Phase 1:
- Next to avatars in comments
- In member/attendee lists
- In event pages

### Badge Visibility

Badge display is **opt-in**. Default is hidden.

Sponsors can enable badge display in profile settings. This prevents badges from creating perceived hierarchy in the community.

### Anonymous Contributions

Sponsors can mark their contribution as anonymous:
- Contribution counts toward their badge level
- Name never appears on supporters wall
- Badge still visible on their own profile (if they enable it)
- Cannot be featured in any public recognition

---

## Monthly Progress

### Display

The support page shows progress toward the monthly operating goal:

```
Monthly Goal
━━━━━━━━━━━━━━━━━━░░░░░ 70%
$347 of $500 from 23 supporters
```

### Goal Amount Options

**Option A: Infrastructure costs only ($500)**
- Honest and achievable
- Creates "we did it!" moments
- May feel like underselling total effort

**Option B: Supporter count only (no dollar goal)**
- "23 supporters this month"
- Community-focused, less transactional
- No visible "failing to hit goal"

**Decision needed:** Which approach aligns better with community values?

### Reset

Progress resets on the 1st of each month (UTC).

---

## Support Page Content

### Header

> **Keep OpenMeet Free for Everyone**
>
> OpenMeet helps communities connect without fees, ads, or algorithms. Your support pays for servers, development, and support—keeping the platform free for thousands of organizers and members.

### Where Your Money Goes

> **$500/month keeps OpenMeet running:**
> - Cloud infrastructure (AWS, databases, CDN)
> - Third-party services (monitoring, email, backups)
> - Development tools and services

### Legal Disclaimer

> OpenMeet is an LLC. Contributions are not tax-deductible.

### Trust Signals

> Secure payment powered by Stripe. Cancel anytime.

---

## Contribution Flow Details

### Form Fields

| Field | Required | Notes |
|-------|----------|-------|
| Amount | Yes | Presets: $10, $25, $50. Custom: $5-$10,000 |
| Public display consent | Yes* | Checkbox. Required unless anonymous selected. |
| Anonymous | No | Checkbox. Overrides public display consent. |
| Message | No | Optional message, max 500 characters |

*If anonymous is not checked, public display consent is required.

### Consent Language

**Public display checkbox:**
> "Display my name on the supporters page"

**Anonymous checkbox:**
> "Keep my contribution anonymous"

### Validation

- Amount must be between 500 and 1000000 cents ($5-$10,000)
- User must be logged in
- Either anonymous must be checked OR public display consent must be checked

---

## Thank You Page

After successful payment, show:

1. **Confirmation message**
   > "Thank you for supporting OpenMeet!"

2. **Amount and badge status**
   > "Your $25 contribution brings your total to $75."
   > "You've earned the **Bronze Supporter** badge!"

3. **Next badge progress** (if applicable)
   > "$25 more to reach Silver"

4. **Actions**
   - "View all supporters" → `/supporters`
   - "Share on social media" → pre-filled tweet/post
   - "Return home" → `/`

---

## Supporters Wall

### Layout

```
Our Supporters
Thanks to everyone who helps keep OpenMeet free.

[Become a Supporter]

━━━ Platinum ━━━
Alice Johnson

━━━ Gold ━━━
Bob Smith, Carol Williams

━━━ Silver ━━━
David Brown, Eve Davis, Frank Miller, Grace Lee

━━━ Bronze ━━━
Henry Wilson, Ivy Taylor, Jack Anderson, Kate Thomas,
Liam Martinez, Mia Robinson, Noah Clark, Olivia Lewis...
```

### Filtering

Simple toggle: "This month" / "All time"

### Privacy

Only sponsors who:
1. Did NOT select anonymous
2. DID consent to public display

appear on the wall.

---

## User Settings: Contributions

Logged-in users can view their contribution history at `/settings/contributions`:

| Date | Amount | Status |
|------|--------|--------|
| Jan 15, 2025 | $25 | Completed |
| Dec 1, 2024 | $50 | Completed |

**Your total:** $75
**Your badge:** Bronze Supporter

**Badge visibility:** [ ] Show badge on my profile

---

## Refunds

### Policy

Full refunds available within 30 days upon request. After 30 days, refunds at OpenMeet's discretion.

### Process

1. User contacts support
2. Admin processes refund through Stripe Dashboard
3. Refunded amount is subtracted from user's total
4. Badge level recalculated (may downgrade)
5. User notified of any badge change

---

## Email Communications

### From Stripe (Automatic)

- Payment receipt after each contribution

### From OpenMeet (Future consideration)

- Badge earned/upgraded notification
- Monthly thank-you to supporters

For Phase 1, we rely on Stripe's receipt emails only.

---

## Legal Checklist

Before launching Phase 1:

- [ ] Terms of Service updated to cover contributions
- [ ] Privacy Policy updated for payment data handling (Stripe)
- [ ] Refund policy documented and linked from support page
- [ ] "Not tax-deductible" disclaimer on all contribution pages

---

## Future Phases

### Phase 2: Recurring Contributions

- Monthly subscription option
- Stripe Customer Portal for management
- Active vs Past supporter distinction
- Automatic badge progression

### Phase 3: Site-Wide Badge Display

- Badges on avatars throughout the site
- Requires badge sync to tenant database
- RabbitMQ event-driven updates

### Future: Group Fundraising

The UI components built for OpenMeet sponsorship (form, progress meter, supporter wall, badges) are designed to be reusable for group-level fundraising. Group fundraising will require Stripe Connect for money flow to group organizers.

---

## Design Principles

### Reusable Components

All UI components should accept the recipient as a prop, enabling future group fundraising:

- `FundraiserForm` — not `OpenMeetSponsorForm`
- `SupporterWall` — generic, filterable by recipient
- `ProgressMeter` — accepts goal and current amount
- `BadgeDisplay` — accepts level and size

### No Elitism

- Badges are opt-in, not forced
- No special features or access for sponsors
- Recognition is appreciation, not hierarchy

### Transparency

- Clear about where money goes
- Honest that contributions aren't tax-deductible
- Public progress toward real operating costs

---

## Glossary

| Term | Definition |
|------|------------|
| Sponsor/Supporter | A person who has contributed financially |
| Contribution | A payment made to support OpenMeet |
| Badge | Visual indicator of support level |
| Supporters Wall | Public page listing non-anonymous supporters |
| Stripe | Third-party payment processor |

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2025-01-25 | | Initial specification |
| 2025-01-25 | | Revised for phased rollout, OSS separation |
| 2025-01-25 | | Focused on Phase 0/1, added reusability for group fundraising |
