# Email Verification Implementation - Handoff Document

**Status:** Phase 1 Complete (Test Infrastructure)
**Next Phase:** Phase 2 - Write failing E2E tests for registration flow
**Implementation Timeline:** 2-3 days end-to-end

---

## Quick Links

### Documentation (Local)
- **Design Note**: `design-notes/email-verification-system.md` - Complete user flows and edge cases
- **Quick RSVP Flow**: `design-notes/quick-rsvp-passwordless-flow.md` - Related passwordless flow
- **This Handoff Doc**: `docs/email-verification-handoff.md` (you are here)

### GitHub Issues
- **Bluesky Email Retrieval**: https://github.com/OpenMeet-Team/openmeet-api/issues/336
  - Tracks getting email from Bluesky OAuth for verification

### Code References
- **EmailVerificationCodeService**: `src/auth/services/email-verification-code.service.ts`
  - Already built 6-digit code system (used for passwordless login)
  - Stores codes in Redis with 15min TTL
  - One-time use, email-validated

- **Auth Service**: `src/auth/auth.service.ts`
  - Line 275-345: `register()` method - needs modification to create INACTIVE users
  - Line 73-158: `validateLogin()` - needs to check if user verified before login
  - Line 949-1099: `quickRsvp()` - needs modification to create INACTIVE users
  - Line 1107-1160: `verifyEmailCode()` - needs to activate INACTIVE users

- **User Service**: `src/user/user.service.ts`
  - Line 80-177: `create()` method - handles user creation
  - Line 455-553: `findOrCreateUser()` - OAuth user creation (should create ACTIVE for OAuth)

- **Mail Service**: `src/mail/mail.service.ts`
  - Line 381-408: `sendEmailVerification()` - exists but may need updates
  - Line 410-430: `sendLoginCode()` - similar pattern to follow

---

## What We're Building

**Goal:** Implement mandatory email verification for all OpenMeet users using 6-digit verification codes.

**Key Behaviors:**
1. **Normal Registration**: Create INACTIVE → send code → user verifies → ACTIVE + logged in
2. **Quick RSVP**: Create INACTIVE → send code → user verifies → ACTIVE + logged in
3. **OAuth (Google/GitHub)**: Create ACTIVE immediately (skip verification - already verified by provider)
4. **Bluesky OAuth**: See issue #336 - currently asks for email in separate step

**Why 6-digit codes instead of JWT links:**
- Mobile-friendly (copy-paste, stay in app)
- Shorter expiration (15min vs 24hr)
- One-time use
- Already built and working for passwordless login
- Has rate limiting

---

## What We've Completed

### ✅ Phase 1: Test Infrastructure Setup

**Files Created:**

1. **`test/utils/maildev-service.ts`**
   - Shared MailDev service helper for E2E tests
   - Functions: `getEmails()`, `getEmailsByRecipient()`, `getMostRecentEmailByRecipient()`, `clearEmails()`
   - Used to fetch emails from MailDev during tests

2. **`test/utils/email-verification-helpers.ts`**
   - Test utilities for email verification flows
   - Key functions:
     - `extractVerificationCode(email)` - Pull 6-digit code from email HTML/text
     - `getMostRecentEmail(emails, recipient)` - Get latest email for user
     - `assertHasVerificationCode(email)` - Verify email contains valid code
     - `assertSubjectContains(email, text)` - Check email subject
     - `assertSentTo(email, recipient)` - Verify recipient
     - `waitForEmail(getFn, predicate, timeout)` - Poll for async email arrival

3. **`test/utils/email-verification-helpers.spec.ts`**
   - Unit tests for the helper functions
   - **NOTE:** Has TypeScript compilation errors with `matchAll()` - needs fixing

**Issues Found:**
- TypeScript error in `extractAllCodes()` method: `matchAll()` requires `--downlevelIteration` flag
- Need to fix before tests will run

---

## Current Issue: TypeScript Compilation Error

**Problem:**
```
test/utils/email-verification-helpers.ts(152,27): error TS2802:
Type 'RegExpStringIterator<RegExpExecArray>' can only be iterated through when using
the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
```

**Where:** Lines 152 and 160 in `email-verification-helpers.ts` - the `extractAllCodes()` method

**Quick Fix Options:**

1. **Add downlevelIteration flag to tsconfig.json:**
   ```json
   {
     "compilerOptions": {
       "downlevelIteration": true
     }
   }
   ```

2. **Or refactor to use `match()` with global flag instead of `matchAll()`:**
   ```typescript
   // Instead of:
   const htmlMatches = email.html?.matchAll(/\b\d{6}\b/g);

   // Use:
   const htmlMatch = email.html?.match(/\b\d{6}\b/g);
   if (htmlMatch) {
     codes.push(...htmlMatch);
   }
   ```

