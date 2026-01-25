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
