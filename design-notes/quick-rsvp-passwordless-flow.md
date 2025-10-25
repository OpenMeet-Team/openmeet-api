# Quick RSVP - Passwordless Onboarding Flow

**Status**: Design Phase
**Date**: 2025-10-24
**Priority**: High - Adoption feature from GitHub issue #248

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

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits event page (unauthenticated)                 │
│    - Clicks "Going" button                                   │
│    - Modal appears: "Enter name + email to RSVP"            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User submits quick RSVP form                             │
│    - Name: "John Doe"                                        │
│    - Email: "john@example.com"                              │
│    - Clicks "RSVP"                                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Backend processing                                        │
│    ✓ Check if user exists (by email)                        │
│    ✓ Create user OR use existing                            │
│    ✓ Create RSVP (EventAttendee)                            │
│    ✓ Generate verification code                             │
│    ✓ Send verification email                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User sees confirmation                                    │
│    "You're in! Check your email to verify and manage RSVP"  │
│    - Can close modal                                         │
│    - Stays on event page                                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User receives email                                       │
│    Subject: "Verify your RSVP for [Event Name]"            │
│    Body: Click to verify: https://platform.../verify?code=X │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. User clicks verification link                            │
│    - Redirected to platform with code in URL                │
│    - Frontend calls /auth/verify-email-code                 │
│    - Backend validates code, creates session, returns JWT   │
│    - User is now logged in!                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. User is logged in                                         │
│    - Can see their RSVP                                      │
│    - Can manage/cancel RSVP                                  │
│    - Can optionally set password later                       │
│    - Can link social accounts (Google, Bluesky)             │
└─────────────────────────────────────────────────────────────┘
```

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

#### 1. POST /auth/quick-rsvp

**Purpose:** Create account + RSVP without password

**Request:**
```typescript
{
  name: string;         // "John Doe"
  email: string;        // "john@example.com"
  eventSlug: string;    // "my-awesome-event"
  approvalAnswer?: string; // Optional if event requires approval
}
```

**Response:**
```typescript
{
  success: true,
  message: "You're in! Check your email to verify and manage your RSVP"
}
```

**Logic:**
1. Validate event exists (throw 404 if not)
2. Check if user with email exists:
   - **Exists**: Use existing user
   - **Not exists**: Create new user (status=active, password=null)
3. Check if RSVP already exists:
   - **Exists**: Return success (idempotent)
   - **Not exists**: Create EventAttendee
4. Generate verification code (24hr expiry)
5. Send verification email
6. Return success

**Error Cases:**
- Event not found → 404
- Invalid email format → 400
- Email service failure → Log error, still return success (user got RSVP)

#### 2. POST /auth/verify-email-code

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

### Email Template

**Subject:** "Verify your RSVP for [Event Name]"

**Body:**
```
Hi [Name],

You're registered for [Event Name]!

📅 [Event Date & Time]
📍 [Event Location]

Click below to verify your email and manage your RSVP:

[Verify Email Button] → https://platform.openmeet.net/verify-email?code=abc123

This link expires in 24 hours.

---
See you there!
The OpenMeet Team
```

### Frontend Components

**Current structure:**
```
EventRSVPSection (wrapper component)
├── EventAttendanceStatus (shows current status)
└── EventAttendanceButton (handles RSVP actions) ← MODIFY THIS
```

#### Changes Needed:

**1. EventAttendanceButton.vue** (existing component - add quick RSVP)
```vue
<template>
  <!-- Existing: Authenticated users -->
  <q-btn v-if="isAuthenticated" @click="handleAttend">Going</q-btn>

  <!-- NEW: Unauthenticated users -->
  <q-btn v-else @click="showQuickRsvpModal = true">Going</q-btn>

  <!-- NEW: Quick RSVP Modal -->
  <QuickRSVPModal
    v-model="showQuickRsvpModal"
    :event="event"
    @rsvp-success="handleQuickRsvpSuccess"
  />
