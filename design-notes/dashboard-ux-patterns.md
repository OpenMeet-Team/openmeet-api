# Dashboard UX Patterns for Large Data Sets

> **Confidence:** untested
> **Added:** 2025-12-06
> **Context:** Issue #397 - User with 1000+ events causing performance/UX issues

## Problem

Traditional pagination doesn't solve the UX problem for power users. A user with 2000 events would need 67+ pages at 30/page. Users don't want to scroll through history - they want to know "what's next."

## Pattern: "What's Next" Dashboard

Instead of loading all data and paginating, show a focused view:

### UX Structure

```
┌─────────────────────────────────────────────────────┐
│ Stats Summary                                       │
│ [Hosting 1,024 upcoming] [Attending 987] [Past 500] │
├─────────────────────────────────────────────────────┤
│ HOSTING THIS WEEK (3)                               │
│ [Event 1] [Event 2] [Event 3]                       │
├─────────────────────────────────────────────────────┤
│ HOSTING LATER (5 of 1,021)            View all →    │
│ [Event 4] [Event 5] ... (limited preview)           │
├─────────────────────────────────────────────────────┤
│ ATTENDING SOON (5 of 987)             View all →    │
│ [Event A] [Event B] ... (limited preview)           │
├─────────────────────────────────────────────────────┤
│ Past events (500)                     Browse past → │
└─────────────────────────────────────────────────────┘
```

### Key Principles

1. **Summary stats first** - Counts give context without loading data
2. **Temporal grouping** - "This Week" vs "Later" adds meaning
3. **Limited previews** - Show ~5 items, not all
4. **Lazy-load secondary data** - Past events loaded on demand
5. **"View all" links** - Lead to paginated full lists

## Pattern: Dashboard Summary API

Single endpoint returning counts + limited previews:

### Response Structure

```typescript
interface DashboardSummaryDto {
  counts: {
    hostingUpcoming: number;
    attendingUpcoming: number;
    past: number;
  };
  hostingThisWeek: EventEntity[];  // Full list (typically small)
  hostingLater: EventEntity[];     // Limited to ~5
  attendingSoon: EventEntity[];    // Limited to ~5
}
```

### Implementation Pattern

```typescript
async getDashboardSummary(userId: number): Promise<DashboardSummaryDto> {
  // 1. Define query builder factories for reuse
  const createHostingQuery = () => /* base query for hosting */;
  const createAttendingQuery = () => /* base query for attending */;

  // 2. Execute all queries in parallel
  const [
    hostingUpcomingCount,
    attendingUpcomingCount,
    pastCount,
    hostingThisWeek,
    hostingLater,
    attendingSoon,
  ] = await Promise.all([
    createHostingQuery().andWhere('startDate >= :now').getCount(),
    createAttendingQuery().andWhere('startDate >= :now').getCount(),
    getPastEventsCount(userId),
    createHostingQuery().andWhere('startDate BETWEEN :now AND :endOfWeek').getMany(),
    createHostingQuery().andWhere('startDate > :endOfWeek').limit(5).getMany(),
    createAttendingQuery().andWhere('startDate >= :now').limit(5).getMany(),
  ]);

  // 3. Batch fetch related data (avoid N+1)
  const allEvents = [...hostingThisWeek, ...hostingLater, ...attendingSoon];
  await batchFetchAttendeeCounts(allEvents);

  return { counts, hostingThisWeek, hostingLater, attendingSoon };
}
```

### Benefits

- **Fast initial load** - Counts are cheap, limited data fetched
- **Scales to any size** - 20 events or 20,000 events, same performance
- **Progressive disclosure** - Full data available via drill-down
- **Parallel execution** - All queries run concurrently

## Files Implementing This Pattern

- `src/event/dto/dashboard-summary.dto.ts` - Response DTO
- `src/event/services/event-query.service.ts` - `getDashboardSummary()`
- `src/event/event.controller.ts` - `GET /api/events/dashboard/summary`

## Validation

To validate this pattern works:
- [ ] Test with user who has 1000+ events
- [ ] Measure initial load time vs legacy endpoint
- [ ] Get user feedback on the UX
- [ ] Check if "view all" is used frequently (might indicate preview is too limited)
