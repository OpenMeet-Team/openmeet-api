# OpenMeet API Architecture Issues

This document tracks architectural issues, technical debt, and improvement opportunities in the OpenMeet API codebase.

## Service Dependency and Responsibility Issues

### Event Management Service Dependencies

**Issue Identified:** 2023-11-15

**Description:**  
The `EventManagementService` has too many dependencies and responsibilities, directly handling operations across multiple domains:

1. **Direct Database Operations on Non-Event Tables:**
   - Currently reaches into chat room tables during event deletion
   - Directly manipulates event attendee records through TypeORM repositories
   - Handles series exceptions and recurrence rules

2. **Cross-Domain Knowledge Requirements:**
   - The service must understand the schema and relationships of chat rooms, event attendees, and event series
   - Changes to any of these related entities require updates to the event management service

3. **Transaction Management Complexity:**
   - Manages complex transaction flows across multiple entity types
   - Error handling becomes complicated due to multiple failure points

**Impacts:**
- Tight coupling between modules
- Difficult maintenance and higher likelihood of bugs
- Errors like "No metadata for 'EventAttendee' was found" when entity references are incorrect

**Proposed Solutions:**

1. **Domain Service Delegation:**
   - Event service should delegate operations to respective domain services
   - Services should expose appropriate methods for transaction participation

2. **Event-Driven Architecture:**
   - Use events to handle cascading deletions and updates
   - Decouple direct service-to-service dependencies

3. **Repository Abstraction:**
   - Avoid direct manipulation of repositories across domain boundaries
   - Encapsulate database operations within their respective services

4. **Transaction Abstractions:**
   - Create transaction abstractions to simplify cross-service transactions
   - Allow services to participate in transactions without direct coupling

**Next Steps:**
- Refactor `remove()` method in EventManagementService to use proper service delegation
- Create abstraction for transaction management across multiple services
- Document cross-service transaction patterns 

### Event Series Relationship Persistence Issues

**Issue Identified:** 2024-07-12  
**Updated:** 2025-04-19  
**Updated:** 2025-04-20  
**Updated:** 2025-04-21  
**Updated:** 2025-04-22 - Fix Implemented

**Description:**  
The relationship between Events and EventSeries has persistence issues that cause seriesSlug references to be lost:

1. **Entity Relationship Configuration:**
   - The ManyToOne relationship in EventEntity with EventSeriesEntity may have incorrect cascade settings
   - Connection is sometimes lost when creating events with seriesSlug specified
   - Current configuration only cascades 'update' operations but not 'insert' or other operations
   - The EventEntity defines both a ManyToOne relationship AND a direct column for seriesSlug which may lead to inconsistency

2. **ORM Save Operation Behavior:**
   - When an event is saved with a seriesSlug, the relationship sometimes doesn't persist correctly
   - Workarounds currently include post-save verification and explicit restoration of lost links
   - TypeORM may not properly maintain the string column when operating on the relationship object

3. **Materialization Process Failures:**
   - When materializing series occurrences, the seriesSlug can get disconnected
   - Error handling doesn't properly check or restore these relationships
   - Lazy loading of relationships may contribute to the issue

4. **BlueskyService Integration Issues:**
   - When a Bluesky event is created or updated, subsequent BlueskyService operations reset the seriesSlug to null
   - Logs show correct series association initially, then verification failure after Bluesky updates
   - Current workarounds involve re-applying the seriesSlug after Bluesky operations

5. **Missing Database Constraint:**
   - **Critical issue identified**: The foreign key constraint between `events.seriesSlug` and `eventSeries.slug` is missing
   - The migration that attempted to create this constraint (1743371499235-RedesignRecurringEvents.ts) has a try-catch block that silently fails
   - Without this constraint, database integrity isn't enforced, allowing seriesSlug to be set to any value or cleared without validation
   - This explains why the relationship can be lost during various operations, especially in CI environments with different transaction isolation levels

6. **Occurrence Generation Missing Template Event:**
   - **New issue identified (2025-04-20)**: When generating occurrences for a series, the original template event is often missing from the results
   - Root cause: The template event has lost its seriesSlug reference, so it's not found when looking for events in the series
   - Current test workarounds: Explicitly limit the count of occurrences to match the expected number
   - Impact: Series display in UI is incomplete, missing the original event that started the series
   - Tests that expect a specific number of occurrences may fail inconsistently

7. **TypeORM Relationship Management Quirks:**
   - **New insight (2025-04-21)**: The core issue appears to be in how TypeORM manages the relationship between EventEntity and EventSeriesEntity
   - The `seriesSlug` is both a column (`@Column`) and a join column (`@JoinColumn`), creating potential for desynchronization
   - When TypeORM performs operations on the relationship, it might update the object reference but not the string column
   - Current cascading is set only to `cascade: ['update']` on the series-to-events relationship, which might not be enough
   - Direct repository operations may bypass relationship handling, causing fields to be lost
   - Race conditions may exist, particularly when creating events and series in separate operations

