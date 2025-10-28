# Quick RSVP - Passwordless Onboarding Flow

**Status**: Implementation Phase - V2 Refinements
**Date**: 2025-10-27 (Updated)
**Priority**: High - Adoption feature from GitHub issue #248
**Version**: 2.0 - Based on Luma-style UX feedback

## Problem Statement

Currently, users must create a full account (with password) before they can RSVP to events. This creates friction that prevents casual users from quickly joining events. Competitors like Lu.ma have solved this with a "quick RSVP" flow that requires only name and email.

### User Pain Points
- Too many steps to RSVP (redirect → register → set password → navigate back → RSVP)
- Context loss when redirected to login page
- Decision fatigue (do I really want to create another account?)
- Abandoned RSVPs due to friction

### Business Impact
- Lower event attendance rates
- Reduced viral growth (harder for organizers to get people to join)
- Competitive disadvantage vs Lu.ma, Partiful
- Blocks Meetup.com migration (their users expect low-friction RSVP)

## Goals

### Primary Goals
1. **Reduce RSVP friction**: Allow users to RSVP with just name + email (no password)
2. **Maintain security**: Users verify email before they can manage their RSVP
3. **Enable future engagement**: Send event reminders, manage RSVP later
4. **Support multi-auth**: Allow users to later login with Google/Bluesky without duplicate accounts

### Non-Goals
- Remove password-based auth entirely (we still support it)
- Change existing user registration flow
- Implement full social account linking system (future work)

## Proposed Solution

