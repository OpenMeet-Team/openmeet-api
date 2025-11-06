#!/usr/bin/env node

/**
 * Compare k6 baseline and comparison test results
 * Usage: node k6-tests/compare-results.js
 */

const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, 'results');
const baselinePath = path.join(resultsDir, 'baseline.json');
const latestPath = path.join(resultsDir, 'latest.json');

// Check if files exist
if (!fs.existsSync(baselinePath)) {
  console.error('❌ Baseline results not found. Run: npm run perf:baseline');
  process.exit(1);
}

if (!fs.existsSync(latestPath)) {
  console.error('❌ Comparison results not found. Run: npm run perf:compare');
  process.exit(1);
}

// Load results
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

// Calculate improvements
const p95Improvement = {
  ms: baseline.metrics.did_lookup_p95 - latest.metrics.did_lookup_p95,
  percent: ((baseline.metrics.did_lookup_p95 - latest.metrics.did_lookup_p95) / baseline.metrics.did_lookup_p95 * 100)
};

const avgImprovement = {
  ms: baseline.metrics.did_lookup_avg - latest.metrics.did_lookup_avg,
  percent: ((baseline.metrics.did_lookup_avg - latest.metrics.did_lookup_avg) / baseline.metrics.did_lookup_avg * 100)
};

// Generate recommendation
let recommendation;
if (p95Improvement.percent > 50) {
  recommendation = '✅ RECOMMENDED: Add the composite index. Significant performance improvement (>50%).';
} else if (p95Improvement.percent > 20) {
  recommendation = '⚠️  CONSIDER: Moderate improvement (20-50%). Evaluate based on DID lookup frequency.';
} else if (p95Improvement.percent > 0) {
  recommendation = '❌ NOT RECOMMENDED: Minimal improvement (<20%). Index overhead not worth it.';
} else {
  recommendation = '❌ NOT RECOMMENDED: Performance degraded with index. Do not add.';
}

// Print comparison
console.log('');
console.log('='.repeat(80));
console.log('PERFORMANCE COMPARISON: DID LOOKUP WITH/WITHOUT COMPOSITE INDEX');
console.log('='.repeat(80));
console.log('');
console.log('Baseline (WITHOUT index):');
console.log(`  Timestamp: ${baseline.timestamp}`);
console.log(`  p95:       ${baseline.metrics.did_lookup_p95.toFixed(2)}ms`);
console.log(`  Average:   ${baseline.metrics.did_lookup_avg.toFixed(2)}ms`);
console.log(`  Iterations: ${baseline.iterations}`);
console.log(`  Errors:    ${baseline.errors}`);
console.log('');
console.log('Latest (WITH index):');
console.log(`  Timestamp: ${latest.timestamp}`);
console.log(`  p95:       ${latest.metrics.did_lookup_p95.toFixed(2)}ms`);
console.log(`  Average:   ${latest.metrics.did_lookup_avg.toFixed(2)}ms`);
console.log(`  Iterations: ${latest.iterations}`);
console.log(`  Errors:    ${latest.errors}`);
console.log('');
console.log('Improvement:');
console.log(`  p95:       ${p95Improvement.ms.toFixed(2)}ms faster (${p95Improvement.percent.toFixed(1)}%)`);
console.log(`  Average:   ${avgImprovement.ms.toFixed(2)}ms faster (${avgImprovement.percent.toFixed(1)}%)`);
console.log('');
console.log('Recommendation:');
console.log(`  ${recommendation}`);
console.log('');
console.log('='.repeat(80));
console.log('');

// Save comparison report
const comparison = {
  baseline: baseline.metrics,
  withIndex: latest.metrics,
  improvement: {
    p95_ms: p95Improvement.ms,
    p95_percent: p95Improvement.percent,
    avg_ms: avgImprovement.ms,
    avg_percent: avgImprovement.percent
  },
  recommendation,
  timestamps: {
    baseline: baseline.timestamp,
    latest: latest.timestamp
  }
};

const comparisonPath = path.join(resultsDir, 'comparison.json');
fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
console.log(`Full comparison saved to: ${comparisonPath}`);
console.log('');
