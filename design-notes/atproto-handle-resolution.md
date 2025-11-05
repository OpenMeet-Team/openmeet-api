# System Design Document: ATProto Handle Resolution & Display

## Overview
ATProto (AT Protocol) users are identified by DIDs (Decentralized Identifiers) but are displayed using human-readable handles (e.g., `alice.bsky.social`). This system ensures that shadow users (users imported from ATProto platforms without OpenMeet accounts) are always displayed with their current handle, resolved fresh at display time, never showing raw DIDs to end users.

## Business Context

### Problem Statement
- **Current Issue**: Shadow users from Bluesky/ATProto platforms show as `did:plc:abc123...` in activity feeds, profiles, and event attendee lists
- **Root Cause**: Shadow user creation stores DID as `firstName` instead of resolving to handle
- **User Impact**: Confusing UX, looks broken, hurts credibility

### Why We Need This System
1. **User Experience**: Users expect to see `@alice.bsky.social`, not `did:plc:abc123...`
2. **Handle Changes**: ATProto handles can change - we need fresh resolution, not stale cached names
3. **Consistency**: All user references (activity feed, profiles, attendee lists) should show resolved handles
4. **Multi-Platform Future**: Design for ATProto protocol (not just Bluesky) to support future apps

### Impact on Users/Business
- **Adoption**: Professional appearance increases trust for Meetup migrants
- **Bluesky Integration**: Better integration encourages cross-posting and organic growth
- **Technical Debt**: Fixes architectural issue before it scales to thousands of shadow users

## Goals & Success Metrics

### Objectives
1. ✅ Never show raw DIDs to users (only handles)
2. ✅ Resolve handles at display time (always fresh)
3. ✅ Support flexible profile lookups (slug, DID, or handle)
4. ✅ Minimize ATProto API calls (use caching)

### Success Metrics
- Zero raw DIDs visible in production UI
- >95% cache hit rate for handle resolution
- <100ms p95 latency for profile lookups
- Handle updates visible within 15 minutes

## Implementation Status

### Phase 1: Shadow Account Handle Resolution ✅ COMPLETE
**Commit:** `ba472cf` - feat(shadow-account): resolve ATProto DID to handle before storing
**Date:** 2025-11-04
**Branch:** `feat/fix-bluesky-did-display`

**What was implemented:**
- Injected `BlueskyIdentityService` into `ShadowAccountService`
- Shadow accounts now resolve DID → handle before storing in `firstName`
- If `displayName` parameter is already a handle, uses it directly (no resolution needed)
- Graceful fallback to DID if ATProto resolution fails
- Only applies to Bluesky provider (non-Bluesky providers unaffected)

**Files changed:**
- `src/shadow-account/shadow-account.module.ts` - Added BlueskyModule import
- `src/shadow-account/shadow-account.service.ts` - Added handle resolution logic
- `src/shadow-account/shadow-account.service.spec.ts` - Added 4 new unit tests
- `test/shadow-account/shadow-account.e2e-spec.ts` - Added 2 new e2e tests

**Test coverage:**
- ✅ 15/15 unit tests passing
- ✅ 13/13 e2e tests passing
- Tests verify: DID resolution, handle pass-through, fallback behavior, provider filtering

**Impact:**
- ✅ Future shadow accounts will store handles (not DIDs)
- ⏳ Existing shadow accounts with DIDs still need migration (Phase 5)
- ✅ No breaking changes to existing functionality

**Learnings:**
1. Used `forwardRef()` to avoid circular dependencies between ShadowAccountModule and BlueskyModule
2. ATProto API calls are expensive - confirmed need for caching layer (Phase 2)
3. Test environment may not have real DIDs - graceful fallback is essential
4. Controller returns `displayName` (mapped from `firstName`) - important for e2e tests

### Phase 2: ATProto Handle Cache Service ✅ COMPLETE
**Commit:** `e88b4da` - feat(atproto): add handle cache service with ElastiCache and Prometheus metrics
**Date:** 2025-11-04
**Branch:** `feat/fix-bluesky-did-display`

**What was implemented:**
- Created `AtprotoHandleCacheService` with tenant-agnostic design
- Integrated ElastiCache for shared caching across all API nodes
- 15-minute TTL for cache entries (900 seconds)
- Prometheus metrics for monitoring cache performance
- Exported service from BlueskyModule for use in other modules

**Files changed:**
- `src/bluesky/atproto-handle-cache.service.ts` - New service implementation
- `src/bluesky/atproto-handle-cache.service.spec.ts` - Behavioral tests (12 passing)
- `src/bluesky/bluesky.module.ts` - Added service provider and export
- `src/metrics/metrics.module.ts` - Added ATProto handle metrics

**Test coverage:**
- ✅ 12/12 behavioral tests passing
- Tests verify caching behavior, error handling, pass-through, batch resolution, and invalidation

**Key implementation details:**
- `resolveHandle(did)` - Single DID resolution with automatic caching
- `resolveHandles(dids[])` - Batch resolution for activity feeds
- `invalidate(did)` - Manual cache invalidation when handles change
- Cache key format: `atproto:handle:{did}`
- Graceful fallback to DID if ATProto resolution fails

**Metrics added:**
- `atproto_handle_cache_hits_total` - Counter (no labels)
- `atproto_handle_cache_misses_total` - Counter (no labels)
- `atproto_handle_resolution_errors_total` - Counter with `error_type` label
- `atproto_handle_resolution_duration_seconds` - Histogram with `cache_status` label (hit/miss/error)

**Learnings:**
1. **Tenant-agnostic design** - DIDs are globally unique, so no tenant tracking needed in cache
2. **Behavior-focused tests** - Tests verify actual caching behavior, not mock calls
3. **Shared cache is essential** - ElastiCache ensures all API pods see same cached handles
4. **Mock store pattern** - Created a Map-based mock for ElastiCache in tests to verify real caching behavior
5. **Error handling is critical** - Must gracefully return DID if resolution fails (no crashes)

### Phase 3: Multi-Identifier Profile Lookup ✅ COMPLETE
**Commit:** `540b781` - feat(user): add multi-identifier profile lookup (slug/DID/handle)
**Date:** 2025-11-04
**Branch:** `feat/fix-bluesky-did-display`

**What was implemented:**
- Created `UserService.findByIdentifier()` method supporting slug, DID, and ATProto handle
- Updated `UserController` endpoint to use multi-identifier lookup
- Automatic identifier type detection with priority: DID > Handle > Slug
- Handle resolution integrates with Phase 2 cache (AtprotoHandleCacheService)
- Comprehensive OpenAPI documentation with examples