8. **Chat Room Creation Removing SeriesSlug:**
   - **Issue fixed (2025-04-22)**: Chat room creation for events was causing the seriesSlug to be reset to null
   - Root cause: The ChatRoomService's `createEventChatRoomWithTenant` method was loading the event with limited relations (only 'user') and then doing a full save after setting matrixRoomId, which discarded the series relationship
   - Fix: Updated the method to:
     1. Load the event with both 'user' and 'series' relations
     2. Use a targeted TypeORM `update()` operation instead of `save()` to only update the matrixRoomId field, preserving the seriesSlug
   - This ensures the series relationship is maintained when creating chat rooms for events that are part of a series

**Impacts:**
- Events get disconnected from their series
- UI shows events as standalone when they should be part of a series
- Series management features fail to display or update all related events
- Band-aid fixes add complexity without addressing root cause
- Bluesky events consistently lose their series association without special handling
- Tests may pass locally but fail in CI due to different transaction isolation levels affecting the relationship
- Original events that started a series may disappear from series views
- Maintenance complexity increases as more emergency fixes are added

**Proposed Solutions:**

1. **Database Constraint Implementation:**
   - Create a new migration to add the missing foreign key constraint:
     see `../src/database/migrations/1745248488000-UnifiedSeriesRelationshipMigration.ts`
   - This will ensure database-level protection of the relationship

2. **Entity Relationship Redesign:**
   - Review and correct the TypeORM entity relationship decorators
   - Ensure proper cascade options are set for the series-event relationship
   - Consider expanding cascading to include all operations: `cascade: true` (covers insert, update, remove)
   - Evaluate whether the direct `seriesSlug` column is necessary alongside the relationship

3. **Consistent Property Access:**
   - Standardize how the `seriesSlug` property is accessed and updated
   - Ensure that when `seriesSlug` is updated, the relationship is also updated (and vice versa)
   - Use TypeORM query builder consistently for relationship updates
   - Consider migrating to TypeORM's repository pattern consistently across the codebase

4. **Transactional Operations:**
   - Wrap critical operations in transactions when modifying both events and series
   - Include verification steps within the same transaction
   - Ensure rollback if relationship validation fails

5. **Comprehensive Testing:**
   - Add unit and integration tests focused on series relationship persistence
   - Create automated verification of relationship integrity
   - Ensure tests run in environments that match CI transaction isolation levels
   - Add specific tests for lazy-loading scenarios

6. **BlueskyService Modifications:**
   - After addressing the relationship issues, clean up the workarounds in BlueskyService
   - Simplify the property preservation code once the relationship is stable

7. **Occurrence Service Improvements:**
   - Update the occurrence service to use more robust methods to find the template event
   - Implement verification steps to ensure template events are correctly associated with their series
   - Add logging to track when relationship issues occur

8. **Chat Room Service Fix (IMPLEMENTED):**
   - Fixed in `src/chat/rooms/chat-room.service.ts` to preserve the series relationship during chat room creation
   - Modified the event loading to include series relation and changed the update approach to a targeted field update

**Next Steps:**
- Create a new migration to add the foreign key constraint
- Review and refactor the entity relationship configuration in TypeORM
- Expand cascading options on the relationship and test thoroughly
- Implement transactional operations for critical series-event interactions
- Test the relationship integrity thoroughly across all operations
- Clean up workarounds once the root cause is fixed

## Infrastructure Scaling Issues

### Bluesky Session Lock and ElastiCache Reliability Issues

**Issue Identified:** 2025-04-22
**Fixed:** 2025-04-22
**Updated:** 2025-04-23 - Additional Fix

**Description:**  
The application experiences intermittent failures when creating Bluesky events due to Redis lock acquisition failures and session management issues:

1. **ElastiCache Lock Acquisition Failures:**
   - Log errors show "Failed to acquire lock for @atproto-oauth-client-did:[user-did]"
   - When a lock cannot be acquired, the operation fails completely rather than falling back to a non-locked approach
   - This is particularly problematic for multi-step operations like Bluesky event creation that require session verification

2. **Session Resume Error Handling:**
   - When a session cannot be found or restored, the error handling doesn't provide clear fallback paths
   - Attempts to resume a session rely on locks that may fail to be acquired
   - The service attempts multiple retries but ultimately fails if sessions can't be found

3. **Redis Error Handling Weaknesses:**
   - Current Redis operation implementations (get, set, del) throw exceptions rather than returning success/failure flags
   - When Redis connections fail, the entire operation fails rather than being able to gracefully degrade
   - Session store implementations don't handle connection failures appropriately

