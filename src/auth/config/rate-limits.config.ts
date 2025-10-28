/**
 * Rate limiting configuration for authentication endpoints
 *
 * These limits are applied per-IP, per-email, per-resource, or composite
 * to prevent abuse while maintaining good UX.
 *
 * Limits are set conservatively for production, higher for development.
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Quick RSVP rate limits
 * Applied to /auth/quick-rsvp endpoint
 */
export const QUICK_RSVP_RATE_LIMITS = {
  /** Per-IP limit: prevents mass signups from single IP */
  perIp: {
    limit: isProduction ? 3 : 10000,
    ttl: 60000, // 1 minute
  },
  /** Per-email limit: prevents spam to single email address */
  perEmail: {
    limit: isProduction ? 5 : 10000,
    ttl: 3600000, // 1 hour
  },
  /** Per-event limit: prevents mass fake RSVPs to single event */
  perEvent: {
    limit: isProduction ? 100 : 10000,
    ttl: 3600000, // 1 hour
  },
  /** Composite email+event: prevents repeated RSVP attempts */
  composite: {
    limit: isProduction ? 3 : 10000,
    ttl: 3600000, // 1 hour
  },
} as const;

/**
 * Email verification code rate limits
 * Applied to /auth/verify-email-code endpoint
 */
export const EMAIL_VERIFICATION_RATE_LIMITS = {
  /** Per-IP limit: prevents brute force code guessing */
  perIp: {
    limit: isProduction ? 5 : 10000,
    ttl: 60000, // 1 minute
  },
  /** Per-email limit: prevents excessive verification attempts */
  perEmail: {
    limit: isProduction ? 10 : 10000,
    ttl: 3600000, // 1 hour
  },
  /** Composite email+code: prevents brute force specific combinations */
  composite: {
    limit: isProduction ? 5 : 10000,
    ttl: 3600000, // 1 hour
  },
} as const;

/**
 * Login code request rate limits
 * Applied to /auth/request-login-code endpoint
 */
export const REQUEST_LOGIN_CODE_RATE_LIMITS = {
  /** Per-IP limit: prevents mass code requests */
  perIp: {
    limit: isProduction ? 3 : 10000,
    ttl: 60000, // 1 minute
  },
  /** Per-email limit: prevents email bombing */
  perEmail: {
    limit: isProduction ? 5 : 10000,
    ttl: 3600000, // 1 hour
  },
} as const;