3. **Or comment out `extractAllCodes()` if not needed for v1** (we only use `extractVerificationCode()` which works)

---

## What's Next: Phase 2 - Registration Flow

### Step 1: Fix TypeScript Error
Choose one of the fixes above and verify tests run:
```bash
npm test -- email-verification-helpers.spec.ts
```

### Step 2: Create First E2E Test (RED)

**File to create:** `test/auth/email-registration-verification.e2e-spec.ts`

**Key tests to write:**

1. **Registration creates INACTIVE user (no login)**
   ```typescript
   it('should create INACTIVE user and send verification email (no login)', async () => {
     const email = `test-${Date.now()}@example.com`;

     // Register
     const response = await request(app)
       .post('/api/v1/auth/email/register')
       .set('x-tenant-id', TESTING_TENANT_ID)
       .send({ email, password: 'Pass123!', firstName: 'Test', lastName: 'User' })
       .expect(201);

     // ASSERT: No tokens returned
     expect(response.body.token).toBeUndefined();
     expect(response.body.refreshToken).toBeUndefined();

     // ASSERT: Verification email sent
     const emails = await mailDevService.getEmailsByRecipient(email);
     expect(emails.length).toBeGreaterThan(0);

     const verificationEmail = await mailDevService.getMostRecentEmailByRecipient(email);
     EmailVerificationTestHelpers.assertHasVerificationCode(verificationEmail);
   });
   ```

2. **Unverified user cannot login**
   ```typescript
   it('should NOT allow login with unverified account', async () => {
     // Create user (unverified)
     const email = `test-${Date.now()}@example.com`;
     await register(email, 'Pass123!');

     // Try to login
     const response = await request(app)
       .post('/api/v1/auth/email/login')
       .set('x-tenant-id', TESTING_TENANT_ID)
       .send({ email, password: 'Pass123!' })
       .expect(422);

     expect(response.body.message).toContain('verify');
   });
   ```

3. **User can verify and login**
   ```typescript
   it('should verify email and activate user account', async () => {
     // Register
     const email = `test-${Date.now()}@example.com`;
     await register(email, 'Pass123!');

     // Get code from email
     const verificationEmail = await mailDevService.getMostRecentEmailByRecipient(email);
     const code = EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);

     // Verify
     const verifyResponse = await request(app)
       .post('/api/v1/auth/verify-email-code')
       .set('x-tenant-id', TESTING_TENANT_ID)
       .send({ email, code })
       .expect(200);

     // ASSERT: User logged in
     expect(verifyResponse.body.token).toBeDefined();
     expect(verifyResponse.body.user.email).toBe(email);

     // ASSERT: Can now login normally
     await request(app)
       .post('/api/v1/auth/email/login')
       .set('x-tenant-id', TESTING_TENANT_ID)
       .send({ email, password: 'Pass123!' })
       .expect(200);
   });
   ```

**Expected Result:** All tests FAIL (RED) because implementation doesn't exist yet.

### Step 3: Implement Backend Changes (GREEN)

Once tests are failing, implement minimal code to make them pass:

**Change 1: Update `register()` in auth.service.ts**
- Create user with `StatusEnum.inactive` instead of `active`
- Generate 6-digit code using `emailVerificationCodeService.generateCode()`
- Send verification email (not JWT link)
- Return success message (NO tokens - user not logged in)

**Change 2: Update `validateLogin()` in auth.service.ts**
- Check if `user.status.id === StatusEnum.inactive`
- If inactive, throw error: "Please verify your email first"

**Change 3: Update `verifyEmailCode()` in auth.service.ts**
- After validating code, check if user is inactive
- If inactive, update status to active: `userService.update(user.id, { status: { id: StatusEnum.active } })`
- Then create session and return tokens (log user in)

**Change 4: Create/update email template**
- `src/mail/mail-templates/activation.mjml` (or similar)
- Display 6-digit code prominently
- Show expiration time (15 minutes)

### Step 4: Run Tests (should be GREEN)

```bash
npm run test:e2e -- email-registration-verification.e2e-spec.ts
```

### Step 5: Refactor & Add Edge Cases

Write additional tests:
- Code expiration (15 minutes)
- Wrong code entered
- Code for wrong email
- Multiple resend attempts (rate limiting)
- User tries to register twice

---

## Phase 3: Quick RSVP Flow (Next After Phase 2)

### Key Changes Needed