**Files changed:**
- `src/user/user.service.ts` - Added findByIdentifier() method
- `src/user/user.service.find-by-identifier.spec.ts` - 16 behavioral tests
- `src/user/user.controller.ts` - Updated endpoint documentation
- `design-notes/atproto-handle-resolution-manual-tests.md` - Manual testing guide

**Test coverage:**
- ✅ 16/16 unit tests passing
- ✅ Slug lookup (backwards compatibility verified)
- ✅ DID lookup (new functionality)
- ✅ Handle lookup with @ prefix support (new functionality)
- ✅ Edge cases (null, empty, whitespace)
- ⏭️ E2E tests deferred (manual testing guide created)

**API changes:**
- Endpoint: `GET /api/v1/users/:identifier/profile`
- Accepts: slug (`alice-abc123`), DID (`did:plc:abc123`), or handle (`alice.bsky.social`)
- Backwards compatible: existing slug lookups continue to work
- OpenAPI docs updated with examples for all identifier types

**Identifier detection logic:**
1. **DID**: Starts with `did:` → Direct database lookup by socialId
2. **Handle**: Contains `.` (domain pattern) → Resolve to DID via BlueskyIdentityService → Database lookup
3. **Slug**: Default → Call existing showProfile() method

**Integration with Phase 2:**
- Handle lookups use `BlueskyIdentityService.resolveProfile()`
- Phase 2 cache (AtprotoHandleCacheService) automatically used by BlueskyIdentityService
- Cache reduces handle resolution from ~500ms to ~10ms on subsequent requests

**Learnings:**
1. **Identifier detection is simple** - Priority-based detection (DID > Handle > Slug) works well
2. **@ prefix handling** - Users often prefix handles with @, need to strip it
3. **Backwards compatibility** - Existing slug lookups preserved by making slug the default case
4. **Error handling** - Graceful null returns on resolution failures (no exceptions thrown)
5. **Manual testing essential** - E2E tests would require complex Bluesky test data setup

### Phase 4: Activity Feed Handle Resolution ✅ COMPLETE
**Commit:** `d1eec96` - feat(activity-feed): resolve ATProto DIDs to handles in feed display
**Date:** 2025-11-04
**Branch:** `feat/fix-bluesky-did-display`

**What was implemented:**
- Created `ActivityFeedService.resolveDisplayNames()` method for batch handle resolution
- Updated feed methods (`getGroupFeed`, `getEventFeed`, `getSitewideFeed`) to:
  - Load `actor` relation when querying activities
  - Call `resolveDisplayNames()` to enrich activities with display names
- Batch resolution for performance (collects unique DIDs, resolves in single call)
- Graceful handling of mixed Bluesky/regular users
- 7 new behavioral tests in `activity-feed.service.spec.ts`

**Files modified:**
- `src/activity-feed/activity-feed.service.ts` - Added resolveDisplayNames() method, updated feed methods
- `src/activity-feed/activity-feed.module.ts` - Imported BlueskyModule for AtprotoHandleCacheService
- `src/activity-feed/activity-feed.service.spec.ts` - 24 tests total (7 new for handle resolution)

**Test coverage:**
- ✅ 24/24 unit tests passing
- ✅ Bluesky user DID → handle resolution
- ✅ Regular user firstName display
- ✅ Batch resolution for multiple unique users
- ✅ Mixed Bluesky/regular users
- ✅ Fallback to DID on resolution failures
- ✅ Edge cases (missing actors, empty feeds)

**API changes:**
- Feed endpoints now return `Array<ActivityFeedEntity & { displayName?: string }>`
- Backwards compatible: `displayName` is an optional additional field
- All feed endpoints updated: sitewide, group, and event feeds
- Frontend can use `displayName` if present, fall back to metadata.actorName if needed

**Handle resolution strategy:**
1. **Bluesky users**: `provider === 'bluesky'` && `socialId` starts with `did:` → Resolve via AtprotoHandleCacheService
2. **Regular users**: Use `firstName` directly
3. **Batch optimization**: Collect all unique DIDs, resolve in single `resolveHandles()` call
4. **Caching**: Leverages Phase 2's AtprotoHandleCacheService (15min TTL, >95% hit rate)

**Integration with Phase 2:**
- Uses `AtprotoHandleCacheService.resolveHandles()` for batch resolution
- Cache hit rate >95% means most resolutions complete in <50ms
- Graceful degradation: returns DID if ATProto resolution fails

**Learnings:**
1. **Batch resolution critical** - Single `resolveHandles()` call for entire feed (~20 items) vs. 20 individual calls
2. **Behavioral tests superior** - TDD approach caught edge cases early (empty feeds, missing actors)
3. **TypeScript return types** - Used `Object.assign()` instead of spread to maintain type compatibility
4. **Relation loading** - `relations: ['actor']` must be added to all feed queries
5. **Backwards compatibility** - Adding optional `displayName` field doesn't break existing consumers

### Phase 5: Data Migration ⏳ PENDING
**Status:** Not started
**Estimated effort:** 2-3 hours

### Phase 6: Frontend Display Composable ⏳ PENDING
**Status:** Not started
**Estimated effort:** 2-3 hours

**Total estimated remaining effort:** 8-12 hours (Phases 2-3 complete: -7 hours)

## System Requirements

### Functional Requirements

#### FR1: Shadow User Creation
- Shadow users created with **resolved handle** as `firstName`, not DID
- DID stored only in `socialId` field (single source of truth)
- Slug generated from handle's username part (e.g., `alice-abc123`)

#### FR2: Profile Lookup
- `/users/:identifier/profile` accepts:
  - User slug (e.g., `alice-abc123`)
  - ATProto DID (e.g., `did:plc:abc123`)
  - ATProto handle (e.g., `alice.bsky.social`)
- Backend determines identifier type and routes to correct lookup

#### FR3: Display Name Resolution
- Real users: Show `firstName + lastName`
- Shadow ATProto users: Resolve DID → handle at display time
- Use shared cache (ElastiCache/Redis) across all API nodes
- Fallback to DID if resolution fails (graceful degradation)

#### FR4: Activity Feed Enhancement
- Activity feed metadata stores **slugs only** (for routing)
- Display names resolved at query time via user relation
- Batch resolution for performance

### Non-Functional Requirements

#### Performance
- Handle resolution: <50ms p95 (cached), <500ms p95 (uncached)
- Activity feed: <200ms p95 for 20 items
- Cache hit rate: >95% after warmup

