import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics for activity feed performance
const feedLoadDuration = new Trend('activity_feed_load_duration');
const feedItemCount = new Trend('activity_feed_item_count');
const handleResolutionSuccess = new Rate('handle_resolution_success');
const shadowUserPresent = new Counter('shadow_users_in_feed');
const feedLoadErrors = new Counter('feed_load_errors');

// Configuration
const API_URL = __ENV.API_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'lsdfaopkljdfs';

export const options = {
  scenarios: {
    activity_feed: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.TEST_RATE) || 10, // 10 requests per second
      duration: __ENV.TEST_DURATION || '5m',
      preAllocatedVUs: parseInt(__ENV.TEST_VUS) || 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<300', 'p(99)<800'], // Activity feed includes handle resolution
    'http_req_failed': ['rate<0.01'], // Less than 1% errors
    'activity_feed_load_duration': ['p(95)<300', 'p(99)<800'],
    'handle_resolution_success': ['rate>0.99'], // 99%+ handles resolved successfully
    'feed_load_errors': ['count<10'],
  },
};

export default function() {
  const headers = {
    'x-tenant-id': TENANT_ID,
    'Content-Type': 'application/json',
  };

  // Test different feed types
  const feedType = Math.floor(Math.random() * 3);

  switch (feedType) {
    case 0:
      testSitewideFeed(headers);
      break;
    case 1:
      testGroupFeed(headers);
      break;
    case 2:
      testEventFeed(headers);
      break;
  }
}

function testSitewideFeed(headers) {
  group('Sitewide Activity Feed', () => {
    const url = `${API_URL}/api/v1/activity-feed/sitewide?limit=20`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    feedLoadDuration.add(duration);

    const success = check(response, {
      'sitewide feed: status 200': (r) => r.status === 200,
      'sitewide feed: has data': (r) => r.body.length > 0,
      'sitewide feed: response time OK': () => duration < 500,
    });

    if (!success) {
      feedLoadErrors.add(1);
      console.error(`Sitewide feed failed: ${response.status}`);
      return;
    }

    // Analyze feed contents
    const data = JSON.parse(response.body);
    const activities = Array.isArray(data) ? data : (data.data || []);

    feedItemCount.add(activities.length);

    // Check handle resolution
    activities.forEach(activity => {
      if (activity.displayName) {
        // New field from backend handle resolution
        const isDidFormat = activity.displayName.startsWith('did:');
        handleResolutionSuccess.add(!isDidFormat);

        if (!isDidFormat) {
          // Successfully resolved handle
          check(activity, {
            'has resolved handle': (a) => a.displayName && !a.displayName.startsWith('did:'),
          });
        } else {
          // Failed to resolve - still showing DID
          console.warn(`DID not resolved: ${activity.displayName}`);
        }
      }

      // Check for shadow users
      if (activity.metadata?.actorName && activity.metadata.actorName.includes('.')) {
        // Likely a handle (shadow user)
        shadowUserPresent.add(1);
      }
    });

    check(activities, {
      'feed has items': (acts) => acts.length > 0,
      'no DIDs in display names': (acts) => acts.every(a =>
        !a.displayName || !a.displayName.startsWith('did:')
      ),
    });
  });
}

function testGroupFeed(headers) {
  group('Group Activity Feed', () => {
    // Use a test group slug - update this to match your seed data
    const testGroupSlug = __ENV.TEST_GROUP_SLUG || 'test-group-abc123';
    const url = `${API_URL}/api/v1/groups/${testGroupSlug}/feed?limit=20`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    feedLoadDuration.add(duration);

    // Group might not exist in all environments, 404 is acceptable
    const success = check(response, {
      'group feed: status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'group feed: response time OK': () => duration < 500,
    });

    if (!success) {
      feedLoadErrors.add(1);
      return;
    }

    if (response.status === 200) {
      const data = JSON.parse(response.body);
      const activities = Array.isArray(data) ? data : (data.data || []);
      feedItemCount.add(activities.length);

      // Check handle resolution for group feeds too
      activities.forEach(activity => {
        if (activity.displayName) {
          const isDidFormat = activity.displayName.startsWith('did:');
          handleResolutionSuccess.add(!isDidFormat);
        }
      });
    }
  });
}

function testEventFeed(headers) {
  group('Event Activity Feed', () => {
    // Use a test event slug - update this to match your seed data
    const testEventSlug = __ENV.TEST_EVENT_SLUG || 'test-event-xyz789';
    const url = `${API_URL}/api/v1/events/${testEventSlug}/feed?limit=20`;

    const startTime = Date.now();
    const response = http.get(url, { headers });
    const duration = Date.now() - startTime;

    feedLoadDuration.add(duration);

    // Event might not exist in all environments, 404 is acceptable
    const success = check(response, {
      'event feed: status 200 or 404': (r) => r.status === 200 || r.status === 404,
      'event feed: response time OK': () => duration < 500,
    });

    if (!success) {
      feedLoadErrors.add(1);
      return;
    }

    if (response.status === 200) {
      const data = JSON.parse(response.body);
      const activities = Array.isArray(data) ? data : (data.data || []);
      feedItemCount.add(activities.length);

      // Check handle resolution
      activities.forEach(activity => {
        if (activity.displayName) {
          const isDidFormat = activity.displayName.startsWith('did:');
          handleResolutionSuccess.add(!isDidFormat);
        }
      });
    }
  });
}

export function setup() {
  console.log(`Testing against: ${API_URL}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Duration: ${__ENV.TEST_DURATION || '5m'}`);
  console.log(`Rate: ${__ENV.TEST_RATE || 10} req/s`);
  console.log('');
  console.log('NOTE: Update TEST_GROUP_SLUG and TEST_EVENT_SLUG environment variables');
  console.log('      to match your seeded test data for accurate group/event feed tests.');
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
  console.log('Activity Feed Performance Test Complete');
  console.log('='.repeat(80));
  console.log('');
  console.log('Key metrics to review:');
  console.log('  - activity_feed_load_duration: Overall feed load time');
  console.log('  - activity_feed_item_count: Average items per request');
  console.log('  - handle_resolution_success: % of handles resolved (should be >95%)');
  console.log('  - shadow_users_in_feed: Count of shadow users detected');
  console.log('');
  console.log('Success criteria:');
  console.log('  ✓ p95 < 300ms for feed loads');
  console.log('  ✓ >99% handle resolution success rate');
  console.log('  ✓ No DIDs visible in displayName fields');
  console.log('');
}
