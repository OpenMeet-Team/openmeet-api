# K6 Performance Tests

Performance testing suite for OpenMeet API focusing on profile lookups and activity feed performance.

## Prerequisites

Install k6: https://k6.io/docs/get-started/installation/

Verify installation:
```bash
k6 version
```

## Quick Start

```bash
# Run all performance tests
npm run perf:test

# Run specific test
npm run perf:test:profile
npm run perf:test:feed

# Measure database index impact
npm run perf:baseline    # Establish baseline
# ... add database index ...
npm run perf:compare     # Measure improvement
```

## Test Scenarios

### Profile Lookup (`profile-lookup.js`)

Measures profile lookup performance by identifier type:
- **Slug lookup**: Uses existing slug index
- **DID lookup**: Tests composite index benefit on (socialId, provider)
- **Handle lookup**: Tests ATProto handle resolution + DID lookup

**Thresholds**:
- p95 < 200ms for all lookup types
- p99 < 500ms
- Success rate > 99%

**Purpose**: Determine if adding a composite index on `(socialId, provider)` improves DID lookup performance enough to justify the change.

### Activity Feed (`activity-feed.js`)

Tests activity feed performance with shadow user handle resolution:
- Batch handle resolution from cache
- Multiple user types (authenticated and shadow users)
- Cache effectiveness measurement

**Thresholds**:
- p95 < 300ms
- p99 < 800ms
- Success rate > 99%

### Index Impact Comparison (`compare-index-impact.js`)

Specialized test for measuring database index performance impact:
- Runs repeated DID lookups
- Saves baseline before index creation
- Compares performance after index
- Generates detailed comparison report

## Measuring Index Impact

Use this workflow to decide if the composite index is worth adding:

```bash
# 1. Run baseline without index
npm run perf:baseline

# 2. Add composite index to database
psql -U postgres -d openmeet_dev -c "
  CREATE INDEX IF NOT EXISTS idx_users_socialid_provider
  ON users(\"socialId\", provider)
  WHERE \"socialId\" IS NOT NULL;
"

# 3. Measure performance improvement
npm run perf:compare

# 4. Review comparison report
cat k6-tests/results/comparison.json
```

**Decision criteria**:
- If DID lookups improve by >50%: Index is worth it
- If improvement is <20%: Skip the index
- If improvement is 20-50%: Consider based on DID lookup frequency

## Configuration

Tests use environment variables with sensible defaults:

```bash
# API endpoint (default: http://localhost:3000)
export API_URL=http://localhost:3000

# Tenant ID (default: openmeet)
export TENANT_ID=openmeet

# Load profile
export TEST_DURATION=5m        # How long to run test
export TEST_VUS=10             # Concurrent virtual users
export TEST_RATE=10            # Requests per second
```

## Understanding Results

### Sample Output

```
✓ profile lookup successful
✓ response time acceptable

http_req_duration..............: avg=45ms  p(95)=120ms p(99)=250ms
http_req_failed................: 0.00%
iterations.....................: 3000  10/s

Custom metrics:
  identifier_type_slug.........: avg=25ms
  identifier_type_did..........: avg=65ms  ← Compare this before/after index
  identifier_type_handle.......: avg=85ms
```

### Key Metrics

**Response Time (http_req_duration)**:
- p95 < 100ms: Excellent
- p95 100-200ms: Good
- p95 > 200ms: Needs investigation

**DID vs Slug Lookup**:
- Without index: DID is typically 5-10x slower than slug
- With index: DID should be similar to slug (~1-2x difference)

## Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Profile lookup (slug) | p95 < 100ms | p95 < 200ms |
| Profile lookup (DID) | p95 < 100ms | p95 < 200ms |
| Profile lookup (handle) | p95 < 200ms | p95 < 500ms |
| Activity feed | p95 < 300ms | p95 < 800ms |
| Error rate | < 0.1% | < 1% |

## Test Data Requirements

Tests require:
- At least 1 shadow user with Bluesky DID
- At least 1 event with activity feed entries
- Seeded database with test data

**Setup test data**:
```bash
npm run seed:run:relational
```

## Results Storage

Results are saved in `k6-tests/results/`:
- `baseline.json` - Initial performance measurements
- `latest.json` - Most recent test run
- `comparison.json` - Before/after index comparison

Add to `.gitignore`:
```
k6-tests/results/
```

## Troubleshooting

### API Connection Issues

```bash
# Verify API is running
curl http://localhost:3000/api/health

# Check tenant configuration
echo $TENANT_ID

# Verify database connection
npm run migration:run
```

### Poor Performance

```bash
# Check Redis/ElastiCache is running
redis-cli ping

# Verify database indexes exist
psql -U postgres -d openmeet_dev -c "\d users"

# Check for errors in logs
tail -f logs/app.log | grep ERROR
```

### No Test Data

```bash
# Seed the database
npm run seed:run:relational

# Verify users exist
psql -U postgres -d openmeet_dev -c "
  SELECT COUNT(*) FROM users WHERE \"isShadowAccount\" = true;
"
```

## Integration Examples

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "Running performance tests..."
npm run perf:test

if [ $? -ne 0 ]; then
  echo "Performance tests failed. Push aborted."
  exit 1
fi
```

### CI/CD Pipeline

```yaml
# .github/workflows/performance.yml
performance-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Install k6
      run: |
        sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
        echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
        sudo apt-get update
        sudo apt-get install k6
    - name: Run tests
      run: npm run perf:test
    - name: Upload results
      uses: actions/upload-artifact@v3
      with:
        name: performance-results
        path: k6-tests/results/
```

## Manual Execution

Run k6 directly for more control:

```bash
# Basic run
k6 run k6-tests/profile-lookup.js

# With custom environment
API_URL=http://localhost:3000 k6 run k6-tests/profile-lookup.js

# Custom load profile
k6 run --vus 50 --duration 2m k6-tests/activity-feed.js

# Generate HTML report (requires k6-reporter)
k6 run --out json=results.json k6-tests/profile-lookup.js
```