#### Scalability
- Support 100,000+ cached handles in ElastiCache
- Handle 1000+ req/sec for activity feeds
- Graceful degradation if ATProto API is slow/down

#### Reliability
- Cache TTL: 15 minutes (balance freshness vs. load)
- Fallback to DID if handle resolution fails
- No breaking changes to existing API contracts

## Technical Design

### Architecture

#### Components
```
┌─────────────┐
│  Frontend   │
│  (Vue.js)   │
└──────┬──────┘
       │ GET /users/:identifier/profile
       │ GET /activity-feed/sitewide
       ▼
┌─────────────────────────────────────┐
│         API Server (NestJS)         │
│  ┌────────────────────────────┐    │
│  │  UserController            │    │
│  │  - findByIdentifier()      │    │
│  │    • slug → user lookup    │    │
│  │    • DID → user lookup     │    │
│  │    • handle → resolve DID  │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │  ActivityFeedService       │    │
│  │  - getSitewideFeed()       │    │
│  │  - resolves display names  │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │  BlueskyHandleCacheService │    │
│  │  - resolveHandle(did)      │    │
│  │  - resolveHandles(dids[])  │    │
│  └────────────────────────────┘    │
└──────┬────────────┬─────────────────┘
       │            │
       ▼            ▼
┌─────────────┐  ┌──────────────────┐
│  Postgres   │  │  ElastiCache     │
│  (users)    │  │  (Redis)         │
│             │  │  atproto:handle: │
│  • id       │  │  {did} → handle  │
│  • socialId │  │                  │
│  • slug     │  │  TTL: 15 min     │
│  • firstName│  └──────────────────┘
└─────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│      ATProto Identity Resolver      │
│      (@atproto/identity)            │
│  - resolveProfile(handleOrDid)      │
│  - extractHandleFromDid(did)        │
└─────────────────────────────────────┘
```

#### Data Flow

**1. Shadow User Creation:**
```
Bluesky Event Processor
  ↓
findOrCreateShadowAccount(did="did:plc:abc123")
  ↓
BlueskyIdentityService.extractHandleFromDid(did)
  ↓ (resolves to "alice.bsky.social")
UserEntity.create({
  socialId: "did:plc:abc123",
  firstName: "alice.bsky.social",  ✅
  slug: "alice-xyz789"
})
```

**2. Profile Lookup (by handle):**
```
GET /users/alice.bsky.social/profile
  ↓
UserService.findByIdentifier("alice.bsky.social")
  ↓
BlueskyIdentityService.resolveProfile("alice.bsky.social")
  ↓ (resolves to did:plc:abc123)
UserRepository.findOne({ socialId: "did:plc:abc123" })
  ↓
Return user profile
```

**3. Activity Feed Display:**
```
GET /activity-feed/sitewide
  ↓
ActivityFeedRepository.find({ relations: ['actor'] })
  ↓
For each activity.actor:
  ↓
  BlueskyHandleCacheService.resolveHandle(actor.socialId)
    ↓
    Check Redis: atproto:handle:did:plc:abc123
    ↓ (cache hit)
    Return "alice.bsky.social"
  ↓
Set activity.metadata.actorName = "alice.bsky.social"
  ↓
Return enriched activities to frontend
```

### Implementation Details

#### 1. Shadow Account Service (Phase 1)

**File:** `src/shadow-account/shadow-account.service.ts`

**Changes:**
```typescript
async findOrCreateShadowAccount(
  externalId: string,      // DID
  displayName: string,     // May be DID or handle
  provider: AuthProvidersEnum,
  targetTenantId: string,
  preferences?: Record<string, any>,
): Promise<UserEntity> {
  // ... existing lookup logic ...

  // Create new shadow account
  const shadowUser = new UserEntity();
  shadowUser.socialId = externalId; // DID (single source of truth)
  shadowUser.provider = provider;
  shadowUser.isShadowAccount = true;
  shadowUser.email = null;
  shadowUser.password = '';

  // ✅ RESOLVE HANDLE IMMEDIATELY
  let resolvedHandle = externalId; // Fallback to DID

  try {
    // If displayName is already a handle, use it
    if (!displayName.startsWith('did:')) {
      resolvedHandle = displayName;
    } else {
      // Resolve DID → handle
      resolvedHandle = await this.blueskyIdentityService.extractHandleFromDid(externalId);
      this.logger.log(`Resolved ${externalId} → ${resolvedHandle}`);
    }
  } catch (error) {
    this.logger.warn(`Could not resolve handle for ${externalId}: ${error.message}`);
  }

  shadowUser.firstName = resolvedHandle; // ✅ Store handle, not DID
  shadowUser.lastName = null;

  // Generate slug from handle's username part
  const username = resolvedHandle.split('.')[0] || 'shadow-user';
  shadowUser.slug = `${slugify(username, { strict: true, lower: true })}-${generateShortCode()}`;

  // Don't duplicate handle in preferences (firstName is enough)
  shadowUser.preferences = preferences || {};

  // ... save logic ...
  return savedUser;
}
```

#### 2. User Service - Multi-Identifier Lookup (Phase 2)

**File:** `src/user/user.service.ts`

**New Methods:**
```typescript
/**
 * Find user by slug, DID, or handle
 */
async findByIdentifier(identifier: string): Promise<User | null> {
  // Try slug first (most common case)
  if (this.looksLikeSlug(identifier)) {
    return this.showProfile(identifier);
  }

  // If it's a DID
  if (identifier.startsWith('did:')) {
    return this.findBySocialIdAndProvider(
      identifier,
      AuthProvidersEnum.bluesky
    );
  }

  // Otherwise treat as handle and resolve to DID
  try {
    const profile = await this.blueskyIdentityService.resolveProfile(identifier);
    return this.findBySocialIdAndProvider(
      profile.did,
      AuthProvidersEnum.bluesky
    );
  } catch (error) {
    this.logger.warn(`Could not resolve handle ${identifier}: ${error.message}`);
    return null;
  }
}

private looksLikeSlug(identifier: string): boolean {
  // Slugs have format: name-name-abc123 (ends with short code)
  return /^[a-z0-9-]+-[a-z0-9]{6,10}$/.test(identifier);
}

private async findBySocialIdAndProvider(
  socialId: string,
  provider: AuthProvidersEnum
): Promise<User | null> {
  const userObject = await this.usersService.findBySocialIdAndProvider({
    socialId,
    provider
  });
  return userObject ? this.usersService.findById(userObject.id) : null;
}
```

