import { AxiosError } from 'axios';
import { PdsApiError } from './pds.errors';

/**
 * Patterns that indicate a service/endpoint is not configured or available.
 * Used for case-insensitive matching against error messages.
 */
export const SERVICE_NOT_CONFIGURED_PATTERNS: readonly string[] = [
  'no service configured',
  'service not configured',
  'not implemented',
  'not available',
  'method not supported',
  'notimplemented', // AT Protocol error code without spaces
];

/**
 * HTTP status code indicating "Not Implemented" - typically used when
 * a server doesn't support the requested method.
 */
const HTTP_STATUS_NOT_IMPLEMENTED = 501;

/**
 * Check if an error indicates that a service or endpoint is not configured/implemented.
 *
 * This function provides robust detection by checking:
 * 1. HTTP status code 501 (Not Implemented)
 * 2. Error message patterns in various formats
 * 3. AxiosError response data (message and error fields)
 * 4. PdsApiError status codes
 *
 * The detection is case-insensitive to handle variations in error messages.
 *
 * @param error - The error to check (can be any type)
 * @returns true if the error indicates a service is not configured/implemented
 *
 * @example
 * ```typescript
 * try {
 *   await pdsAccountService.searchAccountsByEmail(email);
 * } catch (error) {
 *   if (isServiceNotConfiguredError(error)) {
 *     // Fall back to alternative method
 *     return this.findAccountByEmailViaIteration(email);
 *   }
 *   throw error;
 * }
 * ```
 */
export function isServiceNotConfiguredError(error: unknown): boolean {
  // Handle null/undefined
  if (error == null) {
    return false;
  }

  // Must be an object
  if (typeof error !== 'object') {
    return false;
  }

  // Check AxiosError first (may not be instanceof Error in tests)
  if (isAxiosError(error)) {
    // Check HTTP status code 501
    if (error.response?.status === HTTP_STATUS_NOT_IMPLEMENTED) {
      return true;
    }

    // Check response.data for message patterns
    const data = error.response?.data as
      | { message?: string; error?: string }
      | null
      | undefined;

    if (data) {
      // Check data.message
      if (
        typeof data.message === 'string' &&
        matchesServiceNotConfiguredPattern(data.message)
      ) {
        return true;
      }

      // Check data.error (AT Protocol error code)
      if (
        typeof data.error === 'string' &&
        matchesServiceNotConfiguredPattern(data.error)
      ) {
        return true;
      }
    }

    // Check the AxiosError's message property
    if (
      typeof error.message === 'string' &&
      matchesServiceNotConfiguredPattern(error.message)
    ) {
      return true;
    }

    return false;
  }

  // Check PdsApiError status code
  if (error instanceof PdsApiError) {
    if (error.statusCode === HTTP_STATUS_NOT_IMPLEMENTED) {
      return true;
    }
  }

  // Check error.message for patterns (regular Error objects)
  if (error instanceof Error) {
    if (matchesServiceNotConfiguredPattern(error.message)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a message matches any of the "service not configured" patterns.
 * Case-insensitive matching.
 */
function matchesServiceNotConfiguredPattern(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return SERVICE_NOT_CONFIGURED_PATTERNS.some((pattern) =>
    lowerMessage.includes(pattern),
  );
}

/**
 * Type guard for AxiosError.
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}
