import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Custom metrics to compare lookup performance by type
const slugLookupDuration = new Trend('identifier_type_slug');
const didLookupDuration = new Trend('identifier_type_did');
const handleLookupDuration = new Trend('identifier_type_handle');
const lookupErrors = new Counter('profile_lookup_errors');

// Configuration from environment or defaults
const API_URL = __ENV.API_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'lsdfaopkljdfs';

// Test configuration
export const options = {
  scenarios: {
    profile_lookup: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.TEST_RATE) || 10, // 10 requests per second
      duration: __ENV.TEST_DURATION || '5m',
      preAllocatedVUs: parseInt(__ENV.TEST_VUS) || 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'], // 95% under 200ms, 99% under 500ms
    'http_req_failed': ['rate<0.01'], // Less than 1% errors
    'profile_lookup_errors': ['count<10'], // Less than 10 total errors
    // Index impact measurement: DID lookups should be fast after adding index
    'identifier_type_did': ['p(95)<200', 'p(99)<500'],
    'identifier_type_slug': ['p(95)<100', 'p(99)<250'],
    'identifier_type_handle': ['p(95)<250', 'p(99)<600'],
  },
};

// Test data - actual identifiers from the database
const TEST_DATA = {
  // Regular slug lookup (existing user with slug)
  slugs: [
    'testing-14-pgah_a',
    'testing-13-g6e-52',
    'testing-12-xv8kxp',
  ],
  // DIDs from shadow users (created by Bluesky firehose ingestion)
  dids: [
    'did:plc:piobscs63j5o53wzbgqidgj6',
    'did:plc:tldaoujl376zu5wezaznxfev',
    'did:plc:oalsdauozmx7wgt4fsb6hzhm',
  ],
  // Bluesky handles (these are display names or handles from shadow users)
  handles: [
    'glenn poppe',
    'Vlad Sitalo',
    'Z. D. Smith',
  ],
};

export default function() {
  const headers = {
    'x-tenant-id': TENANT_ID,
    'Content-Type': 'application/json',
  };

  // Randomly select lookup type to mix traffic
  const lookupType = Math.floor(Math.random() * 3);

  switch (lookupType) {
    case 0: // Slug lookup
      testSlugLookup(headers);
      break;
    case 1: // DID lookup
      testDidLookup(headers);
      break;
    case 2: // Handle lookup
      testHandleLookup(headers);
      break;
  }
}

function testSlugLookup(headers) {
  group('Profile Lookup by Slug', () => {
    const slug = TEST_DATA.slugs[Math.floor(Math.random() * TEST_DATA.slugs.length)];
    const url = `${API_URL}/api/v1/users/${slug}/profile`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    slugLookupDuration.add(duration);

    const success = check(response, {
      'slug lookup: status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'slug lookup: has valid response': (r) => r.body.length > 0,
      'slug lookup: response time OK': () => duration < 300,
    });

    if (!success) {
      lookupErrors.add(1);
      console.error(`Slug lookup failed for ${slug}: ${response.status}`);
    }
  });
}

function testDidLookup(headers) {
  group('Profile Lookup by DID', () => {
    const did = TEST_DATA.dids[Math.floor(Math.random() * TEST_DATA.dids.length)];
    const url = `${API_URL}/api/v1/users/${encodeURIComponent(did)}/profile`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    didLookupDuration.add(duration);

    const success = check(response, {
      'DID lookup: status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'DID lookup: has valid response': (r) => r.body.length > 0,
      'DID lookup: response time OK': () => duration < 300,
      'DID lookup: performance acceptable': () => duration < 500,
    });

    if (!success) {
      lookupErrors.add(1);
      console.error(`DID lookup failed for ${did}: ${response.status}`);
    }

    // If found, verify it returns events/groups (full profile)
    if (response.status === 200) {
      const profile = JSON.parse(response.body);
      check(profile, {
        'DID lookup: returns user object': (p) => p.id !== undefined,
        'DID lookup: has slug': (p) => p.slug !== undefined,
      });
    }
  });
}

function testHandleLookup(headers) {
  group('Profile Lookup by Handle', () => {
    const handle = TEST_DATA.handles[Math.floor(Math.random() * TEST_DATA.handles.length)];
    const url = `${API_URL}/api/v1/users/${handle}/profile`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    handleLookupDuration.add(duration);

    const success = check(response, {
      'handle lookup: status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'handle lookup: has valid response': (r) => r.body.length > 0,
      'handle lookup: response time OK': () => duration < 400,
    });

    if (!success) {
      lookupErrors.add(1);
      console.error(`Handle lookup failed for ${handle}: ${response.status}`);
    }
  });
}

// Setup function to verify test data exists
export function setup() {
  console.log(`Testing against: ${API_URL}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Duration: ${__ENV.TEST_DURATION || '5m'}`);
  console.log(`Rate: ${__ENV.TEST_RATE || 10} req/s`);
  console.log('');
  console.log('Test identifiers:');
  console.log(`  Slugs: ${TEST_DATA.slugs.join(', ')}`);
  console.log(`  DIDs: ${TEST_DATA.dids.join(', ')}`);
  console.log(`  Handles: ${TEST_DATA.handles.join(', ')}`);
  console.log('');
  console.log('NOTE: Update TEST_DATA in this file to match your seeded data');
  console.log('');

  // Verify API is reachable
  const response = http.get(`${API_URL}/health/liveness`);
  if (response.status !== 200) {
    throw new Error(`API health check failed: ${response.status}`);
  }
  console.log('✓ API health check passed');
  console.log('');

  return { apiUrl: API_URL, tenantId: TENANT_ID };
}

export function teardown(data) {
  console.log('');
  console.log('='.repeat(80));
  console.log('Performance Test Complete');
  console.log('='.repeat(80));
  console.log('');
  console.log('Review the metrics above to compare performance by identifier type:');
  console.log('  - identifier_type_slug: Baseline (uses existing slug index)');
  console.log('  - identifier_type_did: Target for optimization (composite index)');
  console.log('  - identifier_type_handle: Includes handle resolution overhead');
  console.log('');
  console.log('To decide if composite index is needed:');
  console.log('  1. If DID lookup p95 > 200ms: Add index');
  console.log('  2. If DID is >3x slower than slug: Add index');
  console.log('  3. Run "npm run perf:compare" to measure exact improvement');
  console.log('');
}
