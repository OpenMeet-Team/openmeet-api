# Add email retrieval from Bluesky OAuth for email verification

## Problem

Currently, when users sign in via Bluesky, we don't retrieve their email address from the OAuth flow. This creates a problem with our upcoming email verification requirement:

- **Normal registration**: Users provide email → we verify it → they can use the app
- **Quick RSVP**: Users provide email → we verify it → they can use the app
- **Google/GitHub OAuth**: Email is provided and already verified by the provider → users can immediately use the app
- **Bluesky OAuth**: ❌ No email retrieved → users cannot receive verification codes or important notifications, we have a secondary page that gets an email from the user and should save that as the email, but it may not be working

## Current Bluesky Flow

1. User clicks "Sign in with Bluesky"
2. OAuth dance happens
3. We receive profile data (handle, display name, avatar)
4. User account is created **without an email address**
5. user is asked for email address on a page after the oauth flow
5. User is logged in

## Desired Flow

1. User clicks "Sign in with Bluesky"
2. OAuth dance happens with email scope requested
3. We receive profile data **including email address**
4. User account is created with verified email
5. User is logged in and can receive notifications

## Research Needed

Bluesky's AT Protocol OAuth implementation may support email retrieval similar to how we've seen in other implementations (e.g., Smoke Signal login asks for email permission).

**Questions to investigate:**
- Does Bluesky OAuth support requesting email scope?
- If yes, what scope/permission is needed?
- Is the email provided already verified by Bluesky?
- Do we need to update our OAuth configuration?
- Are there any API changes needed in our Bluesky integration?

## Related Context

- We're implementing mandatory email verification for all users
- Users created via OAuth providers (Google, GitHub) skip email verification because their emails are already verified by the provider
- Bluesky users should follow the same pattern if Bluesky provides verified emails
- If Bluesky doesn't provide emails, we may need to prompt users for email after OAuth login and verify it separately

## Acceptance Criteria

- [ ] Research Bluesky AT Protocol OAuth documentation for email retrieval
- [ ] Determine if email scope is available and how to request it
- [ ] Update Bluesky OAuth configuration to request email permission (if available)
- [ ] Update user creation flow to capture email from Bluesky OAuth response
- [ ] Add tests for Bluesky login with email
- [ ] Document findings and implementation approach

## Priority

Medium - This blocks email verification for Bluesky users, but we can currently ask for email in a seperae step of the login for bsky auth

## Related Issues

Part of the email verification feature implementation.

## References

- AT Protocol Documentation: https://atproto.com/
- Bluesky OAuth Implementation: https://github.com/bluesky-social/atproto/tree/main/packages/oauth
- Smoke Signal example: https://smokesignal.events/ (shows email permission request during Bluesky login)

---

**Labels:** enhancement, oauth, bluesky, email-verification
