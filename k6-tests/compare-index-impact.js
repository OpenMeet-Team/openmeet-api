import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Focused metric: DID lookup performance only
const didLookupDuration = new Trend('did_lookup_duration_ms');

// Configuration
const API_URL = __ENV.API_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'lsdfaopkljdfs';
const MODE = __ENV.MODE || 'baseline'; // 'baseline' or 'comparison'

// Test DIDs - actual DIDs from shadow users in the database
const TEST_DIDS = [
  'did:plc:piobscs63j5o53wzbgqidgj6',
  'did:plc:tldaoujl376zu5wezaznxfev',
  'did:plc:oalsdauozmx7wgt4fsb6hzhm',
  'did:plc:pqerwmnouevyltxyoayhholf',
  'did:plc:jjsc5rflv3cpv6hgtqhn2dcm',
];

export const options = {
  scenarios: {
    did_lookup_only: {
      executor: 'constant-arrival-rate',
      rate: 20, // Higher rate for focused test
      duration: __ENV.TEST_DURATION || '2m', // Shorter focused test
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.01'],
    'did_lookup_duration_ms': ['p(50)>0', 'p(95)>0', 'p(99)>0'], // No fail threshold, just measure
  },
};

export default function() {
  // Only test DID lookups for accurate comparison
  const did = TEST_DIDS[Math.floor(Math.random() * TEST_DIDS.length)];
  const url = `${API_URL}/api/v1/users/${encodeURIComponent(did)}/profile`;

  const headers = {
    'x-tenant-id': TENANT_ID,
    'Content-Type': 'application/json',
  };

  const startTime = Date.now();
  const response = http.get(url, { headers });
  const duration = Date.now() - startTime;

  didLookupDuration.add(duration);

  check(response, {
    'DID lookup succeeded': (r) => r.status === 200 || r.status === 404,
    'response has content': (r) => r.body.length > 0,
  });
}

export function setup() {
  console.log('');
  console.log('='.repeat(80));
  console.log('DID Lookup Performance Test - Index Impact Measurement');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Mode: ${MODE}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Test DIDs: ${TEST_DIDS.length} unique DIDs`);
  console.log(`Duration: ${__ENV.TEST_DURATION || '2m'}`);
  console.log('');

  if (MODE === 'baseline') {
    console.log('📊 BASELINE MODE');
    console.log('   Running performance test WITHOUT composite index');
    console.log('   Results will be saved to k6-tests/results/baseline.json');
    console.log('');
    console.log('   Next steps:');
    console.log('   1. Wait for this test to complete');
    console.log('   2. Add composite index to database:');
    console.log('      CREATE INDEX idx_users_socialid_provider');
    console.log('      ON users("socialId", provider)');
    console.log('      WHERE "socialId" IS NOT NULL;');
    console.log('   3. Run: MODE=comparison npm run perf:compare');
  } else if (MODE === 'comparison') {
    console.log('📈 COMPARISON MODE');
    console.log('   Running performance test WITH composite index');
    console.log('   Will compare against k6-tests/results/baseline.json');
    console.log('   Results will be saved to k6-tests/results/comparison.json');
  }

  console.log('');

  // Verify API health
  const response = http.get(`${API_URL}/health/liveness`);
  if (response.status !== 200) {
    throw new Error(`API health check failed: ${response.status}`);
  }
  console.log('✓ API health check passed');
  console.log('');

  return {
    mode: MODE,
    testDids: TEST_DIDS,
    timestamp: new Date().toISOString(),
  };
}

export function handleSummary(data) {
  const resultsDir = 'k6-tests/results';
  const mode = __ENV.MODE || 'baseline';

  // Extract key metrics
  const p50 = data.metrics.did_lookup_duration_ms.values['p(50)'];
  const p95 = data.metrics.did_lookup_duration_ms.values['p(95)'];
  const p99 = data.metrics.did_lookup_duration_ms.values['p(99)'];
  const avg = data.metrics.did_lookup_duration_ms.values.avg;
  const reqDuration95 = data.metrics.http_req_duration.values['p(95)'];

  const summary = {
    mode: mode,
    timestamp: new Date().toISOString(),
    metrics: {
      did_lookup_p50: p50,
      did_lookup_p95: p95,
      did_lookup_p99: p99,
      did_lookup_avg: avg,
      http_req_duration_p95: reqDuration95,
    },
    iterations: data.metrics.iterations.values.count,
    errors: data.metrics.http_req_failed.values.passes,
  };

  const outputs = {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };

  // Save results
  if (mode === 'baseline') {
    outputs[`${resultsDir}/baseline.json`] = JSON.stringify(summary, null, 2);
    console.log('');
    console.log('✅ Baseline results saved to k6-tests/results/baseline.json');
  } else if (mode === 'comparison') {
    outputs[`${resultsDir}/latest.json`] = JSON.stringify(summary, null, 2);

    // Try to load baseline and compare
    try {
      const fs = require('fs');
      const baselinePath = `${resultsDir}/baseline.json`;

      if (fs.existsSync(baselinePath)) {
        const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

        const comparison = {
          baseline: baseline.metrics,
          withIndex: summary.metrics,
          improvement: {
            p50_ms: baseline.metrics.did_lookup_p50 - summary.metrics.did_lookup_p50,
            p50_percent: ((baseline.metrics.did_lookup_p50 - summary.metrics.did_lookup_p50) / baseline.metrics.did_lookup_p50 * 100),
            p95_ms: baseline.metrics.did_lookup_p95 - summary.metrics.did_lookup_p95,
            p95_percent: ((baseline.metrics.did_lookup_p95 - summary.metrics.did_lookup_p95) / baseline.metrics.did_lookup_p95 * 100),
            p99_ms: baseline.metrics.did_lookup_p99 - summary.metrics.did_lookup_p99,
            p99_percent: ((baseline.metrics.did_lookup_p99 - summary.metrics.did_lookup_p99) / baseline.metrics.did_lookup_p99 * 100),
          },
          recommendation: '',
        };

        // Generate recommendation
        const p95Improvement = comparison.improvement.p95_percent;
        if (p95Improvement > 50) {
          comparison.recommendation = '✅ RECOMMENDED: Add the composite index. Significant performance improvement (>50%).';
        } else if (p95Improvement > 20) {
          comparison.recommendation = '⚠️  CONSIDER: Moderate improvement (20-50%). Evaluate based on DID lookup frequency.';
        } else if (p95Improvement > 0) {
          comparison.recommendation = '❌ NOT RECOMMENDED: Minimal improvement (<20%). Index overhead not worth it.';
        } else {
          comparison.recommendation = '❌ NOT RECOMMENDED: Performance degraded with index. Do not add.';
        }

        outputs[`${resultsDir}/comparison.json`] = JSON.stringify(comparison, null, 2);

        console.log('');
        console.log('='.repeat(80));
        console.log('PERFORMANCE COMPARISON');
        console.log('='.repeat(80));
        console.log('');
        console.log('DID Lookup Performance:');
        console.log('');
        console.log('                  BASELINE    WITH INDEX    IMPROVEMENT');
        console.log('                  --------    ----------    -----------');
        console.log(`p50 (median):     ${baseline.metrics.did_lookup_p50.toFixed(2)}ms      ${summary.metrics.did_lookup_p50.toFixed(2)}ms        ${comparison.improvement.p50_percent.toFixed(1)}%`);
        console.log(`p95:              ${baseline.metrics.did_lookup_p95.toFixed(2)}ms      ${summary.metrics.did_lookup_p95.toFixed(2)}ms        ${comparison.improvement.p95_percent.toFixed(1)}%`);
        console.log(`p99:              ${baseline.metrics.did_lookup_p99.toFixed(2)}ms      ${summary.metrics.did_lookup_p99.toFixed(2)}ms        ${comparison.improvement.p99_percent.toFixed(1)}%`);
        console.log('');
        console.log(comparison.recommendation);
        console.log('');
        console.log('Full comparison saved to k6-tests/results/comparison.json');
      } else {
        console.log('');
        console.log('⚠️  No baseline found. Run with MODE=baseline first.');
      }
    } catch (error) {
      console.log(`Error comparing with baseline: ${error.message}`);
    }
  }

  return outputs;
}