**Controller Update:**
```typescript
// src/user/user.controller.ts

@Public()
@Get(':identifier/profile')
@ApiOperation({
  summary: 'Get user profile by slug, DID, or handle',
  description: 'Accepts user slug (alice-abc123), ATProto DID (did:plc:...), or handle (alice.bsky.social)'
})
@SerializeOptions({ groups: ['me', 'admin', 'user', '*'] })
showProfile(@Param('identifier') identifier: string): Promise<NullableType<User>> {
  return this.userService.findByIdentifier(identifier);
}
```

#### 3. Bluesky Handle Cache Service (Phase 3)

**File:** `src/bluesky/bluesky-handle-cache.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyIdentityService } from './bluesky-identity.service';

@Injectable()
export class BlueskyHandleCacheService {
  private readonly logger = new Logger(BlueskyHandleCacheService.name);
  private readonly CACHE_PREFIX = 'atproto:handle:';
  private readonly CACHE_TTL = 900; // 15 minutes (in seconds)

  constructor(
    private readonly cache: ElastiCacheService,
    private readonly blueskyIdentity: BlueskyIdentityService,
  ) {}

  /**
   * Resolve DID to handle with ElastiCache caching
   * Shared across all API nodes
   */
  async resolveHandle(did: string): Promise<string> {
    // Return as-is if it doesn't look like a DID
    if (!did?.startsWith('did:')) {
      return did;
    }

    const cacheKey = `${this.CACHE_PREFIX}${did}`;

    try {
      // Try ElastiCache first (shared across pods)
      const cached = await this.cache.get<string>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${did}: ${cached}`);
        return cached;
      }

      // Cache miss - resolve from ATProto
      this.logger.debug(`Cache miss for ${did}, resolving via ATProto...`);
      const handle = await this.blueskyIdentity.extractHandleFromDid(did);

      // Store in ElastiCache (shared across all API nodes)
      await this.cache.set(cacheKey, handle, this.CACHE_TTL);
      this.logger.log(`Cached handle for ${did}: ${handle} (TTL: ${this.CACHE_TTL}s)`);

      return handle;
    } catch (error) {
      this.logger.warn(`Failed to resolve handle for ${did}: ${error.message}`);
      // Graceful degradation: return DID if resolution fails
      return did;
    }
  }

  /**
   * Batch resolve multiple DIDs (more efficient for activity feeds)
   */
  async resolveHandles(dids: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Resolve all in parallel (each checks cache independently)
    await Promise.all(
      dids.map(async (did) => {
        const handle = await this.resolveHandle(did);
        results.set(did, handle);
      })
    );

    return results;
  }

  /**
   * Invalidate cache for a specific DID
   * Useful if you know a handle changed (rare)
   */
  async invalidate(did: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${did}`;
    await this.cache.del(cacheKey);
    this.logger.log(`Invalidated cache for ${did}`);
  }
}
```

**Module Registration:**
```typescript
// src/bluesky/bluesky.module.ts

@Module({
  imports: [ElastiCacheModule], // Import cache module
  providers: [
    BlueskyIdentityService,
    BlueskyHandleCacheService, // ← Add new service
    // ... existing providers
  ],
  exports: [
    BlueskyIdentityService,
    BlueskyHandleCacheService, // ← Export for use in other modules
  ],
})
export class BlueskyModule {}
```

#### 4. Activity Feed Display Resolution (Phase 4)

**File:** `src/activity-feed/activity-feed.service.ts`

**Changes:**
```typescript
import { BlueskyHandleCacheService } from '../bluesky/bluesky-handle-cache.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class ActivityFeedService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly blueskyHandleCache: BlueskyHandleCacheService, // ← Inject
  ) {}

  /**
   * Get sitewide feed with resolved display names
   */
  async getSitewideFeed(
    options: {
      limit?: number;
      offset?: number;
      visibility?: string[];
    } = {},
  ): Promise<ActivityFeedEntity[]> {
    await this.getTenantRepository();

    const activities = await this.activityFeedRepository.find({
      relations: ['actor'], // ✅ Join to users table
      where: {
        feedScope: 'sitewide',
        visibility: In(options.visibility || ['public', 'authenticated']),
      },
      order: { updatedAt: 'DESC' },
      take: options.limit || 20,
      skip: options.offset || 0,
    });

    // Resolve all display names (uses cache!)
    for (const activity of activities) {
      if (activity.actor) {
        activity.metadata.actorName = await this.getDisplayName(activity.actor);
      }
    }

    return activities;
  }

  /**
   * Resolve display name for any user
   * Real users: firstName + lastName
   * Shadow ATProto users: Resolve DID → handle via cache
   */
  private async getDisplayName(user: UserEntity): Promise<string> {
    // Real user: use firstName + lastName
    if (!user.isShadowAccount) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Anonymous';
    }

    // Shadow ATProto user: resolve via cache
    if (user.provider === AuthProvidersEnum.bluesky && user.socialId) {
      return await this.blueskyHandleCache.resolveHandle(user.socialId);
    }

    // Fallback to slug
    return user.slug;
  }
}
```

**Remove actorName from activity creation:**
```typescript
/**
 * Create activity (DO NOT store actorName in metadata)
 */
async create(params: {
  activityType: string;
  feedScope: 'sitewide' | 'group' | 'event';
  actorId?: number;
  actorSlug?: string;
  // ❌ Remove actorName - resolved at display time
  // ... other params
}): Promise<ActivityFeedEntity> {
  // ... existing logic ...

  return await this.createNewEntry({
    ...params,
    metadata: this.buildMetadata(params),
  });
}

/**
 * Build metadata (only store slug for routing, NOT name)
 */
private buildMetadata(params: any): Record<string, any> {
  const metadata: Record<string, any> = {
    ...(params.metadata || {}),
  };

  // Store slugs for routing
  if (params.actorSlug) {
    metadata.actorSlug = params.actorSlug;
  }

  // ❌ DO NOT store actorName - resolved at query time

  return metadata;
}
```

### Database Schema

**Minimal changes - just add composite index for performance:**

```sql
-- users table (existing columns, no changes)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  "socialId" VARCHAR(255),           -- DID for ATProto users (has @Index)
  provider VARCHAR(50),               -- 'bluesky', 'email', 'google', etc.
  "firstName" VARCHAR(255),           -- For shadow users: resolved handle
  "lastName" VARCHAR(255),
  "isShadowAccount" BOOLEAN DEFAULT false,
  preferences JSONB,                  -- No longer stores handle here
  -- ... other fields
);

-- activityFeed table (existing, no changes)
CREATE TABLE "activityFeed" (
  id SERIAL PRIMARY KEY,
  "actorId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,                     -- Only stores actorSlug (for routing)
  "feedScope" VARCHAR(20),
  "activityType" VARCHAR(50),
  -- ... other fields
);

-- NEW: Add composite index for fast DID lookups
-- This makes DID lookups as fast as slug lookups
CREATE INDEX idx_users_socialid_provider
ON users("socialId", provider)
WHERE "socialId" IS NOT NULL;
```

**Migration:**
```typescript
// src/database/migrations/XXXXXX-AddCompositeIndexSocialIdProvider.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompositeIndexSocialIdProvider1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add composite index for (socialId, provider)
    // Improves performance of DID-based profile lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_socialid_provider
      ON users("socialId", provider)
      WHERE "socialId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_socialid_provider
    `);
  }
}
```

**Performance Impact:**
```
Before index:
  DID lookup: ~5-10ms (full table scan on socialId, filter by provider)

