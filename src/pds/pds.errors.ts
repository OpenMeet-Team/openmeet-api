/**
 * Error thrown when a PDS API call fails.
 *
 * Contains the HTTP status code and AT Protocol error code if available.
 */
export class PdsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly atError?: string,
  ) {
    super(message);
    this.name = 'PdsApiError';
  }
}

/**
 * Error thrown when credential decryption fails.
 *
 * This can occur when:
 * - The key version is unknown
 * - KEY_2 is required but not configured
 * - The ciphertext is corrupted or tampered with
 */
export class PdsCredentialDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdsCredentialDecryptionError';
  }
}

/**
 * Error thrown when PDS session operations fail.
 *
 * This can occur when:
 * - The PDS is unavailable
 * - Credentials are invalid or expired
 * - Session restoration fails
 */
export class PdsSessionError extends Error {
  constructor(
    message: string,
    public readonly cause?: string,
    public readonly isRecoverable: boolean = true,
  ) {
    super(message);
    this.name = 'PdsSessionError';
  }
}

/**
 * Error thrown when a session cannot be obtained for an AT Protocol identity.
 *
 * This specifically indicates that the user needs to re-link their account
 * via OAuth. Common scenarios:
 * - Orphan account: User took ownership of custodial account but no OAuth session exists
 * - OAuth session expired: User's OAuth session in Redis has expired and needs refresh
 *
 * The `needsOAuthLink` flag indicates the user should be prompted to
 * re-authenticate via the AT Protocol OAuth flow.
 */
export class SessionUnavailableError extends Error {
  constructor(
    message: string,
    public readonly needsOAuthLink: boolean = true,
    public readonly did?: string,
  ) {
    super(message);
    this.name = 'SessionUnavailableError';
  }
}
