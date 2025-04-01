# Consolidated Implementation Plan: Event Series & ATProtocol Integration

This document provides a consolidated implementation plan for the Event Series model in OpenMeet and its integration with ATProtocol/Bluesky, addressing the relationships between recurring events, individual events, groups, and external platforms.

## 1. Implementation Phases

| Phase | Description | Duration | Focus |
|-------|-------------|----------|-------|
| **1** | **Core Schema and Entities** | 1 week | Database migrations, entity classes |
| **2** | **Series Management** | 1 week | Template logic, series CRUD |
| **3** | **Occurrence Management** | 1 week | Occurrence generation, exception handling |
| **4** | **Following and Attendance** | 1 week | Series following, occurrence attendance |
| **5** | **Chat Integration** | 1 week | Matrix room management for series |
| **6** | **ATProtocol Event Integration** | 2 weeks | Limited recurrence support, sync strategy |
| **7** | **Frontend Integration** | 2 weeks | UI components for all of the above |
| **8** | **Testing and Refinement** | 2 weeks | E2E testing, performance optimization |
| **9** | **ATProtocol Group Integration** (Future) | 1-2 weeks | Custom group lexicon implementation |

Note that Phases 1-5 focus on the core Event Series model within OpenMeet, while Phase 6 adds ATProtocol integration for events. Group integration with ATProtocol (Phase 9) is considered a future enhancement.

## 2. Entity Relationships

### 2.1 Core Entities & Relationships

```
┌────────────────┐       ┌────────────────┐       ┌────────────────┐
│                │       │                │       │                │
│     Group      │       │  EventSeries   │       │     User       │
│                │       │                │       │                │
└───────┬────────┘       └───────┬────────┘       └───────┬────────┘
        │                        │                        │
        │                        │                        │
        │                        │                        │
        │                        ▼                        │
        │                ┌────────────────┐               │
        └───────────────►│     Event      │◄──────────────┘
                         │  (Occurrence)  │
                         │                │
                         └────────────────┘
```

- **Events** can exist independently or as occurrences within an EventSeries
- **Groups** can exist independently, with or without associated events
- Events (standalone or series) can optionally belong to a Group
- Users can follow series and/or attend specific occurrences

### 2.2 External Integration Model

```
┌────────────────────────────────────┐       ┌────────────────────────────────┐
│                                    │       │                                │
│            OpenMeet                │       │         Bluesky                │
│                                    │       │                                │
│  ┌─────────────┐   ┌────────────┐  │       │  ┌──────────────┐             │
│  │             │   │            │  │       │  │              │             │
│  │ EventSeries ├───┤ Occurrence │  │       │  │ Single Event │             │
│  │             │   │            │  │       │  │              │             │
│  └──────┬──────┘   └────────────┘  │       │  └──────────────┘             │
│         │                          │       │                                │
│  ┌──────┴──────┐                   │       │                                │
│  │             │                   │       │                                │
│  │    Group    │                   │       │                                │
│  │             │                   │       │                                │
│  └─────────────┘                   │       │                                │
│                                    │       │                                │
└────────────────┬───────────────────┘       └───────────────┬────────────────┘
                 │                                           │
                 └───────────────┬───────────────────────────┘
                                 │
                         ┌───────┴──────┐
                         │              │
                         │  Sync Layer  │
                         │              │
                         └──────────────┘
```

## 3. Phase Details

### 3.1 Phase 1: Core Schema and Entities

**Objective**: Create the database schema and entity classes for the Event Series model.

**Key Deliverables**:
- Database migrations for EventSeries, SeriesFollower tables
- Entity classes and repository interfaces
- DTO objects and mappers
- Initial unit tests for core entities

**Tasks**:
1. Create migration for EventSeries table with recurrence fields
2. Add seriesId and isModifiedOccurrence fields to Event table
3. Create SeriesFollower table for tracking series subscriptions
4. Implement entity classes and repositories
5. Add indexes for efficient querying

### 3.2 Phase 2: Series Management

**Objective**: Implement the core business logic for managing event series.

**Key Deliverables**:
- EventSeriesService with CRUD operations
- Template management logic
- Series modification endpoints
- Template propagation rules

**Tasks**:
1. Implement EventSeriesService with template management
2. Create CRUD endpoints for series management
3. Implement template propagation logic for future occurrences
4. Add validation for recurrence rules
5. Create tests for template modifications

