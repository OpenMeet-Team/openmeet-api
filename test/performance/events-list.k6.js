import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const eventListDuration = new Trend('event_list_duration', true);

// Configuration - override with environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const TENANT_ID = __ENV.TENANT_ID || 'oiupsdknasfdf';

// Test options
export const options = {
  scenarios: {
    // Baseline test - constant load
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests should be under 1s
    errors: ['rate<0.1'], // Error rate should be less than 10%
    event_list_duration: ['p(95)<1000'], // Custom metric threshold
  },
};

// Headers for all requests
const headers = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_ID,
};

export default function () {
  // Test 1: List events (unauthenticated - public events only)
  const listEventsRes = http.get(`${BASE_URL}/events?page=1&limit=10`, {
    headers,
    tags: { name: 'GET /events' },
  });

  // Track custom duration metric
  eventListDuration.add(listEventsRes.timings.duration);

  // Validate response
  const listCheck = check(listEventsRes, {
    'list events status is 200': (r) => r.status === 200,
    'list events has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data !== undefined;
      } catch {
        return false;
      }
    },
    'list events response time < 500ms': (r) => r.timings.duration < 500,
    'list events response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!listCheck);

  // Test 2: List events with search parameter
  const searchRes = http.get(`${BASE_URL}/events?page=1&limit=10&search=test`, {
    headers,
    tags: { name: 'GET /events?search' },
  });

  check(searchRes, {
    'search events status is 200': (r) => r.status === 200,
  });

  // Test 3: List events with pagination
  const page2Res = http.get(`${BASE_URL}/events?page=2&limit=10`, {
    headers,
    tags: { name: 'GET /events?page=2' },
  });

  check(page2Res, {
    'page 2 events status is 200': (r) => r.status === 200,
  });

  // Small pause between iterations
  sleep(0.5);
}

// Setup function - runs once before test
export function setup() {
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Tenant ID: ${TENANT_ID}`);

  // Verify API is reachable
  const healthRes = http.get(`${BASE_URL.replace('/api', '')}/`, {
    headers,
  });

  if (healthRes.status !== 200) {
    console.warn(`Health check returned status ${healthRes.status}`);
  }

  return { startTime: Date.now() };
}

// Teardown function - runs once after test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration}s`);
}

// Handle summary output
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      http_req_duration: {
        avg: data.metrics.http_req_duration?.values?.avg,
        p95: data.metrics.http_req_duration?.values?.['p(95)'],
        p99: data.metrics.http_req_duration?.values?.['p(99)'],
      },
      event_list_duration: {
        avg: data.metrics.event_list_duration?.values?.avg,
        p95: data.metrics.event_list_duration?.values?.['p(95)'],
        p99: data.metrics.event_list_duration?.values?.['p(99)'],
      },
      errors: data.metrics.errors?.values?.rate,
      iterations: data.metrics.iterations?.values?.count,
    },
  };

  return {
    'test/performance/results/events-list-summary.json': JSON.stringify(
      summary,
      null,
      2,
    ),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Simple text summary helper
function textSummary(data, options) {
  const lines = [
    '\n========== EVENTS LIST PERFORMANCE TEST ==========\n',
    `Iterations: ${data.metrics.iterations?.values?.count || 0}`,
    `Duration: ${((data.state?.testRunDurationMs || 0) / 1000).toFixed(2)}s`,
    '',
    'HTTP Request Duration:',
    `  avg: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms`,
    `  p95: ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms`,
    `  p99: ${(data.metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2)}ms`,
    '',
    'Event List Duration (custom):',
    `  avg: ${(data.metrics.event_list_duration?.values?.avg || 0).toFixed(2)}ms`,
    `  p95: ${(data.metrics.event_list_duration?.values?.['p(95)'] || 0).toFixed(2)}ms`,
    '',
    `Error Rate: ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    '\n==================================================\n',
  ];

  return lines.join('\n');
}
