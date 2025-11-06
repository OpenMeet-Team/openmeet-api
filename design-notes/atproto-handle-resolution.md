# System Design: ATProto Handle Resolution & Display

**Status:** ✅ PRODUCTION READY
**Implementation Date:** November 2025
**PRs:** #356 (API), #266 (Platform)

## Executive Summary

Shadow users from ATProto platforms (Bluesky) now display with human-readable handles (e.g., `alice.bsky.social`) instead of raw DIDs (`did:plc:abc123...`) throughout OpenMeet. The system resolves handles at display time with 15-minute caching, supports decentralized ATProto, and includes comprehensive security protections.

## Problem & Solution

### Problem
- Shadow users displayed as `did:plc:abc123...` instead of readable handles
- Confusing UX, looked broken
- No support for profile lookups by DID or handle

### Solution
1. **Shadow account creation** resolves DID → handle before storing
2. **Profile lookups** accept slug, DID, or handle as identifier
3. **Activity feeds** batch-resolve handles at display time
4. **ElastiCache** provides 15-min shared caching (>95% hit rate expected)
5. **Database migrations** backfill existing shadow users

## Architecture Decisions

### 1. Handle Resolution Strategy

**Decision:** Resolve at display time, not storage time (for activity feeds)

**Rationale:**
- ✅ Always shows current handle (even if user changes it)
- ✅ Avoids stale data in historical activity feed
- ✅ Single source of truth (ATProto network)
- ❌ Requires external API calls (mitigated by caching)

**Caching:** 15-minute TTL balances freshness vs. load

### 2. Cache Key Design

**Decision:** Use SHA-256 hash of DID for cache keys

**Rationale:**
- ✅ Prevents cache poisoning attacks
- ✅ Prevents key collisions
- ✅ No injection vulnerabilities (null bytes, escape sequences)
- ✅ Deterministic (same DID = same cache key)

**Format:** `atproto:handle:<sha256(did)>`

### 3. Tenant-Agnostic Cache

**Decision:** No tenant ID in cache keys

**Rationale:**
- ✅ DIDs are globally unique (no collision risk)
- ✅ Reduces cache overhead (one entry per DID, not per tenant per DID)
- ✅ Cache warming benefits all tenants
- ✅ Simpler key structure

### 4. SSRF Protection Strategy

**Decision:** Permissive by default (allow any public PDS), with optional strict mode

**Rationale:**
- ✅ Supports decentralized ATProto (users can run their own PDS)
- ✅ IP blocklist provides real SSRF protection (blocks internal networks)
- ✅ Optional domain allowlist for enterprise security requirements
- ✅ Aligns with ATProto's decentralized philosophy

**Configuration:**
- **Default (permissive):** Allow any public domain, block internal IPs
- **Strict mode:** Set `ATPROTO_ALLOWED_PDS_DOMAINS` env var to restrict domains