### 3.3 Phase 3: Occurrence Management

**Objective**: Implement occurrence management, including vivification, modification, and exceptions.

**Key Deliverables**:
- OccurrenceService for managing individual occurrences
- Vivification system for generating occurrences on demand
- Exception handling for modified occurrences
- Cancellation and reinstatement logic

**Tasks**:
1. Implement OccurrenceService
2. Create vivification system for generating occurrences
3. Add occurrence-specific API endpoints
4. Implement cancellation and reinstatement logic
5. Add exception handling for modified occurrences

### 3.4 Phase 4: Following and Attendance

**Objective**: Implement the distinction between following a series and attending specific occurrences.

**Key Deliverables**:
- SeriesFollowerService for managing series followers
- EventAttendeeService for occurrence-specific attendance
- Notification rules for followers and attendees
- API endpoints for following and attendance

**Tasks**:
1. Implement SeriesFollowerService
2. Update EventAttendeeService for occurrence-specific attendance
3. Create notification rules for followers and attendees
4. Add API endpoints for following and attendance management
5. Create tests for following and attendance scenarios

### 3.5 Phase 5: Chat Integration

**Objective**: Implement chat room management for series and occurrences.

**Key Deliverables**:
- Integration with Matrix API for chat room creation
- Series-wide and occurrence-specific chat rooms
- Access control logic for chat participants
- Chat filtering and search capabilities

**Tasks**:
1. Implement chat room creation for series and occurrences
2. Create access control logic for chat participants
3. Add chat room management endpoints
4. Implement message filtering and search capabilities
5. Create tests for chat integration scenarios

### 3.6 Phase 6: ATProtocol Event Integration

**Objective**: Implement pragmatic integration with Bluesky's limited event support.

**Key Deliverables**:
- BskyClient service for ATProtocol interactions
- Shadow account management for Bluesky users
- Pragmatic approach for recurring events mapping
- Bidirectional sync with appropriate limitations

**Tasks**:
1. Implement BskyClient for ATProtocol interactions
2. Create shadow account management for Bluesky users
3. Implement pragmatic approach for recurring events:
   - For OpenMeet → Bluesky: Publish next occurrence with series link
   - For Bluesky → OpenMeet: Import as standalone, identify potential series
4. Add bidirectional sync with appropriate limitations
5. Create tests for Bluesky integration scenarios

### 3.7 Phase 7: Frontend Integration

**Objective**: Implement UI components for all the above functionality.

**Key Deliverables**:
- API client updates for the new endpoints
- Series creation and management components
- Occurrence management interface
- Following and attendance UI
- Series and occurrence chat components

**Tasks**:
1. Update API clients for new endpoints
2. Create series creation and management components
3. Implement occurrence management interface
4. Add following and attendance UI
5. Create series and occurrence chat components
6. Implement Bluesky integration UI components

### 3.8 Phase 8: Testing and Refinement

**Objective**: Comprehensive testing, performance optimization, and refinement.

**Key Deliverables**:
- End-to-end tests for key user flows
- Performance optimizations for long-running series
- Security audit and improvements
- Documentation updates
- Production deployment plan

**Tasks**:
1. Create end-to-end tests for key user flows
2. Optimize performance for long-running series
3. Perform security audit and implement improvements
4. Update documentation for all new features
5. Create production deployment plan

### 3.9 Phase 9: ATProtocol Group Integration (Future)

**Objective**: Implement custom lexicon for group synchronization with Bluesky.

**Key Deliverables**:
- Custom openmeet.lexicon.group schema
- Group synchronization logic
- Membership management across platforms
- Visibility controls for group content

**Tasks**:
1. Create custom lexicon for groups
2. Implement group synchronization logic
3. Add membership management across platforms
4. Create visibility controls for group content
5. Test group integration scenarios

## 4. Technical Implementation Details

### 4.1 Database Schema Updates