</template>
```

**2. QuickRSVPModal.vue** (new component)
- Location: `openmeet-platform/src/components/event/QuickRSVPModal.vue`
- Responsive dialog (bottom sheet on mobile)
- Fields: Name, Email
- Calls: `POST /auth/quick-rsvp`
- Shows success message

**3. VerifyEmailPage.vue** (new page)
- Route: `/verify-email?code=abc123`
- Auto-calls: `POST /auth/verify-email-code`
- Stores JWT, redirects to home or event

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
- ✓ 32-byte random hex (strong entropy)
- ✓ 24-hour expiration
- ✓ One-time use (deleted after validation)
- ✓ Stored in Redis (auto-expiry)
- ✓ Rate limiting on generation (TODO: add after v1)

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

## Implementation Order

### Critical Path Issues Found:
1. **TempAuthCodeService needs refactoring** (hardcoded TTL/prefix)
2. **TempAuthCodeService has NO tests** (must add before extending)
3. **DTOs already exist** (created earlier, need validation)

### Phase 1: Foundation (Refactor TempAuthCodeService)
- [ ] Write tests for existing TempAuthCodeService (Matrix auth flow)
- [ ] Refactor: Add optional `ttlSeconds` and `keyPrefix` parameters
- [ ] Verify Matrix auth still works (regression testing)
- [ ] Add tests for email verification code path

### Phase 2: Backend Quick RSVP
- [ ] Validate/refine QuickRsvpDto and VerifyEmailCodeDto
- [ ] Implement AuthService.quickRsvp()
- [ ] Implement AuthService.verifyEmailCode()
- [ ] Add POST /auth/quick-rsvp endpoint
- [ ] Add POST /auth/verify-email-code endpoint
- [ ] Create email template
- [ ] Add cookie handling
- [ ] Unit + integration tests

### Phase 3: Frontend
- [ ] Create QuickRSVPModal component (responsive)
- [ ] Update EventAttendanceButton (show modal when unauthenticated)
- [ ] Create VerifyEmailPage route
- [ ] Add auto-login logic (check cookie on app mount)
- [ ] Component tests
- [ ] E2E test: Full RSVP flow

### Phase 4: Polish & Deploy
- [ ] Manual testing (dev environment)
- [ ] Fix bugs, refine UX
- [ ] Deploy to production
- [ ] Monitor metrics

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

### Returning User Experience - Cookie-based Auto-Login ✅

**Flow:**
1. User quick RSVPs → Backend creates 7-day verification code
2. Backend sets cookie: `openmeet_pending_verification=<code>`
3. Next visit → Frontend auto-verifies and logs in
4. User clicks "Going" → Immediate RSVP (already logged in!)

**Implementation:**
```typescript
// Backend: After quick RSVP
const code = await tempAuthCodeService.generateEmailVerificationCode(
  user.id,
  tenantId,
  7 * 24 * 60 * 60 // 7 days TTL (matches cookie expiry)
);

response.cookie('openmeet_pending_verification', code, {
  domain: cookieDomain,     // .openmeet.net (cross-subdomain)
  secure: isSecure,         // HTTPS only
  sameSite: 'lax',          // CSRF protection
  httpOnly: false,          // ← JS can read (different from OIDC cookies)
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

**Security considerations validated:**
- ✓ XSS risk acceptable (one-time code, 7-day expiry)
- ✓ Per-device (good security practice)
- ✓ Graceful fallback if code expired/invalid
- ✓ Email verification link works cross-device

## Design Decisions - FINALIZED ✅

### 1. **Returning user flow**
Cookie-based auto-login with 7-day verification code

### 2. **Rate limiting**
None in v1. Add if abused.

### 3. **CAPTCHA**
None in v1. Add if abused.

### 4. **Email resend**
None in v1. RSVP is idempotent (just resubmit).

### 5. **Name parsing**
Split on first space: `firstName = name.split(' ')[0]`, `lastName = name.split(' ').slice(1).join(' ')`

### 6. **Social auth merging**
Silent auto-merge when email matches (same email = same person)

## Future Enhancements

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
