import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const dashboardDuration = new Trend('dashboard_duration', true);

// Configuration - override with environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const TENANT_ID = __ENV.TENANT_ID || 'lsdfaopkljdfs';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test options - lower VUs since this is a heavy endpoint
export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95% under 5s (it's currently slow)
    errors: ['rate<0.1'],
    dashboard_duration: ['p(95)<5000'],
  },
};

// Headers for all requests
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

export default function () {
  const headers = getHeaders();

  // Test dashboard endpoint (requires auth)
  const dashboardRes = http.get(`${BASE_URL}/events/dashboard`, {
    headers,
    tags: { name: 'GET /events/dashboard' },
  });

  // Track custom duration metric
  dashboardDuration.add(dashboardRes.timings.duration);

  // Validate response
  const dashboardCheck = check(dashboardRes, {
    'dashboard status is 200 or 401': (r) =>
      r.status === 200 || r.status === 401,
    'dashboard response time < 1000ms': (r) => r.timings.duration < 1000,
    'dashboard response time < 3000ms': (r) => r.timings.duration < 3000,
    'dashboard response time < 5000ms': (r) => r.timings.duration < 5000,
  });

  errorRate.add(!dashboardCheck);

  // Small pause between iterations
  sleep(0.5);
}

export function setup() {
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'provided' : 'NOT PROVIDED - will get 401'}`);

  if (!AUTH_TOKEN) {
    console.warn('WARNING: No AUTH_TOKEN provided. Dashboard requires authentication.');
    console.warn('Set AUTH_TOKEN env var with a valid JWT token.');
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration}s`);
}

export function handleSummary(data) {
  const lines = [
    '\n========== DASHBOARD EVENTS PERFORMANCE TEST ==========\n',
    `Iterations: ${data.metrics.iterations?.values?.count || 0}`,
    `Duration: ${((data.state?.testRunDurationMs || 0) / 1000).toFixed(2)}s`,
    '',
    'HTTP Request Duration:',
    `  avg: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms`,
    `  p95: ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms`,
    `  p99: ${(data.metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2)}ms`,
    '',
    'Dashboard Duration (custom):',
    `  avg: ${(data.metrics.dashboard_duration?.values?.avg || 0).toFixed(2)}ms`,
    `  p95: ${(data.metrics.dashboard_duration?.values?.['p(95)'] || 0).toFixed(2)}ms`,
    '',
    `Error Rate: ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    '\n=======================================================\n',
  ];

  return {
    stdout: lines.join('\n'),
  };
}