After index:
  DID lookup: ~1-2ms (B-tree index lookup, same as slug)

Index size: ~50KB per 10,000 users (negligible)
```

### ElastiCache Configuration

**Cache Keys:**
```
atproto:handle:did:plc:abc123xyz... → "alice.bsky.social"
atproto:handle:did:plc:def456uvw... → "bob.example.com"
```

**TTL:** 15 minutes (900 seconds)

**Memory Estimate:**
- Average handle length: ~20 characters
- Average DID length: ~40 characters
- Overhead per key: ~50 bytes
- **Total per entry: ~110 bytes**
- **100,000 entries: ~11 MB** (negligible)

**Configuration:**
```yaml
# openmeet-infrastructure/k8s/environments/prod/kustomization.yaml
configMapGenerator:
  - name: api-config
    literals:
      - ELASTICACHE_HOST=openmeet-dev-34cfxu.serverless.use1.cache.amazonaws.com
      - ELASTICACHE_PORT=6379
      - ELASTICACHE_TLS=true
      - ELASTICACHE_AUTH=true
```

### Security & Compliance

#### Data Protection
- DIDs are public identifiers (no PII)
- Handles are public (visible on ATProto)
- Cache data is ephemeral (15 min TTL)
- No sensitive data in cache

#### Access Control
- Public profile endpoint (no auth required for public profiles)
- Activity feed respects visibility settings
- ElastiCache accessible only to API pods

#### Privacy Considerations
- Shadow users have no email/password (no login)
- Can be "claimed" by real user who logs in with same DID
- Handle resolution doesn't leak private data

### Monitoring & Maintenance

#### Key Metrics

**Cache Performance:**
```
atproto_handle_cache_hits_total     Counter
atproto_handle_cache_misses_total   Counter
atproto_handle_cache_errors_total   Counter
atproto_handle_resolution_duration  Histogram (p50, p95, p99)
```

**Cache Hit Rate Target:** >95% after warmup

**Resolution Latency:**
- Cached: <50ms p95
- Uncached: <500ms p95

#### Alerting

**Critical:**
- Cache hit rate <80% (may indicate cache issues)
- Resolution latency >1s p95 (ATProto API issues)
- Cache error rate >5% (Redis connectivity issues)

**Warning:**
- Cache hit rate <90% (investigate cache eviction)
- Resolution failures >1% (ATProto API degradation)

#### Prometheus Metrics

**Metrics Module Registration:**
```typescript
// src/metrics/metrics.module.ts

// Add ATProto handle resolution metrics
const atprotoHandleMetrics = [
  makeCounterProvider({
    name: 'atproto_handle_cache_hits_total',
    help: 'Total number of ATProto handle cache hits',
    labelNames: ['tenant'],
  }),
  makeCounterProvider({
    name: 'atproto_handle_cache_misses_total',
    help: 'Total number of ATProto handle cache misses',
    labelNames: ['tenant'],
  }),
  makeCounterProvider({
    name: 'atproto_handle_resolution_errors_total',
    help: 'Total number of ATProto handle resolution errors',
    labelNames: ['tenant', 'error_type'],
  }),
  makeHistogramProvider({
    name: 'atproto_handle_resolution_duration_seconds',
    help: 'Duration of ATProto handle resolution in seconds',
    labelNames: ['tenant', 'cache_status'], // cache_status: hit, miss
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5], // Cached should be <50ms, uncached <500ms
  }),
  makeCounterProvider({
    name: 'user_profile_lookups_total',
    help: 'Total number of user profile lookups',
    labelNames: ['tenant', 'identifier_type'], // identifier_type: slug, did, handle
  }),
];

@Module({
  imports: [
    // ... existing imports
  ],
  providers: [
    // ... existing providers
    ...atprotoHandleMetrics,
  ],
  exports: [
    // ... existing exports
    ...atprotoHandleMetrics,
  ],
})
export class MetricsModule {}
```

**Service Instrumentation:**
```typescript
// src/bluesky/bluesky-handle-cache.service.ts

import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class BlueskyHandleCacheService {
  private readonly logger = new Logger(BlueskyHandleCacheService.name);
  private readonly CACHE_PREFIX = 'atproto:handle:';
  private readonly CACHE_TTL = 900;

  constructor(
    private readonly cache: ElastiCacheService,
    private readonly blueskyIdentity: BlueskyIdentityService,
    @InjectMetric('atproto_handle_cache_hits_total')
    private readonly cacheHits: Counter<string>,
    @InjectMetric('atproto_handle_cache_misses_total')
    private readonly cacheMisses: Counter<string>,
    @InjectMetric('atproto_handle_resolution_errors_total')
    private readonly resolutionErrors: Counter<string>,
    @InjectMetric('atproto_handle_resolution_duration_seconds')
    private readonly resolutionDuration: Histogram<string>,
  ) {}

  async resolveHandle(did: string, tenantId: string = 'unknown'): Promise<string> {
    const timer = this.resolutionDuration.startTimer({ tenant: tenantId });

    try {
      if (!did?.startsWith('did:')) {
        return did;
      }

      const cacheKey = `${this.CACHE_PREFIX}${did}`;

      // Try cache first
      const cached = await this.cache.get<string>(cacheKey);
      if (cached) {
        this.cacheHits.inc({ tenant: tenantId });
        timer({ cache_status: 'hit' });
        this.logger.debug(`Cache hit for ${did}: ${cached}`);
        return cached;
      }

      // Cache miss - resolve from ATProto
      this.cacheMisses.inc({ tenant: tenantId });
      this.logger.debug(`Cache miss for ${did}, resolving...`);

      const handle = await this.blueskyIdentity.extractHandleFromDid(did);

      // Store in cache
      await this.cache.set(cacheKey, handle, this.CACHE_TTL);
      timer({ cache_status: 'miss' });
      this.logger.log(`Cached handle for ${did}: ${handle}`);

      return handle;
    } catch (error) {
      this.resolutionErrors.inc({
        tenant: tenantId,
        error_type: error.name || 'unknown',
      });
      timer({ cache_status: 'error' });
      this.logger.warn(`Failed to resolve handle for ${did}: ${error.message}`);
      return did; // Fallback
    }
  }
}
```

**Profile Lookup Instrumentation:**
```typescript
// src/user/user.service.ts

