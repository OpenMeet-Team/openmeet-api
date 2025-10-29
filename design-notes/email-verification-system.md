# Email Verification System - Design Note

**Status:** Draft
**Last Updated:** 2025-10-29
**Implementation Timeline:** 2-3 days end-to-end

## Overview

We're implementing mandatory email verification for all OpenMeet users to ensure:
- Users have access to their email accounts (important for password resets, notifications)
- Email addresses are valid and not typos
- We can reliably communicate with users about events and important updates
- Reduced spam and fake accounts

**Key Principle:** All users must verify their email address before they can fully use the platform, with exceptions for OAuth providers that already verify emails (Google, GitHub).

---

## The Solution: 6-Digit Verification Codes

We're using the existing 6-digit code system (same as passwordless login):
- **Mobile-friendly:** Copy-paste code, stay in the app
- **Short expiration:** 15 minutes (vs 24 hours for old JWT links)
- **One-time use:** Can't be reused if intercepted
- **Simple:** Just type 6 numbers
- **Already built:** Working for passwordless login
- **Rate-limited:** Prevents abuse

---

## User Flows

### Flow 1: New User Registration

**Sarah wants to create an account:**

1. Sarah fills out registration form: email, password, name
2. She clicks "Create Account"
3. System creates her account as **INACTIVE** (cannot log in yet)
4. Verification code sent to her email: "Your code is 482753"
5. Sarah sees: "Check your email for a verification code"
6. She enters the code → account becomes **ACTIVE** → she's logged in

**If she doesn't verify:**
- She cannot log in (login says "Please verify your email first")
- She can request a new code anytime
- Account stays INACTIVE until she verifies

---

### Flow 2: Quick RSVP to Event

**John sees an event, wants to RSVP quickly:**

1. John enters name + email, clicks "Yes, I'm going"
2. System creates account as **INACTIVE** + records his RSVP
3. **Calendar invite sent immediately** (even though unverified)
4. Verification code sent: "Verify your email to manage your RSVP"
5. John sees: "Check your email to confirm"

**If John verifies:**
- He enters the code
- Account becomes **ACTIVE** and he's logged in
- He can now view/manage his RSVP and see event details

**If John tries to RSVP to another event (before verifying):**
- **First RSVP:** Allowed (creates account, sends code)
- **Second RSVP attempt:** Blocked - "Please verify your email to continue RSVPing"
- We allow a small number of RSVPs (1-2) before requiring verification

**If John never verifies:**
- ✅ He already got the calendar invite (has event info)
- ✅ His RSVP shows in organizer's attendee list
- ✅ Organizer can email him
- ❌ He cannot log in to manage his RSVP
- ❌ He won't receive other system emails (notifications, updates) until verified
- Follow-up: We'll send a reminder to verify a few days later

---

### Flow 3: Social Login (Google/GitHub)

**Maria clicks "Sign in with Google":**

1. OAuth flow happens
2. Google returns her profile + **verified email**
3. System creates account as **ACTIVE** (no verification needed - Google already verified)
4. Maria is logged in immediately

**Why skip verification?**
- OAuth providers (Google, GitHub) already verify emails
- No point in us verifying again
- Better user experience

**Bluesky OAuth:**
- Currently asks for email in a separate step after OAuth
- If we can get email directly from Bluesky OAuth (see separate issue), treat it as verified

---

### Flow 4: Changing Email Address

**Sarah wants to change from sarah@oldcompany.com → sarah@newcompany.com:**

1. Sarah goes to Account Settings, updates email
2. System sends verification code to **NEW email** (sarah@newcompany.com)
3. System sends notification to **OLD email**: "Your email is being changed"
4. Sarah checks **new email**, enters code
5. Email is updated in database
6. Confirmation sent to both addresses

**Important:**
- Old email stays active until new email is verified
- Old email can cancel the change ("I didn't request this")
- New verification code expires after 15 minutes
- Rate limit: Can't change email more than 3 times per day

---

### Flow 5: Login with Unverified Account

**John RSVPd but never verified, now tries to log in days later:**

1. John goes to login page, enters email + password
2. System checks: Account exists but INACTIVE
3. Shows: "Please verify your email first"
4. Sends new verification code to his email
5. John enters code → account becomes ACTIVE → logged in

---

### Flow 6: Wrong Email Address (Typo)