4. **Transaction Isolation and Lock Management:**
   - Multiple services may try to access Bluesky sessions simultaneously, causing lock contention
   - The lock TTL (30 seconds) may be too short for complex operations in high-load scenarios
   - No monitoring or circuit-breaking for lock acquisition failures

**Impacts:**
- Users cannot create events on Bluesky when lock acquisition fails
- Redis connection issues cascade into application errors rather than graceful degradation
- Services using ElastiCache may experience intermittent failures
- Application appears unreliable to users, especially during periods of high load

**Implemented Fix:**
A targeted fix was implemented on 2025-04-22 that:

1. **Eliminated Unnecessary Locking:**
   - Removed the Redis locking mechanism from the `tryResumeSession` method in BlueskyService
   - Simplified the approach to directly restore sessions without trying to acquire locks first
   - This change addresses the immediate issue of "No session found" errors when creating Bluesky events

2. **Simplified Event Creation:**
   - Removed the complex lock-based approach from `createEventRecord`
   - Implemented a direct event creation flow without locks
   - This eliminates the failure point where lock acquisition was preventing event creation

The fix approach took the stance that locking was unnecessary in this particular case as:
- The Bluesky AtProto OAuth client likely already has internal consistency mechanisms
- Multiple simultaneous session operations shouldn't cause issues with the session store
- The complexity and fragility introduced by locks outweighed their benefits

**Additional Fix (2025-04-23):**
Following continued investigation, additional changes were made to remove unnecessary locking:

1. **Removed Lock from Event Creation:**
   - Updated the `createEventRecord` method to use the direct `tryResumeSession` instead of the lock-based `resumeSession`
   - This removed the dependency on ElastiCache lock acquisition for event creation
   - Event creation now proceeds without the need for distributed locks

2. **Simplified Session Handling:**
   - Modified the session restoration approach to be more direct and resilient
   - Eliminated potential deadlocks by removing the lock-based session operations
   - These changes reduce system complexity and remove a common failure point

This targeted approach addresses the immediate user-facing issue while minimizing changes to the broader codebase. The more comprehensive solutions outlined below should still be considered for long-term reliability.

**Proposed Long-term Solutions:**

1. **Resilient Lock Acquisition:**
   - Modify lock acquisition to attempt reconnection before failing
   - Update ElastiCache get/set/del methods to return success/failure indicators rather than throwing exceptions
   - Add fallback strategies when locks cannot be acquired

2. **Session Management Improvements:**
   - Implement fallback approach for session restoration without locks
   - Consider alternative session storage options besides Redis for critical auth data
   - Add monitoring for session restoration failures

3. **ElastiCache Service Enhancements:**
   - Improve error handling throughout the ElastiCache service
   - Add reconnection logic when operations fail due to connection issues
   - Implement proper error logging and monitoring for Redis operations

4. **Store Implementation Updates:**
   - Update the SessionStore implementations to handle failures gracefully
   - Add better logging for session operation failures
   - Implement TTL refresh strategies that don't fail session operations if refresh fails

**Next Steps:**
- Monitor the application to ensure the fix resolves the session errors
- Review all Redis-dependent code paths for proper error handling
- Consider implementing circuit breakers for Redis operations
- Test high-load scenarios to identify any remaining lock contention issues

### Matrix Chat Server Scaling Limitations

**Issue Identified:** 2023-11-15

**Description:**  
The Matrix chat server being used for event and group communication has severe scaling limitations:

1. **Room Proliferation:**
   - Dev environment accumulated 4100+ rooms, causing significant performance degradation
   - Each event and group creates at least one chat room
   - No automatic cleanup of rooms for past events

2. **Resource Consumption:**
   - Matrix server becomes sluggish with high room counts
   - Database size grows continuously without bounds
   - High memory and CPU usage as room count increases

3. **Missing Configuration Options:**
   - No ability to disable Matrix integration globally
   - No per-event or per-group chat enablement controls
   - No room retention policies for automatic cleanup

**Impacts:**
- Development environment performance issues
- Potential production scaling problems
- Increased infrastructure costs
- Poor user experience due to chat server latency

**Proposed Solutions:**

1. **Configurable Chat Integration:**
   - Add global flag to enable/disable Matrix integration
   - Implement per-event and per-group chat enablement settings
   - Default chat to disabled for new events/groups

2. **Retention Policies:**
   - Automatically remove chat rooms for events older than 1 month past expiration
   - Implement database purging for Matrix to prevent unbounded growth
   - Add scheduled job for room cleanup

3. **Alternative Chat Solutions:**
   - Evaluate lighter-weight alternatives to Matrix for basic chat functionality
   - Consider separating chat infrastructure from core application

**Next Steps:**
- Reset development Matrix database (see operations documentation)
- Implement global toggle for Matrix integration
- Add per-event and per-group chat enablement flags
- Develop retention policy for automatic room cleanup 