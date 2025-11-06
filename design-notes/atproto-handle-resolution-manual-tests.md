# ATProto Handle Resolution - Manual Testing Guide
**Phase 3: Multi-Identifier Profile Lookup**

## Overview
This guide covers manual testing for the `GET /api/v1/users/:identifier/profile` endpoint, which now accepts:
- **Slug**: `alice-abc123` (existing functionality)
- **DID**: `did:plc:abc123` (new)
- **Handle**: `alice.bsky.social` or `@alice.bsky.social` (new)

## Prerequisites

### 1. Local Development Setup
```bash
# Start local services
./setup-local-env.sh

# Verify API is running
curl http://localhost:3000/api/health
```

### 2. Test Data Required
You need at least one Bluesky user in your local database:

**Option A: Create via Bluesky OAuth** (Recommended)
1. Go to `http://localhost:3001/auth/bluesky`
2. Log in with your Bluesky account
3. Copy your user slug from the response or profile page

**Option B: Use existing production data**
```sql
-- Find a Bluesky user in your local tenant
SELECT id, slug, "socialId" as did, "firstName"
FROM tenant_test_tenant.users
WHERE provider = 'bluesky'
LIMIT 1;
```

## Test Cases

### Test 1: Profile Lookup by Slug (Backwards Compatibility)

**Purpose**: Verify existing functionality still works

```bash
# Using slug format: username-shortcode
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice-abc123/profile
```

**Expected Result**:
- ✅ HTTP 200
- ✅ Returns full user profile
- ✅ Includes `socialProfiles.atprotocol` with DID and handle
- ✅ No errors in logs

**Sample Response**:
```json
{
  "id": 123,
  "slug": "alice-abc123",
  "firstName": "Alice",
  "email": "alice@example.com",
  "socialProfiles": {
    "atprotocol": {
      "did": "did:plc:abc123def456",
      "handle": "alice.bsky.social",
      "connected": true
    }
  }
}
```

---

### Test 2: Profile Lookup by DID (New Functionality)

**Purpose**: Verify DID-based lookup works

**Get a DID**:
```bash
# From test 1 response, extract the DID
DID="did:plc:abc123def456"
```

**Test**:
```bash
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/${DID}/profile
```

**Expected Result**:
- ✅ HTTP 200
- ✅ Returns same user as Test 1
- ✅ `slug` matches from Test 1
- ✅ Logs show: "Identifier is DID: did:plc:..."

**Verify Logs**:
```bash
# Check API logs for DID detection
docker logs openmeet-api-1 --tail 50 | grep "Identifier is DID"
```

---

### Test 3: Profile Lookup by ATProto Handle (New Functionality)

**Purpose**: Verify handle resolution works

**Get a handle**:
```bash
# From test 1 response, extract the handle
HANDLE="alice.bsky.social"
```

**Test**:
```bash
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/${HANDLE}/profile
```

**Expected Result**:
- ✅ HTTP 200
- ✅ Returns same user as Test 1 and 2
- ✅ `slug` and `did` match previous tests
- ✅ Logs show: "Identifier appears to be ATProto handle: alice.bsky.social"

**Verify Logs**:
```bash
# Check API logs for handle resolution
docker logs openmeet-api-1 --tail 50 | grep "ATProto handle"
```

---

### Test 4: Handle with @ Prefix (Edge Case)

**Purpose**: Verify @ prefix is stripped correctly

```bash
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/@alice.bsky.social/profile
```

**Expected Result**:
- ✅ HTTP 200
- ✅ Returns same user (@ should be stripped)
- ✅ Works identically to Test 3

---

### Test 5: Custom Domain Handle (Edge Case)

**Purpose**: Verify custom domains work

**Prerequisites**: User with custom domain (e.g., `alice.example.com`)

```bash
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice.example.com/profile
```

**Expected Result**:
- ✅ HTTP 200
- ✅ Resolves to correct user
- ✅ Logs show ATProto resolution attempt

---

### Test 6: Non-existent Identifier (Error Handling)

**Purpose**: Verify graceful 404 handling

```bash
# Non-existent slug
curl -i -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/nonexistent-xyz/profile

# Non-existent DID
curl -i -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/did:plc:notfound/profile

# Non-existent handle
curl -i -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/nobody.bsky.social/profile
```

**Expected Result**:
- ✅ HTTP 404 (Not Found) or null response
- ✅ No 500 errors
- ✅ Logs show resolution attempts with graceful failures

---

### Test 7: Identifier Type Detection (Validation)

**Purpose**: Verify correct identifier type is detected

**Test Matrix**:

| Identifier            | Expected Type | Detection Logic               |
|-----------------------|---------------|-------------------------------|
| `alice-abc123`        | Slug          | No dot, no `did:` prefix      |
| `did:plc:abc123`      | DID           | Starts with `did:`            |
| `alice.bsky.social`   | Handle        | Contains dot (domain pattern) |
| `@alice.bsky.social`  | Handle        | Starts with `@`, dot present  |
| `alice.example.com`   | Handle        | Custom domain                 |
| `did:web:example.com` | DID           | Starts with `did:`            |

