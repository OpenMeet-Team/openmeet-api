/**
 * Shared OAuth types for cross-platform authentication
 */

/**
 * Platform type for OAuth callbacks.
 * Used to determine the redirect URL format:
 * - 'android' | 'ios': Custom URL scheme (e.g., net.openmeet.platform:/auth/callback)
 * - 'web' | undefined: Frontend domain (e.g., https://platform.openmeet.net/auth/callback)
 */
export type OAuthPlatform = 'android' | 'ios' | 'web';

/**
 * Data encoded in OAuth state parameter for mobile platforms.
 * This allows passing tenantId and platform without polluting redirect_uri
 * (which OAuth providers require to match exactly).
 */
export interface OAuthStateData {
  tenantId: string;
  platform: OAuthPlatform;
  nonce: string;
}

/**
 * Parse the OAuth state parameter to extract tenantId and platform.
 * The state is a base64-encoded JSON object.
 *
 * @param state - The state parameter from OAuth callback
 * @returns Parsed state data, or null if parsing fails
 */
export function parseOAuthState(state: string): OAuthStateData | null {
  if (!state) return null;

  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    const data = JSON.parse(decoded) as OAuthStateData;

    // Validate required fields
    if (!data.tenantId || !data.platform) {
      return null;
    }

    return data;
  } catch {
    // State might be a simple string (web flow) or malformed
    return null;
  }
}
