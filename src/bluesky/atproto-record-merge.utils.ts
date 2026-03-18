/**
 * Merge an array field from a PDS record with OpenMeet's current entries.
 * - Removes old OpenMeet entries (tagged with source: 'openmeet')
 * - Removes legacy untagged OpenMeet entries (identified by URL pattern)
 * - Appends OpenMeet's current entries
 * - Preserves all other apps' entries
 */
export function mergeArrayField(
  pdsArray: any[] | undefined,
  openMeetEntries: any[],
): any[] {
  const othersEntries = (pdsArray ?? []).filter(
    (entry) => entry.source !== 'openmeet' && !isLegacyOpenMeetEntry(entry),
  );
  return [...othersEntries, ...openMeetEntries];
}

/**
 * Identify legacy OpenMeet-created entries that don't have a source tag.
 * Used for backward compatibility on first read-modify-write of existing records.
 */
export function isLegacyOpenMeetEntry(entry: any): boolean {
  if (!entry?.uri) return false;

  // OpenMeet Event link
  if (entry.name === 'OpenMeet Event') return true;

  // OpenMeet platform URLs
  if (entry.uri.includes('openmeet.net')) return true;

  // CloudFront CDN URLs (OpenMeet image hosting)
  if (entry.uri.includes('cloudfront.net')) return true;

  return false;
}
