# Multi-Layer Throttler Guard - Usage Examples

The `MultiLayerThrottlerGuard` provides flexible, reusable rate limiting for passwordless authentication flows.

## Features

- **Per-IP throttling** (inherited from NestJS ThrottlerGuard)
- **Per-email throttling** (prevents email bombing)
- **Per-resource throttling** (prevents resource flooding)
- **Composite throttling** (prevents spamming specific combinations)
- **Redis-backed** (works across multiple server instances)
- **Fail-open** (allows requests if Redis is down, preventing total outage)

## Current Usage

### 1. Quick RSVP (Event Registration)

```typescript
@Post('quick-rsvp')
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute per IP
@RateLimit({
  email: { limit: 5, ttl: 3600 }, // 5 per hour per email
  resource: { limit: 100, ttl: 3600, field: 'eventSlug', keyPrefix: 'event' }, // 100 per hour per event
  composite: { limit: 3, ttl: 3600, fields: ['email', 'eventSlug'], keyPrefix: 'user_event' }, // 3 per hour per user+event
})
async quickRsvp(@Body() dto: QuickRsvpDto) { }
```

**Protection Layers:**
- IP: 3 requests/min (prevents automated attacks from single IP)
- Email: 5 requests/hour (prevents email bombing)
- Event: 100 requests/hour (prevents event flooding)
- User+Event: 3 requests/hour (prevents retry spam for specific event)

### 2. Request Login Code (Passwordless Login)

```typescript
@Post('request-login-code')
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute per IP
@RateLimit({
  email: { limit: 5, ttl: 3600 }, // 5 per hour per email
})
async requestLoginCode(@Body() dto: RequestLoginCodeDto) { }
```

**Protection Layers:**
- IP: 3 requests/min
- Email: 5 requests/hour (prevents sending too many login codes to same email)

### 3. Verify Email Code

```typescript
@Post('verify-email-code')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute per IP
@RateLimit({
  email: { limit: 10, ttl: 3600 }, // 10 per hour per email (allows retries)
  composite: { limit: 5, ttl: 3600, fields: ['email', 'code'], keyPrefix: 'email_code' }, // 5 per hour per code
})
async verifyEmailCode(@Body() dto: VerifyEmailCodeDto) { }
```

**Protection Layers:**
- IP: 5 requests/min
- Email: 10 requests/hour (generous limit for legitimate retries)
- Email+Code: 5 requests/hour (prevents brute force on specific codes)

## Future Usage Examples

### 4. Quick Group Join (Passwordless Group Membership)

```typescript
@Post('quick-group-join')
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 per minute per IP
@RateLimit({
  email: { limit: 5, ttl: 3600 }, // 5 per hour per email
  resource: { limit: 50, ttl: 3600, field: 'groupSlug', keyPrefix: 'group' }, // 50 per hour per group
  composite: { limit: 3, ttl: 3600, fields: ['email', 'groupSlug'], keyPrefix: 'user_group' }, // 3 per hour per user+group
})
async quickGroupJoin(@Body() dto: QuickGroupJoinDto) {
  // Implementation similar to quickRsvp
}
```

### 5. Newsletter Subscription

```typescript
@Post('subscribe-newsletter')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@RateLimit({
  email: { limit: 3, ttl: 86400 }, // 3 per day per email (prevent abuse)
})
async subscribeNewsletter(@Body() dto: SubscribeDto) { }
```

### 6. Invite Friend to Event

```typescript
@Post('invite-friend')
@Throttle({ default: { limit: 10, ttl: 60000 } })
@RateLimit({
  email: { limit: 20, ttl: 3600, field: 'senderEmail' }, // Sender can invite 20 people/hour
  resource: { limit: 100, ttl: 3600, field: 'eventSlug', keyPrefix: 'event_invites' }, // Max 100 invites/hour per event
  composite: { limit: 5, ttl: 3600, fields: ['senderEmail', 'recipientEmail'], keyPrefix: 'sender_recipient' }, // Can't spam same recipient
})
async inviteFriend(@Body() dto: InviteFriendDto) { }
```

## Configuration Options

### Email Rate Limit

```typescript
email: {
  limit: number;      // Max requests allowed
  ttl: number;        // Time window in seconds
  field?: string;     // Field name in request body (default: 'email')
}
```

### Resource Rate Limit

```typescript
resource: {
  limit: number;      // Max requests allowed
  ttl: number;        // Time window in seconds
  field: string;      // Field name in request body (e.g., 'eventSlug', 'groupSlug')
  keyPrefix: string;  // Redis key prefix (e.g., 'event', 'group')
}
```

### Composite Rate Limit

```typescript
composite: {
  limit: number;       // Max requests allowed
  ttl: number;         // Time window in seconds
  fields: string[];    // Fields to combine (e.g., ['email', 'eventSlug'])
  keyPrefix: string;   // Redis key prefix (e.g., 'user_event')
}
```

## Redis Key Format

Keys are automatically generated in the format:

```
ratelimit:{type}:{value}
```

Examples:
- `ratelimit:email:user@example.com`
- `ratelimit:event:summer-party-2024`
- `ratelimit:user_event:user@example.com:summer-party-2024`

## Error Messages

The guard provides user-friendly error messages:

```
"Too many attempts for this email. Please try again in 1 hour."
"This resource is receiving too many requests. Please try again in 30 minutes."
"Too many attempts for this combination. Please try again in 15 minutes."
```

## Monitoring & Observability

Rate limit checks that fail (e.g., Redis down) are logged to console:

```
Rate limit check failed for key ratelimit:email:user@example.com: Error: ...
```

In production, these should be sent to your logging/monitoring system (DataDog, Sentry, etc.)

## Testing

When testing locally, rate limits can be bypassed by:

1. **Clearing Redis**: `redis-cli FLUSHDB`
2. **Waiting for TTL**: Keys auto-expire after the TTL window
3. **Using different values**: Different emails, events, etc. have separate rate limits

## Performance Considerations

- Each rate limit check = 1-2 Redis operations (GET + SET)
- Quick RSVP with all 4 layers = ~6-8 Redis ops per request
- Redis operations are async and typically < 5ms
- Fails open if Redis is down (allows traffic)

## Security Best Practices

1. **Always use IP + email throttling together** - One layer alone is not enough
2. **Set resource limits** - Prevent event/group flooding attacks
3. **Use composite limits** - Prevent user from spamming same resource
4. **Monitor rate limit hits** - Track how often limits are hit (indicates attack or UX issue)
5. **Adjust limits based on usage patterns** - Too strict = bad UX, too loose = vulnerable