**IP Blocklist:**
- `127.0.0.0/8` - Loopback
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` - Private networks
- `169.254.0.0/16` - AWS metadata endpoint
- `0.0.0.0/8`, `224.0.0.0/4`, `240.0.0.0/4` - Reserved ranges

### 5. Database Index Decision

**Decision:** Do NOT add composite index on `(socialId, provider)`

**Rationale:**
- ❌ Only 4.3% performance improvement (16ms at p95)
- ❌ Not worth the overhead (storage, slower writes, maintenance)
- ✅ Existing single-column `socialId` index is sufficient
- ✅ Query planner can effectively use single-column index with `AND provider=?`

**Evidence:** k6 load testing showed baseline p95=370ms, with composite index p95=354ms

### 6. Migration Strategy

**Decision:** Two migrations with different transaction strategies

**Shadow User Migration (1762347421000):**
- **No transaction** (best-effort approach)
- Continues if individual users fail
- Safe to re-run (idempotent - only updates DIDs)
- Depends on external ATProto API (failures expected)

**Activity Feed Migration (1762347422000):**
- **With transaction** (atomic approach)
- Single bulk UPDATE from users table
- No external APIs (copies existing data)
- Rollback on any error

**Rationale:** Different strategies for different migration characteristics

## Security Features

### 1. ElastiCache Graceful Degradation

**Issue:** Redis failures would crash activity feeds
**Solution:** All cache operations return null/void instead of throwing
**Impact:** Activity feeds show DIDs as fallback when cache unavailable

### 2. SSRF Protection

**Issue:** Malicious DID documents could point to internal services
**Solution:** PDS endpoint validation with IP blocklist + optional domain allowlist
**Impact:** Prevents internal network scanning, supports self-hosted PDS

### 3. Cache Poisoning Prevention

**Issue:** Malicious DIDs could inject invalid data or create collisions
**Solution:** DID format validation + SHA-256 hashed cache keys
**Impact:** Prevents injection attacks and key collisions

### 4. Rate Limiting

**Issue:** Public endpoints vulnerable to DDoS and enumeration
**Solution:** 20 requests/minute on public profile endpoints
**Impact:** Prevents abuse while allowing legitimate usage

### 5. API Call Timeouts

**Issue:** Slow/malicious PDS servers could hold connections indefinitely
**Solution:** Promise.race timeouts (3-10s depending on operation)
**Impact:** Prevents resource exhaustion from hanging connections

**Timeouts:**
- Handle resolution: 5 seconds
- Profile fetch: 10 seconds
- DID resolution: 3 seconds

## Implementation Overview

### Phase 1: Shadow Account Creation
- Shadow accounts resolve DID → handle before storing in `firstName`
- Graceful fallback to DID if resolution fails
- Only applies to Bluesky provider

### Phase 2: ATProto Handle Cache Service
- ElastiCache-backed caching with 15-minute TTL
- Prometheus metrics for monitoring
- Batch resolution for activity feeds
- DID validation and secure cache keys

### Phase 3: Multi-Identifier Profile Lookup
- `UserService.findByIdentifier()` accepts slug, DID, or handle
- Automatic identifier type detection (DID > Handle > Slug)
- Public endpoint at `/api/v1/users/:identifier/profile`

### Phase 4: Activity Feed Handle Resolution
- Batch DID → handle resolution for feed items
- Adds optional `displayName` field to activity entities
- Backward compatible (falls back to `metadata.actorName`)

### Phase 5: Data Migration
- **Part A:** Backfill shadow user `firstName` with resolved handles
- **Part B:** Backfill activity feed metadata `actorName` fields
- Idempotent (safe to re-run)
- Comprehensive progress reporting

### Phase 6: Frontend Integration (PR #266)
- Created `useDisplayName` composable for consistent display
- Fixed Vue Router to accept DIDs in URLs (`:slug([^/]+)` pattern)
- Updated activity feed components to use composable

### Phase 7: Production Hardening
- Fixed ElastiCache error handling for graceful degradation
- Added SSRF protection with configurable PDS allowlist
- Implemented cache poisoning prevention
- Added rate limiting and API timeouts
- Documented migration transaction strategies

### Phase 8: Stable URL Identifiers (PR #360, PR #267)
- **Problem:** Activity feeds used display names (handles) in URLs, which could break if handles changed
- **Solution:** All user profile links now use stable identifiers (DIDs for Bluesky, slugs for others)
- **Architecture:**
  - URLs: Use stable identifiers (never change)
  - Display: Show friendly names (handles/names)
  - Separation of concerns: identity vs. presentation
- **Changes:**
  - API exposes `provider`, `socialId`, `isShadowAccount` fields publicly
  - Frontend `useUserIdentifier` composable determines URL strategy
  - All activity feed components updated for consistency
  - Event "Hosted by" and attendee links use stable identifiers
- **Display Name Strategy:**
  - Shadow accounts: Show handle (e.g., "smokesignal.events")
  - Connected Bluesky users: Show custom name (e.g., "Tom Scanlan") - respects user choice
  - Regular users: Show firstName + lastName

## Configuration

### Environment Variables

```bash
# Optional: Restrict allowed PDS domains (default: allow any public domain)
# Leave unset to support decentralized ATProto
ATPROTO_ALLOWED_PDS_DOMAINS=bsky.network,bsky.social,custom.pds.com