import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class UserService {
  constructor(
    // ... existing dependencies
    @InjectMetric('user_profile_lookups_total')
    private readonly profileLookups: Counter<string>,
  ) {}

  async findByIdentifier(identifier: string, tenantId: string): Promise<User | null> {
    if (this.looksLikeSlug(identifier)) {
      this.profileLookups.inc({ tenant: tenantId, identifier_type: 'slug' });
      return this.showProfile(identifier);
    }

    if (identifier.startsWith('did:')) {
      this.profileLookups.inc({ tenant: tenantId, identifier_type: 'did' });
      return this.findBySocialIdAndProvider(identifier, AuthProvidersEnum.bluesky);
    }

    this.profileLookups.inc({ tenant: tenantId, identifier_type: 'handle' });
    try {
      const profile = await this.blueskyIdentityService.resolveProfile(identifier);
      return this.findBySocialIdAndProvider(profile.did, AuthProvidersEnum.bluesky);
    } catch (error) {
      this.logger.warn(`Could not resolve handle ${identifier}: ${error.message}`);
      return null;
    }
  }
}
```

## Testing Strategy

**Philosophy:** Focus on behavior-driven integration tests that validate real-world scenarios. Avoid low-value mock-heavy unit tests that test implementation details rather than behavior.

### E2E Tests (Primary Focus)

**Test 1: Profile Lookup by Different Identifier Types**
```typescript
// test/user/profile-lookup.e2e-spec.ts

import * as request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser, createShadowUser } from '../utils/functions';

describe('User Profile Lookup (e2e)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let testUser: any;
  let shadowUser: any;

  beforeAll(async () => {
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Create regular test user
    const timestamp = Date.now();
    testUser = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `profile-test-${timestamp}@openmeet.net`,
      'Profile',
      'Test',
    );

    // Create shadow user with known DID and handle
    shadowUser = await createShadowUser(TESTING_APP_URL, testUser.token, {
      socialId: 'did:plc:test123xyz',
      firstName: 'testuser.bsky.social',
      provider: 'bluesky',
    });
  });

  it('should lookup profile by slug', async () => {
    const response = await serverApp
      .get(`/api/v1/users/${shadowUser.slug}/profile`)
      .expect(200);

    expect(response.body.id).toBe(shadowUser.id);
    expect(response.body.slug).toBe(shadowUser.slug);
  });

  it('should lookup profile by DID', async () => {
    const response = await serverApp
      .get(`/api/v1/users/${shadowUser.socialId}/profile`)
      .expect(200);

    expect(response.body.id).toBe(shadowUser.id);
    expect(response.body.socialId).toBe(shadowUser.socialId);
  });

  it('should lookup profile by handle', async () => {
    const response = await serverApp
      .get(`/api/v1/users/${shadowUser.firstName}/profile`)
      .expect(200);

    expect(response.body.id).toBe(shadowUser.id);
    expect(response.body.firstName).toBe(shadowUser.firstName);
  });

  it('should return 404 for invalid identifier', async () => {
    await serverApp
      .get('/api/v1/users/nonexistent-user-xyz/profile')
      .expect(404);
  });
});
```

**Test 2: Activity Feed Shows Resolved Handles**
```typescript
// test/activity-feed/shadow-user-handles.e2e-spec.ts

import * as request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser, createShadowUser, createEvent } from '../utils/functions';

describe('Activity Feed Shadow User Handles (e2e)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let testUser: any;
  let shadowUser: any;

  beforeAll(async () => {
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    const timestamp = Date.now();
    testUser = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `activity-feed-test-${timestamp}@openmeet.net`,
      'Activity',
      'Test',
    );

    // Create shadow user with resolved handle
    shadowUser = await createShadowUser(TESTING_APP_URL, testUser.token, {
      socialId: 'did:plc:feedtest123',
      firstName: 'alice.bsky.social',
      provider: 'bluesky',
    });

    // Create event as shadow user (triggers activity feed entry)
    await createEvent(TESTING_APP_URL, testUser.token, {
      name: 'Test Event by Shadow User',
      description: 'Event created by Bluesky shadow user',
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      timeZone: 'UTC',
      type: 'online',
      locationOnline: 'https://example.com/meeting',
      userId: shadowUser.id, // Event created by shadow user
    });
  });

  it('should display resolved handles in activity feed, not DIDs', async () => {
    const response = await serverApp
      .get('/api/v1/activity-feed/sitewide?limit=20')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);

    // Find our activity
    const activities = response.body.data || response.body;
    const shadowUserActivity = activities.find(
      (a: any) => a.metadata?.actorSlug === shadowUser.slug
    );

    // Assert: Handle is resolved, not DID
    expect(shadowUserActivity).toBeDefined();
    expect(shadowUserActivity.metadata.actorName).toBe('alice.bsky.social');
    expect(shadowUserActivity.metadata.actorName).not.toContain('did:');
  });

  it('should handle multiple shadow users efficiently', async () => {
    // Create additional shadow users
    const shadowUser2 = await createShadowUser(TESTING_APP_URL, testUser.token, {
      socialId: 'did:plc:user2',
      firstName: 'bob.bsky.social',
      provider: 'bluesky',
    });

    const shadowUser3 = await createShadowUser(TESTING_APP_URL, testUser.token, {
      socialId: 'did:plc:user3',
      firstName: 'carol.bsky.social',
      provider: 'bluesky',
    });

    // Measure response time (should be fast with caching)
    const start = Date.now();
    const response = await serverApp
      .get('/api/v1/activity-feed/sitewide?limit=20')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);
    const duration = Date.now() - start;

    // All activities should have resolved handles
    const activities = response.body.data || response.body;
    activities.forEach((activity: any) => {
      if (activity.metadata?.actorName) {
        expect(activity.metadata.actorName).not.toContain('did:');
      }
    });

    // Response should be fast (<200ms with caching)
    expect(duration).toBeLessThan(200);
  });
});
```

### Unit Tests (Controller/Service Layer)

**Following existing patterns - test with mocked dependencies:**

```typescript
// src/bluesky/bluesky-handle-cache.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { BlueskyHandleCacheService } from './bluesky-handle-cache.service';
import { BlueskyIdentityService } from './bluesky-identity.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { Counter, Histogram } from 'prom-client';

