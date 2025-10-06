# Bluesky Login Flow Redesign

> **NOTE**: This document focuses specifically on the login flow UI implementation. For the authoritative and comprehensive ATProtocol integration design, please refer to [ATProtocol Design](/design-notes/atprotocol-design.md).

## Problem
We've been experiencing an issue with the Bluesky OAuth login flow where the popup window used to get credentials becomes the active window and focus doesn't properly return to the main window after authentication. This results in a suboptimal user experience where users may need to manually switch back to the main window.

## Current Implementation
The current implementation uses a popup window approach:

1. User clicks "Login with Bluesky" button
2. A dialog asks for their Bluesky handle
3. A popup window opens with the Bluesky auth URL
4. After authentication in the popup:
   - The popup sends a message to the main window via `window.postMessage`
   - The popup closes itself
5. The main window reacts to the message:
   - Reloads if authentication was successful
   - Redirects to email collection page if needed
   - Displays an error notification if authentication failed

This approach requires complex cross-window communication and has focus management issues that are difficult to resolve across different browsers and platforms.

## New Implementation
The new implementation uses a direct redirect approach that stays within the same window:

1. User clicks "Login with Bluesky" button
2. A dialog asks for their Bluesky handle
3. The current URL is stored in localStorage as `bluesky_auth_return_url`
4. The main window redirects directly to the Bluesky auth URL
5. After authentication, Bluesky redirects back to our callback page
6. The callback page:
   - Processes the authentication response
   - Redirects to the email collection page if needed
   - Otherwise, retrieves the original URL from localStorage and redirects back to it

## Benefits
- Eliminates focus management issues since there's no popup window
- Simplifies the code by removing cross-window communication logic
- Provides a more consistent user experience across different browsers
- Follows the standard OAuth redirect flow pattern that users are familiar with

## Implementation Changes
1. Modified `BlueSkyLoginComponent.vue` to:
   - Store the current URL in localStorage
   - Redirect the main window instead of opening a popup

2. Updated `AuthBlueskyCallbackPage.vue` to:
   - Remove all popup-related logic
   - Retrieve the return URL from localStorage
   - Redirect back to the original page after successful authentication

3. Backend (`auth-bluesky.service.ts` and `auth-bluesky.controller.ts`):
   - No changes needed as they already support redirect-based auth flow

## Testing
The changes have been tested for:
- Successful login flow with existing email
- Login flow requiring email collection
- Error handling during authentication
- Preserving the original page after authentication

## Security Considerations
- The approach remains secure as it follows standard OAuth redirect patterns
- The return URL is stored locally and not transmitted to Bluesky
- The application still verifies the origin of callback requests

## Future Enhancements
- Consider implementing PKCE (Proof Key for Code Exchange) for additional security
- Add option for users to choose between popup and redirect flows
- Improve error messaging for failed authentication scenarios