# ElastiCache Configuration (required)
ELASTICACHE_HOST=redis-endpoint
ELASTICACHE_PORT=6379
ELASTICACHE_TLS=true  # MUST be true in production
ELASTICACHE_AUTH=true  # MUST be true in production
ELASTICACHE_REJECT_UNAUTHORIZED=true  # MUST be true in production
ELASTICACHE_TOKEN=<secure-token>
```

### Monitoring

**Prometheus Metrics:**
- `atproto_handle_cache_hits_total` - Cache hit count
- `atproto_handle_cache_misses_total` - Cache miss count
- `atproto_handle_resolution_errors_total` - Resolution error count
- `atproto_handle_resolution_duration_seconds` - Resolution latency histogram

**Alerts:**
- Cache hit rate < 90% (warning) / < 80% (critical)
- Resolution errors > 5% (critical)
- Resolution latency p95 > 500ms (warning) / > 1s (critical)

## Performance

### Expected Metrics
- **Cache hit rate:** >95%
- **Cached resolution:** <50ms p95
- **Uncached resolution:** <500ms p95
- **Error rate:** <1%

### Load Testing Results (k6)
- **DID lookups:** p95=370ms (baseline without index)
- **Slug lookups:** p95=40.6ms (existing index)
- **Handle lookups:** p95=13.5ms
- **Composite index improvement:** 4.3% (not worth overhead)

## API Changes

### Profile Lookup Endpoint

**Before:** Only accepted slug
```
GET /api/v1/users/:slug/profile
```

**After:** Accepts slug, DID, or handle
```
GET /api/v1/users/:identifier/profile