**John meant john@gmail.com but typed john@gmai.com:**

1. Quick RSVP with typo email
2. Verification screen shows: "Code sent to john@gmai.com" (clearly displayed)
3. John doesn't receive the code
4. He clicks "Resend code"
5. Message shows:
   - "Check your spam folder"
   - "Verify the email address is correct: john@gmai.com"
6. John realizes the typo

**What happens?**
- He needs to RSVP again with correct email
- Support could potentially help update the email on the account
- But primary flow: re-RSVP with correct address

---

## Edge Cases

### Unverified User Tries to RSVP Multiple Times

**Behavior:**
- 1st RSVP: Account created, code sent, calendar invite sent
- 2nd RSVP (same email): "Please verify your email to continue RSVPing"
- We allow 1-2 unverified RSVPs, then require verification

**Why limit?**
- Prevents spam
- Encourages verification
- Legitimate users rarely RSVP to many events immediately

---

### Organizer Views Unverified Attendee

**What organizer sees:**
- Name: "John Smith"
- Email: john@example.com
- Status: "Confirmed ⚠️ Email not verified"
- Badge/indicator showing unverified status

**Organizer capabilities:**
- Can see the RSVP and count in attendance
- Can send emails to unverified attendees
- Useful for following up: "Hey John, please verify your email"

---

### System Emails to Unverified Users

**What gets sent:**
- ✅ Calendar invite (for their RSVP)
- ✅ Verification code emails
- ✅ Direct messages from organizers
- ❌ System notifications (event updates, reminders, etc.) - blocked until verified
- ✅ Follow-up reminder after a few days: "Complete your registration by verifying your email"

---

### Code Expires

**What happens:**
- Code expires after 15 minutes
- User enters code → "Invalid or expired code"
- "Resend code" button gets a new one
- Rate limited: Max 3 codes per 15 minutes

---

### Brute Force Attempts

**Protections:**
- Max 5 wrong code attempts per 15 minutes
- After 5 failures: "Too many attempts. Request a new code."
- IP-based rate limiting: Max 20 attempts per hour
- Monitoring alerts for suspicious patterns

---

### Email Service Down

**Fallback:**
- Show: "Having trouble sending email. Try again shortly."
- User can retry
- Monitoring alerts triggered
- Last resort: Contact support for manual verification

---

## Technical Details

### Storage

**Redis (temporary):**
- Key: `verify:{code}`
- Value: `{userId, email, tenantId, createdAt}`
- TTL: 900 seconds (15 minutes)

**PostgreSQL:**
- Add `emailVerifiedAt` timestamp column (nullable)
- Tracks when email was last verified

**Rate Limiting:**
- Track: codes sent per email, per IP
- Limits: 3 per 15min per email, 10 per hour per IP

---

### Migration: Existing Users

**All existing users are assumed verified:**
- Set all existing users to ACTIVE status
- Set `emailVerifiedAt` to their creation date
- No action required from existing users

**Why?**
- Backward compatibility
- Don't disrupt existing experience

---

## Success Metrics

**Track:**
- Verification completion rate (target: >80%)
- Time to verification (target: <5 minutes median)
- Email delivery success rate (target: >95%)
- Drop-off points in flow
- Support tickets about verification

**Alert if:**
- Verification rate drops below 60%
- Email delivery failures spike
- Unusual error patterns

---

## Open Questions

1. **Exact limit for unverified RSVPs?**
   - Current thinking: 1-2 RSVPs allowed
   - Then require verification
   - Configurable per tenant?

2. **When to send verification reminder?**
   - 3 days after registration?
   - 7 days?
   - Only if they have RSVPs?

3. **Should we auto-delete accounts never verified?**
   - Keep forever?
   - Delete after 90 days?
   - Recommendation: Keep forever, mark as dormant

4. **Support process for email typos?**
   - Can support update email on unverified account?
   - What verification needed?
   - Document this process

---

## Related Documentation

- [Quick RSVP Passwordless Flow](./quick-rsvp-passwordless-flow.md)
- [Bluesky Email Retrieval Issue](../docs/bluesky-email-retrieval-issue.md)

---

## Approval & Sign-off

- [ ] Product Owner reviewed
- [ ] Engineering team reviewed
- [ ] Security team reviewed
- [ ] Ready to implement