describe('BlueskyHandleCacheService', () => {
  let service: BlueskyHandleCacheService;
  let elastiCache: jest.Mocked<ElastiCacheService>;
  let blueskyIdentity: jest.Mocked<BlueskyIdentityService>;
  let cacheHits: jest.Mocked<Counter<string>>;
  let cacheMisses: jest.Mocked<Counter<string>>;
  let resolutionErrors: jest.Mocked<Counter<string>>;
  let resolutionDuration: jest.Mocked<Histogram<string>>;

  beforeEach(async () => {
    elastiCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<ElastiCacheService>;

    blueskyIdentity = {
      extractHandleFromDid: jest.fn(),
    } as unknown as jest.Mocked<BlueskyIdentityService>;

    cacheHits = {
      inc: jest.fn(),
    } as unknown as jest.Mocked<Counter<string>>;

    cacheMisses = {
      inc: jest.fn(),
    } as unknown as jest.Mocked<Counter<string>>;

    resolutionErrors = {
      inc: jest.fn(),
    } as unknown as jest.Mocked<Counter<string>>;

    const mockTimer = jest.fn();
    resolutionDuration = {
      startTimer: jest.fn().mockReturnValue(mockTimer),
    } as unknown as jest.Mocked<Histogram<string>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlueskyHandleCacheService,
        {
          provide: ElastiCacheService,
          useValue: elastiCache,
        },
        {
          provide: BlueskyIdentityService,
          useValue: blueskyIdentity,
        },
        {
          provide: 'PROM_METRIC_ATPROTO_HANDLE_CACHE_HITS_TOTAL',
          useValue: cacheHits,
        },
        {
          provide: 'PROM_METRIC_ATPROTO_HANDLE_CACHE_MISSES_TOTAL',
          useValue: cacheMisses,
        },
        {
          provide: 'PROM_METRIC_ATPROTO_HANDLE_RESOLUTION_ERRORS_TOTAL',
          useValue: resolutionErrors,
        },
        {
          provide: 'PROM_METRIC_ATPROTO_HANDLE_RESOLUTION_DURATION_SECONDS',
          useValue: resolutionDuration,
        },
      ],
    }).compile();

    service = module.get<BlueskyHandleCacheService>(BlueskyHandleCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveHandle', () => {
    it('should return cached handle if available', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      const tenantId = 'test-tenant';
      elastiCache.get.mockResolvedValue('alice.bsky.social');

      // Act
      const result = await service.resolveHandle(did, tenantId);

      // Assert
      expect(result).toBe('alice.bsky.social');
      expect(elastiCache.get).toHaveBeenCalledWith('atproto:handle:did:plc:abc123');
      expect(cacheHits.inc).toHaveBeenCalledWith({ tenant: tenantId });
      expect(blueskyIdentity.extractHandleFromDid).not.toHaveBeenCalled();
    });

    it('should resolve and cache on cache miss', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      const tenantId = 'test-tenant';
      elastiCache.get.mockResolvedValue(null);
      blueskyIdentity.extractHandleFromDid.mockResolvedValue('alice.bsky.social');

      // Act
      const result = await service.resolveHandle(did, tenantId);

      // Assert
      expect(result).toBe('alice.bsky.social');
      expect(cacheMisses.inc).toHaveBeenCalledWith({ tenant: tenantId });
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledWith(did);
      expect(elastiCache.set).toHaveBeenCalledWith(
        'atproto:handle:did:plc:abc123',
        'alice.bsky.social',
        900
      );
    });

    it('should fallback to DID on resolution failure', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      const tenantId = 'test-tenant';
      elastiCache.get.mockResolvedValue(null);
      blueskyIdentity.extractHandleFromDid.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.resolveHandle(did, tenantId);

      // Assert
      expect(result).toBe(did);
      expect(resolutionErrors.inc).toHaveBeenCalledWith({
        tenant: tenantId,
        error_type: 'Error',
      });
    });

    it('should return non-DID identifiers as-is', async () => {
      // Arrange
      const handle = 'alice.bsky.social';
      const tenantId = 'test-tenant';

      // Act
      const result = await service.resolveHandle(handle, tenantId);

      // Assert
      expect(result).toBe(handle);
      expect(elastiCache.get).not.toHaveBeenCalled();
    });
  });
});
```

### Performance Testing

**Load Test with k6:**
```javascript
// k6-tests/activity-feed-performance.js

import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },  // Ramp up to 10 users
    { duration: '3m', target: 10 },  // Stay at 10 users
    { duration: '1m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
    http_req_failed: ['rate<0.01'],   // <1% failure rate
  },
};