Examples:
- /api/v1/users/alice-abc123/profile (slug)
- /api/v1/users/did:plc:abc123/profile (DID)
- /api/v1/users/alice.bsky.social/profile (handle)
- /api/v1/users/@alice.bsky.social/profile (handle with @)
```

### User Entity Fields (Phase 8)

**Before:** provider/socialId/isShadowAccount restricted to 'me'/'admin' serialization groups
```json
{
  "slug": "alice-abc123",
  "name": "Alice Smith"
}
```

**After:** Fields exposed publicly for stable URL generation
```json
{
  "slug": "alice-abc123",
  "name": "Alice Smith",
  "provider": "bluesky",
  "socialId": "did:plc:abc123",
  "isShadowAccount": true
}
```

**Rationale:** These fields are not sensitive (just auth method + public DID) and needed by frontend to determine URL strategy.

### Activity Feed Response

**Added optional field:**
```typescript
{
  displayName?: string  // Resolved handle (e.g., "alice.bsky.social")
  actor?: UserEntity    // Full user object with provider/socialId fields
}
```

Frontend priority:
1. `activity.displayName` (backend-resolved, always fresh)
2. `activity.metadata.actorName` (legacy fallback)
3. `"Someone"` (graceful degradation)

## Testing

### Test Coverage
- **Unit tests:** 994/994 passing
- **ATProto cache tests:** 12/12 passing
- **Shadow account tests:** 15/15 passing
- **E2E tests:** 13/13 passing

### Manual Testing
See `design-notes/atproto-handle-resolution-manual-tests.md` for manual test scenarios

## Deployment Checklist

### Pre-Deployment
- [x] All critical security issues fixed
- [x] 994/994 tests passing
- [x] Graceful degradation verified
- [x] Rate limiting configured
- [ ] Environment variables configured
- [ ] AWS Security Group egress filtering configured
- [ ] Prometheus alerts configured

### Deployment Steps
1. Deploy to staging
2. Run migrations during low-traffic window
3. Monitor metrics for 24 hours
4. Deploy to production

### Post-Deployment Monitoring
- Cache hit rate should stabilize at >90% within 1 hour
- Resolution errors should be <5%
- No Redis connection errors in logs
- Activity feeds load normally

## Future Enhancements

### Potential Improvements (not required for MVP)
1. **Cache warming:** Preload frequently-viewed handles on startup
2. **Request coalescing:** Deduplicate concurrent requests for same DID
3. **ATProto webhooks:** Listen for handle change events for proactive invalidation
4. **Redis MGET optimization:** Batch cache lookups with single Redis command
5. **Circuit breaker:** Implement circuit breaker pattern for ATProto API failures

### Not Planned
- Composite database index (tested, insufficient benefit)
- Transaction wrapper for user migration (best-effort is more resilient)

## Known Limitations

1. **Handle changes:** Up to 15-minute delay before new handle appears (cache TTL)
2. **Activity feed metadata:** Historical entries may have stale handles (by design)
3. **ATProto API dependency:** Failures fall back to showing DIDs
4. **Migration reversibility:** Migrations cannot be automatically reversed (documented in migration files)

## Key Files

### Backend (openmeet-api)
- `src/bluesky/atproto-handle-cache.service.ts` - Caching service
- `src/bluesky/bluesky-identity.service.ts` - ATProto identity resolution
- `src/shadow-account/shadow-account.service.ts` - Shadow account creation
- `src/user/user.service.ts` - Multi-identifier profile lookup
- `src/activity-feed/activity-feed.service.ts` - Batch handle resolution
- `src/database/migrations/1762347421000-BackfillShadowUserHandles.ts` - User migration
- `src/database/migrations/1762347422000-BackfillActivityFeedMetadataHandles.ts` - Activity feed migration

### Frontend (openmeet-platform)
- `src/composables/useDisplayName.ts` - Display name resolution composable
- `src/composables/useUserIdentifier.ts` - Stable URL identifier resolution (Phase 8)
- `src/types/activity-feed.ts` - Activity feed type definitions
- `src/router/routes.ts` - DID-compatible route patterns
- `src/components/activity-feed/SitewideFeedComponent.vue` - Updated for stable URLs
- `src/components/group/GroupActivityFeedComponent.vue` - Updated for stable URLs
- `src/components/event/EventActivityFeedComponent.vue` - Updated for stable URLs
- `src/components/event/EventLeadComponent.vue` - Uses stable identifiers
- `src/components/event/EventAttendeesComponent.vue` - Uses stable identifiers

## Lessons Learned

### What Went Well
1. **Incremental approach:** 7 phases made implementation manageable
2. **Test coverage:** Comprehensive tests caught issues early
3. **Metrics:** Prometheus integration provides production visibility
4. **Performance testing:** k6 tests validated design decisions
5. **Security-first:** Comprehensive review caught critical vulnerabilities

### What Could Be Improved
1. **Circular dependencies:** Had to use `forwardRef()` - consider refactoring module boundaries
2. **Code duplication:** Similar display logic in multiple activity feed components (mitigated by composable)
3. **Migration complexity:** Two-part migration could be confusing for operators

### Architecture Insights
1. **Graceful degradation is essential** for external API dependencies
2. **IP-based SSRF protection** is more effective than domain allowlists
3. **Best-effort migrations** are more resilient than atomic migrations for external API-dependent operations
4. **Cache key hashing** prevents entire class of security vulnerabilities
5. **Decentralized protocols** require flexible security policies

## References

- **ATProto Specification:** https://atproto.com/specs/atp
- **DID Specification:** https://www.w3.org/TR/did-core/
- **@atproto/identity:** npm package for DID/handle resolution
- **@atproto/api:** npm package for ATProto API client

## Document History

- **2025-11-04:** Initial implementation (Phases 1-4)
- **2025-11-05:** Data migrations and bug fixes (Phases 5-7)
- **2025-11-05:** Security hardening and production readiness
- **2025-11-06:** Phase 8 - Stable URL identifiers implementation (PR #360, #267)

---

**Document Status:** ✅ COMPLETE (Phase 8 deployed)
**Next Review:** After 30 days in production
**Owner:** Engineering Team