**Run all tests above and verify logs show correct detection**

---

## Performance Tests

### Test 8: Cache Effectiveness

**Purpose**: Verify Phase 2 cache is used by Phase 3

```bash
# First request (cache miss - should call ATProto)
time curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice.bsky.social/profile

# Second request (cache hit - should be faster)
time curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice.bsky.social/profile
```

**Expected Result**:
- ✅ Second request is faster (< 50ms vs ~500ms)
- ✅ Logs show cache hit on second request
- ✅ No ATProto API call on second request

**Verify Cache Metrics**:
```bash
# Check Prometheus metrics endpoint
curl http://localhost:3000/metrics | grep atproto_handle
```

Expected metrics:
```
atproto_handle_cache_hits_total 1
atproto_handle_cache_misses_total 1
atproto_handle_resolution_duration_seconds{cache_status="miss"} 0.5
atproto_handle_resolution_duration_seconds{cache_status="hit"} 0.01
```

---

## Integration Tests

### Test 9: Full User Journey

**Purpose**: Test realistic user flow

```bash
# 1. User visits profile via slug (most common)
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice-abc123/profile

# 2. User shares their DID link
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/did:plc:abc123def456/profile

# 3. Someone looks them up by Bluesky handle
curl -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice.bsky.social/profile
```

**Expected Result**:
- ✅ All three return identical user data
- ✅ All three complete successfully
- ✅ Performance is acceptable (< 1s for first handle lookup, < 100ms for cached)

---

## Error Scenarios

### Test 10: Network Failures

**Purpose**: Verify graceful degradation when ATProto is unreachable

**Simulate Network Failure**:
```bash
# Block outbound traffic to ATProto servers (requires sudo)
sudo iptables -A OUTPUT -d bsky.social -j DROP
sudo iptables -A OUTPUT -d plc.directory -j DROP
```

**Test**:
```bash
# Should fail gracefully (return 404, not 500)
curl -i -H "x-tenant-id: test-tenant" \
  http://localhost:3000/api/v1/users/alice.bsky.social/profile
```

**Expected Result**:
- ✅ HTTP 404 (Not Found), NOT 500
- ✅ Logs show warning about resolution failure
- ✅ No unhandled exceptions

**Cleanup**:
```bash
sudo iptables -D OUTPUT -d bsky.social -j DROP
sudo iptables -D OUTPUT -d plc.directory -j DROP
```

---

## Test Checklist

Copy this checklist to track your testing progress:

- [ ] Test 1: Slug lookup (backwards compatibility)
- [ ] Test 2: DID lookup
- [ ] Test 3: Handle lookup
- [ ] Test 4: Handle with @ prefix
- [ ] Test 5: Custom domain handle
- [ ] Test 6: Non-existent identifiers
- [ ] Test 7: Identifier type detection
- [ ] Test 8: Cache effectiveness
- [ ] Test 9: Full user journey
- [ ] Test 10: Network failure handling

## Success Criteria

Phase 3 is ready for production when:

- ✅ All 10 manual tests pass
- ✅ Backwards compatibility confirmed (existing slug lookups work)
- ✅ New DID and handle lookups work correctly
- ✅ Cache is utilized effectively (Phase 2 integration)
- ✅ Error handling is graceful (no 500 errors)
- ✅ Logs show correct identifier detection
- ✅ Performance is acceptable:
  - Slug lookups: < 100ms
  - DID lookups: < 100ms (cached), < 500ms (uncached)
  - Handle lookups: < 100ms (cached), < 1s (uncached)

## Troubleshooting

### Issue: Handle resolution fails with 404
**Possible causes**:
- Handle doesn't exist on ATProto
- User exists but hasn't connected Bluesky account
- Network issues with ATProto PLC directory

**Debug**:
```bash
# Check if handle resolves on ATProto
curl https://plc.directory/did:plc:abc123

# Check API logs for error details
docker logs openmeet-api-1 --tail 100 | grep "Failed to resolve handle"
```

### Issue: DID lookup returns wrong user
**Possible cause**: Multiple users with same DID (shouldn't happen)

**Debug**:
```sql
SELECT id, slug, "socialId", provider
FROM tenant_test_tenant.users
WHERE "socialId" = 'did:plc:abc123def456';
```

### Issue: Slug lookup broken after update
**Possible cause**: Regression in identifier detection

**Debug**:
```bash
# Check logs for slug detection
docker logs openmeet-api-1 --tail 50 | grep "Identifier treated as slug"
```

### Issue: Cache not working
**Debug**:
```bash
# Check Redis connection
docker exec -it openmeet-redis-1 redis-cli ping

# Check cache keys
docker exec -it openmeet-redis-1 redis-cli keys "atproto:handle:*"

# Check metrics
curl http://localhost:3000/metrics | grep atproto_handle
```

---

## Notes
- All tests assume local development environment
- Replace `test-tenant` with your actual tenant ID
- Replace example slugs/DIDs/handles with real data from your database
- For production testing, use appropriate production URLs and credentials