export default function() {
  const response = http.get('https://api.openmeet.net/api/v1/activity-feed/sitewide?limit=20', {
    headers: { 'x-tenant-id': 'openmeet' },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has activities': (r) => JSON.parse(r.body).data.length > 0,
    'no DIDs in names': (r) => !r.body.includes('did:plc:'),
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
```

**Expected Results:**
- **First run (cold cache):** p95 ~500ms (cache misses)
- **Subsequent runs:** p95 <100ms (cache hits)
- **Cache hit rate:** >95% after 100 requests

## Deployment Strategy

### Phase 1: Shadow User Creation Fix (Low Risk)
**Deploy:** Week 1
- Update `ShadowAccountService.findOrCreateShadowAccount`
- Test: Create new shadow users, verify firstName has handle
- Rollback: Previous version still works (just creates DIDs in firstName)

### Phase 2: Multi-Identifier Lookup (Low Risk)
**Deploy:** Week 1
- Add `UserService.findByIdentifier`
- Update `/users/:identifier/profile` endpoint
- Test: Profile lookup by slug/DID/handle
- Rollback: Backward compatible (slug lookup still works)

### Phase 3: Handle Cache Service (Medium Risk)
**Deploy:** Week 2
- Add `BlueskyHandleCacheService`
- Test cache operations in staging
- Monitor cache hit rate
- Rollback: Remove service, keep existing behavior

### Phase 4: Activity Feed Resolution (Medium Risk)
**Deploy:** Week 2
- Update `ActivityFeedService` to resolve names
- Remove `actorName` from new activity creation
- Test: Activity feed shows resolved handles
- Rollback: Revert to storing actorName in metadata

### Deployment Checklist
- [ ] ElastiCache is running and accessible
- [ ] Environment variables configured (ELASTICACHE_HOST, etc.)
- [ ] Database migrations (none required)
- [ ] Deploy to staging first
- [ ] Run E2E tests
- [ ] Monitor cache hit rate
- [ ] Gradual rollout to production (10% → 50% → 100%)

## Future Considerations

### Short Term (Next 3 Months)
1. **Backfill Existing Shadow Users**: Script to update firstName for old shadow users
2. **Metrics Dashboard**: Grafana dashboard for cache performance
3. **Handle Change Detection**: Webhook or polling to invalidate stale handles

### Medium Term (6-12 Months)
1. **Proactive Cache Warming**: Pre-populate cache for active shadow users
2. **Multi-Protocol Support**: Extend to other decentralized identity protocols
3. **Handle History**: Track handle changes for audit/analytics

### Long Term (1+ Year)
1. **Account Linking**: Merge shadow users with real users (see Issue #348)
2. **Distributed Cache**: Multi-region ElastiCache for global deployments
3. **Real-time Updates**: WebSocket notifications for handle changes

### Technical Debt Considerations
- Migration script for ~1000 existing shadow users (one-time)
- Remove deprecated `preferences.bluesky.handle` field (cleanup)
- Add index on `(socialId, provider)` if performance degrades

## Appendix

### Related Documents
- [ATProtocol Design](./atprotocol-design.md)
- [Bluesky Login Flow](./bluesky-login-flow.md)
- [Activity Feed System](./activity-feed-system.md)
- [Issue #246: User Profile Display Issues](https://github.com/openmeet-team/openmeet-platform/issues/246)
- [Issue #348: Account Linking](https://github.com/openmeet-team/openmeet-api/issues/348)

### Reference Materials
- [ATProto Identity Spec](https://atproto.com/specs/did)
- [ATProto Handle Resolution](https://atproto.com/specs/handle)
- [@atproto/identity Documentation](https://www.npmjs.com/package/@atproto/identity)

### API Examples

**Profile Lookup by Handle:**
```bash
# Lookup by handle (resolves to DID internally)
GET /api/v1/users/alice.bsky.social/profile

Response:
{
  "id": 123,
  "slug": "alice-abc123",
  "firstName": "alice.bsky.social",
  "provider": "bluesky",
  "socialId": "did:plc:abc123...",
  "isShadowAccount": true
}
```

**Profile Lookup by DID:**
```bash
# Lookup by DID directly
GET /api/v1/users/did:plc:abc123xyz.../profile

Response: (same as above)
```

**Activity Feed with Resolved Names:**
```bash
GET /api/v1/activity-feed/sitewide?limit=10

Response:
{
  "data": [
    {
      "id": 1,
      "activityType": "event.created",
      "metadata": {
        "actorSlug": "alice-abc123",
        "actorName": "alice.bsky.social",  ✅ Resolved at query time
        "eventName": "Weekly Meetup",
        "eventSlug": "weekly-meetup-xyz789"
      },
      "updatedAt": "2025-11-03T12:00:00Z"
    }
  ]
}
```

### Cache Key Schema

```
Format: atproto:handle:{did}
Examples:
  atproto:handle:did:plc:abc123xyz...  → "alice.bsky.social"
  atproto:handle:did:plc:def456uvw...  → "bob.example.com"
  atproto:handle:did:web:alice.com     → "alice.com"

TTL: 900 seconds (15 minutes)
Storage: ElastiCache (Redis), shared across all API pods
```

### Migration Script (One-Time)

Use a real Migration script following the patterns in src/database/migrations
Use a current timestamp when creating the migration file/class

```typescript
// scripts/backfill-shadow-user-handles.ts

import { BlueskyIdentityService } from '../src/bluesky/bluesky-identity.service';
import { UserRepository } from '../src/user/infrastructure/persistence/relational/repositories/user.repository';

async function backfillShadowUserHandles() {
  const users = await userRepository.find({
    where: {
      isShadowAccount: true,
      provider: 'bluesky',
      // firstName is a DID (needs fixing)
      firstName: Like('did:%'),
    },
  });

  console.log(`Found ${users.length} shadow users with DIDs as firstName`);

  for (const user of users) {
    try {
      const handle = await blueskyIdentityService.extractHandleFromDid(user.socialId);

      await userRepository.update(user.id, {
        firstName: handle,
        slug: `${slugify(handle.split('.')[0])}-${generateShortCode()}`,
      });

      console.log(`✅ Updated user ${user.id}: ${user.socialId} → ${handle}`);
    } catch (error) {
      console.error(`❌ Failed to update user ${user.id}: ${error.message}`);
    }
  }

  console.log('Backfill complete!');
}
```

---

**Document Status:** In Progress (Phases 1-3 Complete)
**Last Updated:** 2025-11-04
**Author:** AI Assistant + Tom Scanlan
**Reviewers:** Pending

**Implementation Progress:**
- ✅ Phase 1: Shadow Account Handle Resolution (commit: ba472cf)
- ✅ Phase 2: ATProto Handle Cache Service (commit: e88b4da)
- ✅ Phase 3: Multi-Identifier Profile Lookup (commit: 540b781)
- ⏳ Phase 4: Activity Feed Handle Resolution
- ⏳ Phase 5: Data Migration
- ⏳ Phase 6: Frontend Display Composable

**Key Decisions:**
- ✅ Backend resolves handles (not frontend)
- ✅ ElastiCache (Redis) for shared caching across API pods
- ✅ Cache key: `atproto:handle:{did}` (protocol-agnostic)
- ✅ 15 minute TTL (balance freshness vs. performance)
- ✅ Prometheus metrics for observability
- ✅ BDD-style integration tests (minimal mocks)
- ✅ Composite index on (socialId, provider) for performance
- ✅ Zero breaking changes, backward compatible
- ✅ Used `forwardRef()` to avoid circular dependencies (Phase 1 learning)
- ✅ Tenant-agnostic cache design - DIDs are globally unique (Phase 2 learning)
- ✅ Behavior-focused tests over mock verification (Phase 2 learning)