**Update `quickRsvp()` in auth.service.ts:**
- Create user as INACTIVE (not ACTIVE)
- Still create RSVP record (user has RSVP but can't access it yet)
- Send calendar invite immediately (even though unverified)
- Send verification code email
- Return success message without login tokens

**Limit unverified RSVPs:**
- Allow 1-2 RSVPs before requiring verification
- Track: Count RSVPs for unverified email
- After limit: "Please verify your email to continue RSVPing"

**Block system notifications to unverified users:**
- Calendar invite: ✅ Send immediately
- Verification emails: ✅ Send
- Direct organizer messages: ✅ Allow
- System notifications (event updates, reminders): ❌ Block until verified
- Follow-up reminder: ✅ Send after a few days ("Complete registration by verifying email")

**Tests to write:**
- Quick RSVP creates INACTIVE user + RSVP
- Calendar invite sent immediately
- Verification email sent
- User can verify and access RSVP
- Limit enforced on multiple RSVPs
- Organizer sees unverified attendees with indicator

---

## Phase 4: OAuth Social Login

**Changes needed in `findOrCreateUser()` (user.service.ts):**

```typescript
// Determine initial status based on provider
let initialStatus: StatusDto;

if (authProvider === AuthProvidersEnum.email) {
  // Email provider: Requires verification
  initialStatus = { id: StatusEnum.inactive };
} else {
  // OAuth providers (google, github):
  // Emails are verified by the provider, create as active
  initialStatus = { id: StatusEnum.active };
}
```

**Tests:**
- Google OAuth creates ACTIVE user (skip verification)
- GitHub OAuth creates ACTIVE user (skip verification)
- Bluesky OAuth: See issue #336 for email handling

---

## Migration Strategy

**Existing users must be marked as verified:**

```typescript
// Migration: Mark all existing users as ACTIVE
UPDATE "user"
SET "statusId" = (SELECT id FROM "status" WHERE "name" = 'active')
WHERE "statusId" IS NULL OR "statusId" = (SELECT id FROM "status" WHERE "name" = 'inactive')
```

**Why?**
- Backward compatibility
- Don't disrupt existing users
- Assume legacy accounts have working emails

---

## Testing Checklist

**Before starting Phase 2:**
- [ ] Fix TypeScript error in email-verification-helpers.ts
- [ ] Run helper unit tests: `npm test -- email-verification-helpers.spec.ts`
- [ ] Verify MailDev is running: `http://localhost:1080`

**During Phase 2 implementation:**
- [ ] Write failing E2E test for registration
- [ ] Write failing E2E test for login block
- [ ] Write failing E2E test for verification
- [ ] Implement register() changes
- [ ] Implement validateLogin() changes
- [ ] Implement verifyEmailCode() changes
- [ ] All tests pass (GREEN)
- [ ] Add edge case tests
- [ ] All edge cases pass

**Before deployment:**
- [ ] Run full test suite: `npm run test:e2e`
- [ ] Test in local environment with real emails
- [ ] Create migration for existing users
- [ ] Update API documentation
- [ ] Review design note with team

---

## Success Criteria

**Functional:**
- ✅ Registration creates INACTIVE users
- ✅ Email verification code sent immediately
- ✅ Verified users can login
- ✅ Unverified users cannot login
- ✅ Quick RSVP creates INACTIVE users but sends calendar invite
- ✅ OAuth (Google/GitHub) creates ACTIVE users (skip verification)

**Technical:**
- ✅ All E2E tests pass
- ✅ Helper unit tests pass
- ✅ No TypeScript compilation errors
- ✅ MailDev working in test environment
- ✅ Rate limiting enforced (3 codes per 15min per email)

**Metrics to track after deployment:**
- Verification completion rate (target: >80%)
- Time to verification (target: <5 minutes median)
- Email delivery success rate (target: >95%)
- User drop-off points

---

## Helpful Commands

**Run specific test file:**
```bash
npm run test:e2e -- email-registration-verification.e2e-spec.ts
```

**Run unit tests:**
```bash
npm test -- email-verification-helpers.spec.ts
```

**Check MailDev:**
```bash
# Open in browser
http://localhost:1080

# Or check via API
curl http://localhost:1080/email
```

**TypeScript check:**
```bash
npx tsc --noEmit test/utils/email-verification-helpers.ts
```

**View logs during E2E tests:**
```bash
npm run test:e2e -- email-registration-verification.e2e-spec.ts --verbose
```

---

## Questions? Need Help?

**If stuck on:**
- TypeScript errors → Check tsconfig.json compiler options
- MailDev not working → Verify docker-compose services running
- Tests timing out → Check Redis connection, increase test timeout
- Codes not extracting → Verify email template has 6-digit code in HTML/text

**Reference implementations:**
- Passwordless login: Already uses 6-digit codes (similar pattern)
- Calendar invite tests: `test/event/calendar-invite.e2e-spec.ts` (shows MailDev usage)
- Quick RSVP tests: `test/auth/quick-rsvp.e2e-spec.ts` (shows current flow)

**Next person:** Pick up at "Step 1: Fix TypeScript Error" in Phase 2 section above.