```sql
-- Event Series Table
CREATE TABLE event_series (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  time_zone VARCHAR(50),
  recurrence_rule JSONB,
  recurrence_exceptions JSONB,
  matrix_room_id VARCHAR(255),
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- External references
  external_id VARCHAR(255),
  external_cid VARCHAR(255),
  external_source VARCHAR(50),
  external_data JSONB,
  is_read_only BOOLEAN DEFAULT FALSE
);

-- Updated Events Table 
ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES event_series(id);
ALTER TABLE events ADD COLUMN is_modified_occurrence BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN external_id VARCHAR(255);
ALTER TABLE events ADD COLUMN external_cid VARCHAR(255);

-- Series Followers Table
CREATE TABLE event_series_followers (
  id SERIAL PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES event_series(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(series_id, user_id)
);
```

### 4.2 Event Generation Strategy

We'll use a hybrid approach for occurrence generation:

1. Store the recurrence rule in the parent EventSeries
2. Generate and store concrete Event entities for a rolling window of future occurrences
3. Generate additional occurrences on demand (vivification) when users request them
4. Run a scheduled job to generate more future occurrences as needed

This balances storage efficiency with query performance and user experience.

### 4.3 Bluesky Integration Strategy (Phase 6)

Given the current limitations of ATProtocol's lexicon (no recurrence support), we'll implement:

1. **For OpenMeet → Bluesky**:
   - Publish only the next upcoming occurrence to Bluesky
   - Include a link to the full series on OpenMeet
   - Add descriptive text in the event indicating it's part of a series
   - After an occurrence completes, publish the next one

2. **For Bluesky → OpenMeet**:
   - Import events as standalone one-off events initially
   - Store the external reference (URI, CID) for future sync
   - Implement heuristics to detect potential series patterns
   - Connect related events as part of a series when appropriate

3. **Shadow Account Handling**:
   - Create lightweight accounts for Bluesky users who haven't joined OpenMeet
   - Store minimal user information (DID, handle, display name)
   - Allow claiming ownership when a user logs in with matching Bluesky credentials

### 4.4 Self-Published Event Detection

To prevent circular updates:

1. When we publish an event to Bluesky, store its URI and CID
2. When receiving events from the firehose, check if we already have the URI/CID
3. If matched, update our references rather than creating duplicates
4. Implement checksum validation to confirm events match our records

## 5. Migration Strategy

For migrating existing recurring events to the new model:

1. **Analysis Phase**:
   - Identify all parent recurring events in the current system
   - Analyze their child events and exceptions
   - Create mapping plan for the migration

2. **Migration Script**:
   ```typescript
   async function migrateToEventSeries() {
     // Find all parent recurring events
     const parentEvents = await findAllParentRecurringEvents();
     
     for (const parentEvent of parentEvents) {
       // Create series entity with recurrence rule
       const series = await createSeriesFromEvent(parentEvent);
       
       // Link parent event to series
       await linkEventToSeries(parentEvent, series);
       
       // Find and link child events
       const childEvents = await findChildEvents(parentEvent);
       for (const childEvent of childEvents) {
         await linkEventToSeries(childEvent, series);
         
         // Mark as modified if it's an exception
         if (childEvent.isRecurrenceException) {
           await markAsModifiedOccurrence(childEvent);
         }
       }
       
       // Migrate attendees to followers
       await migrateAttendeesToFollowers(parentEvent, series);
     }
   }
   ```

3. **Testing and Verification**:
   - Run migration on a test environment
   - Verify all events and relationships are correctly mapped
   - Check that attendance records are preserved
   - Ensure chat rooms are properly linked

## 6. Success Metrics

We'll track the following metrics to evaluate the implementation:

1. **Functionality**:
   - All existing recurring events successfully migrated
   - All core features working as expected
   - No data loss or relationship corruption

2. **Performance**:
   - Occurrence generation within acceptable timeframes
   - Query performance for calendar views
   - Template propagation performance

3. **User Experience**:
   - Series creation and management intuitive for users
   - Clear distinction between following and attendance
   - Smooth integration with Bluesky

4. **Integration**:
   - Events successfully synced between platforms
   - RSVPs correctly reflected
   - Shadow accounts properly created and merged

## 7. Conclusion

This consolidated implementation plan provides a clear path to implementing the Event Series model in OpenMeet while maintaining compatibility with ATProtocol/Bluesky. By focusing first on the core model and then adding ATProtocol integration, we ensure a solid foundation while providing a pragmatic approach to cross-platform functionality.

The plan separates groups and events as independent entities that can exist separately but can be linked when appropriate. It also acknowledges the current limitations of ATProtocol's lexicon while providing a path forward for future enhancements when recurrence support is added.