### High-Level Flow (V2 - Luma-style)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits event page (unauthenticated)                 │
│    - Clicks "Going" button                                   │
│    - Quick RSVP dialog appears with TWO VIEWS:              │
│                                                              │
│    VIEW 1 (Default): Quick RSVP Form                        │
│      • Name field                                            │
│      • Email field                                           │
│      • RSVP button                                           │
│      • "Already have an account? Log in" link               │
│                                                              │
│    VIEW 2: Login Form (if user clicks link)                │
│      • Complete login form embedded in dialog               │
│      • Email + password OR passwordless                     │
│      • External auth buttons (Google/GitHub/Bluesky)        │
│      • "Back to Quick RSVP" link                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2a. Path A: Quick RSVP (New User)                           │
│    - User enters: "John Doe" + "john@example.com"           │
│    - Clicks "RSVP"                                           │
│    - Backend checks: Email doesn't exist                    │
│    - Backend: Creates user (password=null, status=active)   │
│    - Backend: Creates EventAttendee                         │
│    - Backend: Sends calendar invite email with .ics file    │
│    - Response: Success                                       │
│    - Dialog shows: "You're registered! Check email."        │
│    - Dialog closes, user is NOT logged in                   │
│    - "Verify Email" banner appears on event page            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2b. Path B: Quick RSVP (Existing User)                      │
│    - User enters email that exists in system                │
│    - Backend checks: Email exists                           │
│    - Response: 409 "Email exists. Please log in."           │
│    - Dialog automatically switches to LOGIN VIEW            │
│    - User completes login (any method)                      │
│    - Backend: Creates attendee, sends calendar invite       │
│    - User is LOGGED IN, dialog closes                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2c. Path C: User Chooses Login View                         │
│    - User clicks "Already have an account? Log in"          │
│    - Dialog switches to LOGIN VIEW                          │
│    - User logs in via:                                       │
│      • Email + password                                      │
│      • Passwordless (sends code to email)                   │
│      • External auth (Google/GitHub/Bluesky)                │
│    - Backend: Creates attendee, sends calendar invite       │
│    - User is LOGGED IN, dialog closes, RSVP complete        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User receives calendar invite email                      │
│    Subject: "You're registered for [Event Name]!"          │
│    Body:                                                     │
│      - Event details (date, time, location)                 │
│      - .ics file attachment OR calendar import link         │
│      - Link to event page                                    │
│    NOTE: No verification code in this email                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User sees "Verify Email" banner (Path A only)            │
│    - Flexible banner component shown on:                    │
│      • Event page                                            │
│      • Other pages as user browses                          │
│    - User clicks "Verify Email" button                      │
│    - Frontend: Calls /auth/request-email-verification       │
│    - Backend: Generates 6-digit code, sends email           │
│    - Dialog appears: "Check email for verification code"   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User verifies email and completes profile                │
│    - User opens verification email, gets 6-digit code       │
│    - Enters code in dialog                                   │
│    - Frontend: Calls /auth/verify-email-code                │
│    - Backend: Validates code, creates session, returns JWT  │
│    - User is now LOGGED IN                                   │
│    - Can edit profile, manage RSVPs, use full features      │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Principles (V2):**
- ✅ Quick RSVP creates user + attendee, user stays **not logged in**
- ✅ Calendar invite (.ics file) sent immediately, no verification code
- ✅ Verification only happens when user clicks "Verify Email" banner
- ✅ Dialog has 2 views: Quick RSVP ↔ Full Login (toggle with link)
- ✅ Login view embedded in dialog (doesn't navigate away from page)
- ✅ Existing user detection requires login before RSVP completes
- ✅ Pattern reusable for group join flow

## Technical Design

### User Account States

**Quick RSVP User (Unverified):**
```typescript
{
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  provider: "email",
  password: null,           // ← Key indicator: no password set
  status: "active",         // ← Active (can receive emails, has RSVPs)
  externalId: null
}
```

**Verified User (After Email Verification):**
- Same as above, still `password = null`
- Can login via one-time email codes (passwordless)
- Can optionally set password later
- Can link social accounts

**Password User (If they set password):**
```typescript
{
  email: "john@example.com",
  provider: "email",
  password: "<bcrypt hash>",  // ← Now has password
  status: "active"
}
```

**Key Insight:** The `password` field (null or set) indicates authentication method, NOT account completeness. Status stays `active` throughout.

### Database Schema

No schema changes required! Existing `users` table supports this:

```typescript
// Existing schema already supports:
- password: nullable string
- provider: enum ('email', 'google', 'github', 'bluesky')
- status: enum ('active', 'inactive')
- email: unique string
```

### API Endpoints

#### 1. POST /auth/quick-rsvp (MODIFIED)

**Purpose:** Create account + RSVP without password, send calendar invite

**Request:**
```typescript
{
  name: string;         // "John Doe"
  email: string;        // "john@example.com"
  eventSlug: string;    // "my-awesome-event"
  status?: 'confirmed' | 'cancelled';  // Default: 'confirmed'
}
```

**Response (New User - 201 Created):**
```typescript
{
  success: true,
  message: "You're registered! Check your email for calendar invite.",
  userCreated: true
}
```

**Response (Existing User - 409 Conflict):**
```typescript
{
  statusCode: 409,
  message: "An account with this email already exists. Please log in.",
  error: "Conflict"
}
```

**Logic (V2 - UPDATED):**
1. Validate event exists (throw 404 if not)
2. Validate event is published and hasn't ended
3. **Check if user with email exists:**
   - **Exists**: Return 409 Conflict (frontend switches to login view)
   - **Not exists**: Continue to step 4
4. Parse name into firstName + lastName
5. Create new user (status=active, password=null, provider='email')
6. Create EventAttendee record
7. **Generate calendar invite (.ics file)**
8. **Send calendar invite email (NOT verification code)**
9. Return success

**Error Cases:**
- Event not found → 404
- Event not published or ended → 403
- Invalid email format → 400
- Email already exists → 409 (NEW)
- Event requires group membership → 403
- Event at capacity → 403

#### 2. POST /auth/request-email-verification (NEW)

**Purpose:** Send verification code to unverified user

**Request:**
```typescript
{
  email: string;  // "john@example.com"
}
```

**Response:**
```typescript
{
  success: true,
  message: "Verification code sent to your email"
}
```

**Logic:**
1. Find user by email
2. Check if user needs verification (has password=null, not yet verified)
3. Generate 6-digit verification code (15min expiry)
4. Send verification code email
5. Return success

**Error Cases:**
- User not found → 404
- User already verified → 400 "Email already verified"
- Rate limit exceeded → 429

#### 3. POST /auth/verify-email-code (EXISTING)

**Purpose:** Verify email and login user

**Request:**
```typescript
{
  code: string;  // One-time verification code
}
```

**Response:**
```typescript
{
  token: string;          // JWT access token
  refreshToken: string;   // JWT refresh token
  tokenExpires: number;   // Timestamp
  user: User;             // User object
  sessionId: string;      // Session ID
}
```

**Logic:**
1. Validate code exists in Redis
2. Get userId + tenantId from code
3. Delete code from Redis (one-time use)
4. Create session (same as normal login)
5. Return JWT tokens
6. User is now logged in

**Error Cases:**
- Code not found → 401 "Invalid or expired code"
- Code already used → 401 "Code already used"

### Email Verification System

**Service:** Extend `TempAuthCodeService`

**Current state:**
- Only supports Matrix auth codes (5min TTL)
- Hardcoded key prefix: `matrix_auth_code:`
- No tests

**Required changes:**
```typescript
class TempAuthCodeService {
  // REFACTOR: Make TTL and key prefix configurable
  async generateAuthCode(
    userId: number,
    tenantId: string,
    options?: { ttlSeconds?: number, keyPrefix?: string }
  ): Promise<string> {
    const ttl = options?.ttlSeconds ?? 5 * 60; // Default 5min
    const prefix = options?.keyPrefix ?? 'matrix_auth_code';
    const code = randomBytes(32).toString('hex');
    const key = `${prefix}:${code}`;

    await this.elastiCacheService.set(
      key,
      { userId, tenantId, createdAt: Date.now() },
      ttl
    );
    return code;
  }

  // validateAndConsumeAuthCode - add optional keyPrefix param
  async validateAndConsumeAuthCode(
    code: string,
    keyPrefix = 'matrix_auth_code'
  ): Promise<TempAuthData | null> {
    const key = `${keyPrefix}:${code}`;
    // ... existing logic
  }
}

// Usage for email verification:
const code = await tempAuthCodeService.generateAuthCode(
  userId,
  tenantId,
  { ttlSeconds: 7 * 24 * 60 * 60, keyPrefix: 'email_verification' }
);
```

**Testing:** Add unit tests before extending (currently has none)

### Calendar Invite Generation (NEW - V2)

**Purpose:** Generate calendar invites that automatically integrate with all major calendar providers

**Service:** Create `CalendarInviteService` (new)

**Approach:** Multipart MIME email with text/calendar for automatic integration

**Why multipart MIME:**
- Single email reaches all users
- Outlook/Gmail/Apple Mail auto-detect `text/calendar` MIME part
- Shows "Add to Calendar" button automatically in email clients
- Includes HTML body with fallback "Add to Calendar" links
- Maximum compatibility across providers

**MIME Structure:**
```
Content-Type: multipart/alternative

Part 1: text/plain (plain text version)
Part 2: text/html (HTML email with Add to Calendar links)
Part 3: text/calendar; method=REQUEST (ICS data for auto-integration)
```

**ICS File Format (RFC 5545):**
```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//OpenMeet//Event Calendar//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:event-{eventId}-attendee-{userId}@openmeet.net
DTSTAMP:{timestamp}
DTSTART:{eventStartTimeUTC}
DTEND:{eventEndTimeUTC}
SUMMARY:{eventTitle}
DESCRIPTION:{eventDescription}
LOCATION:{eventLocation}
URL:{eventUrl}
ORGANIZER;CN={organizerName}:mailto:{organizerEmail}
ATTENDEE;CN={attendeeName};RSVP=TRUE;PARTSTAT=ACCEPTED:mailto:{attendeeEmail}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT24H
ACTION:DISPLAY
DESCRIPTION:Reminder: {eventTitle} tomorrow
END:VALARM
END:VEVENT
END:VCALENDAR
```

**Add to Calendar Link Generation:**
```typescript
// Google Calendar
https://calendar.google.com/calendar/render?action=TEMPLATE&text={title}&dates={start}/{end}&details={description}&location={location}

// Outlook.com
https://outlook.live.com/calendar/0/action/compose?subject={title}&startdt={start}&enddt={end}&body={description}&location={location}

// Office 365
https://outlook.office.com/calendar/0/action/compose?subject={title}&startdt={start}&enddt={end}&body={description}&location={location}
```

**Implementation:**
```typescript
class CalendarInviteService {
  generateIcsContent(event: Event, attendee: User, organizer: User): string {
    // Generate RFC 5545 compliant ICS content
  }

  generateAddToCalendarLinks(event: Event): {
    google: string;
    outlook: string;
    office365: string;
  } {
    // Generate provider-specific URLs
  }

  async sendCalendarInvite(
    event: Event,
    attendee: User,
    organizer: User
  ): Promise<void> {
    const icsContent = this.generateIcsContent(event, attendee, organizer);
    const calendarLinks = this.generateAddToCalendarLinks(event);

    // Send multipart MIME email via MailService
    await this.mailService.sendCalendarInvite({
      to: attendee.email,
      icsContent,
      calendarLinks,
      event,
      attendee
    });
  }
}
```

**Libraries to Consider:**
- `ics` npm package for ICS generation
- `nodemailer` already supports multipart MIME
- Manual ICS generation for full control

**Integration Points:**
- Called by `quickRsvp()` after creating EventAttendee
- Called after any login that completes an RSVP
- Called when user changes RSVP status (update calendar)

### Email Templates (UPDATED - V2)

#### 1. Calendar Invite Email (NEW)

**Template:** `events/calendar-invite`

**Subject:** "You're registered for {eventTitle}!"

**Multipart Structure:**

**Part 1: HTML Body**
```html
<h1>You're registered for {eventTitle}!</h1>

<div class="event-details">
  <p>📅 {eventDate} at {eventTime}</p>
  <p>📍 {eventLocation}</p>
  <p>{eventDescription}</p>
</div>

<div class="calendar-buttons">
  <a href="{googleCalendarLink}" class="btn">Add to Google Calendar</a>
  <a href="{outlookCalendarLink}" class="btn">Add to Outlook</a>
  <a href="{office365CalendarLink}" class="btn">Add to Office 365</a>
</div>

<p><a href="{eventUrl}">View Event Details</a></p>

<p class="small-text">
  Not seeing an "Add to Calendar" button?
  Your email client may have automatically added this event to your calendar.
</p>
```

**Part 2: text/calendar (ICS data)**
- Contains full ICS content from CalendarInviteService
- MIME type: `text/calendar; method=REQUEST`
- Automatically parsed by email clients

**Variables:**
- eventTitle, eventDate, eventTime, eventLocation
- eventDescription, eventUrl
- attendeeName, organizerName
- googleCalendarLink, outlookCalendarLink, office365CalendarLink

#### 2. Email Verification Code Email (UPDATED)

**Template:** `auth/email-verification-code` (renamed from `auth/email-verification`)

**Subject:** "Verify your email - {appName}"

**Body:**
```html
<h1>Verify your email address</h1>

<p>Hi {name},</p>

<p>Enter this code to verify your email and complete your profile:</p>

<div class="verification-code">{code}</div>

<p>This code expires in 15 minutes.</p>

<p>After verification, you can:</p>
<ul>
  <li>Edit your profile</li>
  <li>Manage your RSVPs</li>
  <li>Join groups</li>
  <li>Set a password (optional)</li>
</ul>
```

**Variables:**
- name, code, appName, expiryMinutes

**Key Change:** No longer sent immediately after RSVP - only sent when user clicks "Verify Email"

### Frontend Components (UPDATED - V2)

**Current structure:**
```
EventRSVPSection (wrapper component)
├── EventAttendanceStatus (shows current status)
└── EventAttendanceButton (handles RSVP actions) ← MODIFY THIS
```

#### Changes Needed:

**1. QuickRSVPDialog.vue** (existing component - MAJOR UPDATE)

**Current state:**
- Has Quick RSVP form (name + email)
- Automatically shows verification code dialog after RSVP
- Success flow expects immediate verification

**V2 Changes:**
- Add two-view system: Quick RSVP ↔ Login
- Remove automatic verification code flow
- Handle 409 "email exists" response
- Show success message without verification prompt
- Integrate with existing login components

**Structure:**
```vue
<template>
  <q-dialog v-model="show" :position="dialogPosition">
    <!-- View 1: Quick RSVP Form (default) -->
    <div v-if="currentView === 'quick-rsvp'">
      <h2>Quick RSVP</h2>
      <q-input v-model="name" label="Full Name" />
      <q-input v-model="email" label="Email" type="email" />
      <q-btn @click="submitQuickRsvp">RSVP</q-btn>
      <p class="text-center">
        <a @click="currentView = 'login'">Already have an account? Log in</a>
      </p>
    </div>

    <!-- View 2: Login Form (embedded) -->
    <div v-else-if="currentView === 'login'">
      <h2>Log In</h2>
      <!-- Embed existing login form component -->
      <LoginForm
        :embedded="true"
        :eventSlug="eventSlug"
        @login-success="handleLoginSuccess"
      />
      <p class="text-center">
        <a @click="currentView = 'quick-rsvp'">Back to Quick RSVP</a>
      </p>
    </div>

    <!-- Success state -->
    <div v-else-if="currentView === 'success'">
      <q-icon name="check_circle" color="positive" size="xl" />
      <h2>You're registered!</h2>
      <p>Check your email for a calendar invite.</p>
      <q-btn @click="close">Done</q-btn>
    </div>
  </q-dialog>
</template>

<script>
async submitQuickRsvp() {
  try {
    await api.quickRsvp({ name, email, eventSlug });
    this.currentView = 'success';
  } catch (error) {
    if (error.status === 409) {
      // Email exists - switch to login view
      this.currentView = 'login';
      this.errorMessage = 'An account with this email exists. Please log in.';
    }
  }
}

async handleLoginSuccess() {
  // After login, create RSVP automatically
  await api.createAttendance(this.eventSlug, 'confirmed');
  this.currentView = 'success';
}
</script>
```

**Key behaviors:**
- Default view: Quick RSVP form
- 409 response auto-switches to login view with message
- Login success automatically creates RSVP (no additional step)
- Success message mentions calendar invite, not verification

**2. VerifyEmailBanner.vue** (NEW)

**Purpose:** Flexible component to prompt unverified users to verify email

**Props:**
- `placement`: 'event-page' | 'global' | 'profile'
- `dismissible`: boolean

**Structure:**
```vue
<template>
  <q-banner v-if="shouldShow" class="bg-warning text-white">
    <template v-slot:avatar>
      <q-icon name="warning" />
    </template>

    Verify your email to manage RSVPs and complete your profile.

    <template v-slot:action>
      <q-btn flat label="Verify Email" @click="startVerification" />
      <q-btn v-if="dismissible" flat icon="close" @click="dismiss" />
    </template>
  </q-banner>
</template>

<script>
async startVerification() {
  // Call /auth/request-email-verification
  await api.requestEmailVerification({ email: user.email });

  // Show code input dialog
  this.showCodeDialog = true;
}
</script>
```

**Usage:**
```vue
<!-- On event pages -->
<VerifyEmailBanner placement="event-page" :dismissible="true" />

<!-- In app layout (global banner) -->
<VerifyEmailBanner placement="global" :dismissible="true" />

<!-- On profile page -->
<VerifyEmailBanner placement="profile" :dismissible="false" />
```

**Visibility logic:**
- Only shown to authenticated users
- Only if user has `password === null`
- Only if user hasn't verified (check auth store)
- Can be dismissed but reappears on refresh until verified

**3. LoginForm.vue** (existing component - ADD embedded mode)

**Current state:**
- Full-page login form
- Redirects on success

**V2 Changes:**
- Add `embedded` prop for dialog usage
- Add `eventSlug` prop to complete RSVP after login
- Emit `login-success` event instead of redirecting when embedded
- Support external auth (Google/GitHub/Bluesky) in embedded mode

**4. EventAttendanceButton.vue** (existing component - UPDATE)

**Current behavior:**
- Shows "Going" button for authenticated users
- Opens QuickRSVPDialog for unauthenticated users

**V2 Changes:**
- After login via dialog, automatically create attendance
- Handle RSVP completion in dialog, not in button component

**5. VerifyEmailCodeDialog.vue** (existing component - NO CHANGES)

**Current behavior already correct:**
- Shows 6-digit code input
- Calls `/auth/verify-email-code`
- Logs user in on success

**Used by:** VerifyEmailBanner component

## Account Linking Strategy

### Problem: User RSVPs with email, later wants to login with Google

**Scenario:**
1. User RSVPs as john@gmail.com (creates email account, password=null)
2. Later clicks "Login with Google"
3. Google returns email: john@gmail.com
4. **Question:** Do we create a new account or link to existing?

**Solution: Email-based account merging**

```typescript
async validateSocialLogin(provider, socialData, tenantId) {
  // 1. Check if user exists with this email
  let user = await userService.findByEmail(socialData.email);

  if (user) {
    // User exists - update auth method if needed
    if (user.provider === 'email' && user.password === null) {
      // Unverified email account → convert to social
      user.provider = provider;
      user.externalId = socialData.id;
      await userService.update(user.id, user);
    }
    // If they have a password or different provider, just login
    // (email is the unique key, they can auth multiple ways)
  } else {
    // New user - create via social
    user = await userService.create({...socialData, provider});
  }

  // Create session and return tokens...
}
```

**Key Rules:**
- **One email = one user** (email is UNIQUE key)
- `provider` field tracks how they first signed up
- Users can authenticate multiple ways with same email
- Auto-merge when: email matches AND account has no password

### Future: Multi-Provider Support

**Current Limitation:** One `provider` field per user

**Future Enhancement:** Add `auth_providers` table
```sql
CREATE TABLE auth_providers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  provider VARCHAR(50), -- 'google', 'github', 'bluesky'
  external_id VARCHAR(255),
  created_at TIMESTAMP,
  UNIQUE(provider, external_id)
);
```

This would allow one user to have multiple linked auth methods. **Not in scope for v1.**

## Security Considerations

### Email Verification Codes
- ✓ 6-digit numeric codes (1M possibilities)
- ✓ 15-minute expiration (secure for 6-digit codes)
- ✓ One-time use (deleted after validation)
- ✓ Stored in Redis (auto-expiry)
- ✓ Multi-layer rate limiting (per-IP, per-email, per-email+code)

### Account Security
- ✓ Users with `password=null` can only login via email codes or social auth
- ✓ Email verification required before login
- ✓ JWT tokens follow existing security model
- ✓ Sessions use same security as current auth

### Spam/Abuse Prevention
- ⚠ **V1**: No rate limiting on quick RSVPs
- ⚠ **Future**: Add rate limiting (e.g., max 5 RSVPs per email per hour)
- ⚠ **Future**: Add CAPTCHA for suspicious activity

## Testing Strategy

### Unit Tests

**Backend:**
- ✓ QuickRsvpDto validation
- ✓ VerifyEmailCodeDto validation
- ✓ TempAuthCodeService.generateEmailVerificationCode()
- ✓ TempAuthCodeService.validateEmailVerificationCode()
- ✓ AuthService.quickRsvp() - all scenarios
- ✓ AuthService.verifyEmailCode() - all scenarios

**Frontend:**
- ✓ QuickRSVPModal renders correctly
- ✓ QuickRSVPModal validates email
- ✓ QuickRSVPModal handles API errors
- ✓ Email verification page handles code correctly

### Integration Tests
- ✓ POST /auth/quick-rsvp creates user + RSVP
- ✓ POST /auth/verify-email-code logs user in
- ✓ Duplicate RSVPs are idempotent
- ✓ Invalid codes are rejected

### E2E Tests
- ✓ Complete flow: RSVP → Email → Verify → Login → See RSVP
- ✓ Social login after quick RSVP merges accounts
- ✓ User can set password after verification

## Implementation Order (V2 - Updated)

### Status: V1 Implemented, V2 Refinements In Progress

**V1 Completed:**
- ✅ QuickRsvpDto and VerifyEmailCodeDto created
- ✅ AuthService.quickRsvp() implemented
- ✅ AuthService.verifyEmailCode() implemented
- ✅ POST /auth/quick-rsvp endpoint
- ✅ POST /auth/verify-email-code endpoint
- ✅ QuickRSVPDialog component (basic version)
- ✅ VerifyEmailCodeDialog component
- ✅ VerifyEmailPage route
- ✅ Rate limiting and security measures
- ✅ E2E tests

**V2 Changes Needed:**

### Phase 1: Backend - Calendar Integration
- [ ] Create CalendarInviteService
  - [ ] generateIcsContent() method (RFC 5545 compliant)
  - [ ] generateAddToCalendarLinks() method
  - [ ] Integration with MailService for multipart MIME
- [ ] Update MailService.sendCalendarInvite()
  - [ ] Support multipart/alternative MIME structure
  - [ ] text/plain, text/html, text/calendar parts
  - [ ] Test with different email clients
- [ ] Create calendar invite email template (MJML)
  - [ ] Event details
  - [ ] Add to Calendar buttons (Google, Outlook, O365)
  - [ ] Responsive design
- [ ] Unit tests for CalendarInviteService
- [ ] Integration tests for multipart email sending

### Phase 2: Backend - Quick RSVP Modifications
- [ ] Modify AuthService.quickRsvp()
  - [ ] Remove verification code generation
  - [ ] Add 409 response for existing users
  - [ ] Call CalendarInviteService.sendCalendarInvite()
  - [ ] Update response format
- [ ] Create POST /auth/request-email-verification endpoint
  - [ ] Accept email parameter
  - [ ] Generate 6-digit code
  - [ ] Send verification code email (not calendar invite)
  - [ ] Rate limiting
- [ ] Update E2E tests
  - [ ] Test 409 response for existing users
  - [ ] Test calendar invite email sending
  - [ ] Test new verification flow
  - [ ] Remove tests for old immediate-verification flow

### Phase 3: Frontend - Dialog Refactor
- [ ] Update QuickRSVPDialog component
  - [ ] Add two-view system (quick-rsvp ↔ login)
  - [ ] Add currentView state management
  - [ ] Remove automatic verification code flow
  - [ ] Handle 409 response → switch to login view
  - [ ] Update success message (mention calendar invite)
  - [ ] Add "Already have account? Log in" link
  - [ ] Add "Back to Quick RSVP" link in login view
- [ ] Update/Create LoginForm component
  - [ ] Add `embedded` prop for dialog usage
  - [ ] Add `eventSlug` prop
  - [ ] Emit `login-success` event (don't redirect when embedded)
  - [ ] Support external auth in embedded mode
  - [ ] Handle RSVP creation after login
- [ ] Update component tests
  - [ ] Test view switching
  - [ ] Test 409 handling
  - [ ] Test login-then-RSVP flow
  - [ ] Test external auth flow

### Phase 4: Frontend - Verify Email Banner
- [ ] Create VerifyEmailBanner component
  - [ ] Flexible placement system
  - [ ] Dismissible functionality
  - [ ] Integrate with VerifyEmailCodeDialog
  - [ ] Call new /auth/request-email-verification endpoint
- [ ] Add banner to EventPage
- [ ] Add banner to App layout (global)
- [ ] Add banner to Profile page
- [ ] Store dismiss state in localStorage
- [ ] Component tests

### Phase 5: Integration & Testing
- [ ] Test complete Quick RSVP flow (new user)
  - [ ] Submit RSVP → Calendar invite received
  - [ ] Banner appears → Request verification
  - [ ] Enter code → Logged in
- [ ] Test Quick RSVP flow (existing user)
  - [ ] Submit RSVP → 409 response
  - [ ] Dialog switches to login → Complete login
  - [ ] RSVP created → Calendar invite received
- [ ] Test external auth RSVP flow
  - [ ] Click Google/GitHub/Bluesky
  - [ ] Complete auth → RSVP created
  - [ ] Calendar invite received
- [ ] Test calendar invite emails
  - [ ] Gmail: Auto "Add to Calendar" button
  - [ ] Outlook: Auto calendar integration
  - [ ] Apple Mail: Auto calendar integration
  - [ ] Fallback links work
- [ ] Update E2E tests to cover all flows

### Phase 6: Group Join Flow (Future)
- [ ] Apply same pattern to group membership requests
- [ ] Quick join → Login required flow
- [ ] Verification banner for unverified users
- [ ] Reuse QuickRSVPDialog pattern

### Phase 7: Polish & Deploy
- [ ] Manual testing (dev environment)
- [ ] Fix bugs, refine UX
- [ ] Update documentation
- [ ] Deploy to production
- [ ] Monitor metrics (calendar invite open rates, verification rates)

## Success Metrics

**Primary:**
- ↑ RSVP conversion rate (target: +30%)
- ↑ New user registrations via events
- ↓ Time to first RSVP (target: <30 seconds)

**Secondary:**
- Email verification rate (target: >60% within 24hr)
- User satisfaction (qualitative feedback)
- Reduced support tickets about "can't RSVP"

## UX Refinements

### Mobile Optimization

**Issue:** Standard modals can feel awkward on mobile devices.

**Solution:** Use Quasar bottom sheet on mobile, modal on desktop
```vue
<q-dialog
  v-model="showQuickRsvp"
  :position="$q.screen.lt.md ? 'bottom' : 'standard'"
  :maximized="$q.screen.lt.sm"
>
  <!-- Quick RSVP form -->
</q-dialog>
```

- Desktop: Centered modal (familiar web pattern)
- Tablet: Bottom sheet (easier thumb reach)
- Mobile: Maximized sheet (full-screen form)

### Returning User Experience - Cookie-based Auto-Login ⏸️ NOT IMPLEMENTED

**Status**: Deferred to V2

**Reasoning**:
- 15-minute code expiry is too short for cookie-based auto-login
- Would require separate long-lived token system
- Email verification link is sufficient for V1

**Future Enhancement**:
If implementing, would need:
- Separate "remember me" token (30-day expiry)
- Different security model than verification codes
- Device fingerprinting for added security

## Design Decisions - FINALIZED ✅

### 1. **Returning user flow**
Email verification required (15-minute expiry). No auto-login in V1.

### 2. **Rate limiting**
Multi-layer throttling (per-IP, per-email, per-resource, per-combination)

### 3. **CAPTCHA**
None in v1. Add if abused.

### 4. **Email resend**
None in v1. RSVP is idempotent (just resubmit).

### 5. **Name parsing**
Split on first space: `firstName = name.split(' ')[0]`, `lastName = name.split(' ').slice(1).join(' ')`

### 6. **Social auth merging**
Silent auto-merge when email matches (same email = same person)

## Limitations (V1)

### Group/Member-Only Events

**Current Behavior:** Quick RSVP is **blocked** for events that require group membership.

**Reasoning:**
- V1 focuses on public events to reduce complexity
- Group membership requires additional approval workflows
- Keeps initial scope manageable

**Error Response:**
```json
{
  "statusCode": 403,
  "message": "This event requires group membership. Please register and join the group to RSVP."
}
```

**Implementation:**
- Check if event has associated group requirement
- Reject quick RSVP requests for group events
- Return clear error message directing user to full registration

**Future Enhancement (V2):**
Add automatic group membership request during quick RSVP:
1. User quick RSVPs to group event
2. System creates user + pending group membership request
3. Group admin receives notification to approve
4. RSVP becomes active when membership approved
5. User receives email when approved

This would enable the same low-friction experience for group events while maintaining group admin control.

## Password Management for Passwordless Users

**Goal:** Enable passwordless users to optionally set a password without friction or confusion.

### Issue
Passwordless users couldn't set passwords - profile page required "Current Password" which they didn't have.

### Solution
- **Backend:** Allow setting password without old password if user has `password: null`
- **Frontend:** Profile page shows "Set Account Password" (not "Change") for passwordless users, hides current password field
- **Discovery:** Hint on email verification success page links to profile settings

**Why:** Maintains low-friction onboarding while giving users password option if they want it. Passwordless auth remains valid path.

## Future Enhancements

- **Group membership auto-join:** Allow quick RSVP for group events with pending approval (see above)
- **Phone verification:** Alternative to email for some regions
- **Magic links:** Passwordless login for existing users
- **Account linking UI:** Explicit UI for linking multiple auth methods
- **RSVP reminders:** Automated email reminders before event
- **Waitlist support:** Quick RSVP to waitlist when event is full

## References

- Lu.ma RSVP flow: [Screenshots in claude/screenshot/]
- GitHub Issue #248: https://github.com/openmeet-team/openmeet-platform/issues/248
- Existing auth system: `openmeet-api/src/auth/`
- TempAuthCodeService: `openmeet-api/src/auth/services/temp-auth-code.service.ts`
