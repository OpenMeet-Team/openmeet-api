/**
 * Merge an array field from a PDS record with OpenMeet's current entries.
 * - Removes old entries tagged with the given sourceId
 * - Removes legacy untagged OpenMeet entries (identified by URL pattern)
 * - Appends OpenMeet's current entries
 * - Preserves all other apps' entries
 */
export function mergeArrayField(
  pdsArray: any[] | undefined,
  openMeetEntries: any[],
  sourceId: string,
): any[] {
  const othersEntries = (pdsArray ?? []).filter(
    (entry) => entry.source !== sourceId && !isLegacyOpenMeetEntry(entry),
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

  // CloudFront CDN URLs with OpenMeet-specific name labels.
  // Must also match name to avoid false positives — CloudFront is widely used.
  if (
    entry.uri.includes('cloudfront.net') &&
    (entry.name === 'Event Image' || entry.name === 'Online Meeting Link')
  )
    return true;

  return false;
}
