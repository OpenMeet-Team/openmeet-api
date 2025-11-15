/**
 * Shared utilities for metrics collection
 */

/**
 * Categorize requests by API area to maintain low cardinality in metrics
 * Returns one of: events, groups, auth, matrix, bluesky, health, other
 *
 * This is used by both the request interceptor and exception filter to
 * ensure consistent categorization across all metrics.
 */
export function getApiArea(url: string): string {
  const path = url.split('?')[0].toLowerCase();

  if (path.includes('/health') || path.includes('/metrics')) return 'health';
  if (path.includes('/api/events') || path.includes('/api/event-series'))
    return 'events';
  if (path.includes('/api/groups')) return 'groups';
  if (path.includes('/api/auth') || path.includes('/api/v1/auth'))
    return 'auth';
  if (path.includes('/api/matrix')) return 'matrix';
  if (path.includes('/api/bluesky')) return 'bluesky';
  if (path.includes('/api/integration')) return 'integration';
  if (path.includes('/api/home') || path.includes('/api/feed')) return 'home';
  if (path.includes('/api/users')) return 'users';
  if (path.includes('/oidc')) return 'oidc';

  return 'other';
}
