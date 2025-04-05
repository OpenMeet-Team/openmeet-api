# Recurring Events & ATProtocol Integration: Design Document

This document describes the implementation of recurring events in OpenMeet with ATProtocol/Bluesky integration.

## Current Implementation State

The EventSeries implementation is functionally complete with E2E tests, featuring:

- Complete transition from the previous RecurrenceModule to the new EventSeries model
- Standardized recurrence rule interfaces between frontend and backend
- API endpoints for series management and occurrence handling
- Enhanced testing for series functionality

Remaining tasks include database migration scripts, client transition, and Bluesky integration.

## Architecture & Data Model

### Core Data Model

```
┌────────────────┐       ┌────────────────┐       ┌────────────────┐
│                │       │                │       │                │
│     Group      │       │  EventSeries   │       │     User       │
│                │       │                │       │                │
└───────┬────────┘       └───────┬────────┘       └───────┬────────┘
        │                        │                        │
        │                        │                        │
        │                        ▼                        │
        │                ┌────────────────┐               │
        └───────────────►│     Event      │◄──────────────┘
                         │  (Occurrence)  │
                         │                │
                         └────────────────┘
```

#### EventSeries Entity
```typescript
interface EventSeries {
  id: number;
  name: string;
  slug: string;
  description: string;
  timeZone: string;
  recurrenceRule: RecurrenceRule;
  userId: number;
  groupId?: number;
  createdAt: Date;
  updatedAt: Date;
  
  // ATProtocol integration
  externalId?: string;       // Bluesky URI
  externalCid?: string;      // Bluesky CID
  externalSource?: string;   // 'bluesky', 'openmeet', etc.
  externalData?: any;        // Store original Bluesky data
  isReadOnly?: boolean;      // True if source of truth is external
}
```

#### Event Entity Extensions
```typescript
interface Event {
  // Existing fields...
  
  // Series relationship
  seriesId?: number;
  originalOccurrenceDate?: Date;
  
  // ATProtocol integration
  externalId?: string;
  externalCid?: string;
}
```

#### Database Schema
```sql
-- Event Series Table
CREATE TABLE event_series (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  time_zone VARCHAR(50),
  recurrence_rule JSONB,
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
ALTER TABLE events ADD COLUMN original_occurrence_date TIMESTAMP;
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

### Hybrid Occurrence Generation Strategy

1. Store the recurrence rule in the parent EventSeries
2. Generate and store concrete Event entities for a rolling window of future occurrences
3. Generate additional occurrences on demand (vivification) when users request them
4. Run a scheduled job to generate more future occurrences as needed

This balances storage efficiency with query performance and user experience.

## API Endpoints

### Series Management
```
GET    /api/event-series                     - List event series
POST   /api/event-series                     - Create event series
GET    /api/event-series/:slug               - Get series details
PUT    /api/event-series/:slug               - Update series
DELETE /api/event-series/:slug               - Delete series
```

### Occurrence Management
```
GET    /api/event-series/:slug/occurrences   - List occurrences
GET    /api/event-series/:slug/:date         - Get specific occurrence
PUT    /api/event-series/:slug/:date         - Update occurrence
DELETE /api/event-series/:slug/:date         - Delete/cancel occurrence
```

### Following & Attendance
```
POST   /api/event-series/:slug/follow        - Follow series
DELETE /api/event-series/:slug/follow        - Unfollow series
GET    /api/event-series/:slug/followers     - List followers
POST   /api/event-series/:slug/:date/attend  - Attend occurrence
DELETE /api/event-series/:slug/:date/attend  - Cancel attendance
```

## ATProtocol Integration

```
┌────────────────────────────────────┐       ┌────────────────────────────────┐
│                                    │       │                                │
│            OpenMeet                │       │         Bluesky                │
│                                    │       │                                │
│  ┌─────────────┐   ┌────────────┐  │       │  ┌──────────────┐             │
│  │             │   │            │  │       │  │              │             │
│  │ EventSeries ├───┤ Occurrence │  │       │  │ Single Event │             │
│  │             │   │            │  │       │  │              │             │
│  └─────────────┘   └────────────┘  │       │  └──────────────┘             │
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

### Current ATProtocol Limitations

ATProtocol's current calendar event lexicon (`community.lexicon.calendar.event`) doesn't yet support recurring events. The proposed extension would add:
- `rrule`: Full recurrence specification (frequency, interval, etc.)
- `exdate`: Exception dates excluded from pattern
- `rdate`: Additional dates included in pattern

### Pragmatic Integration Strategy

#### OpenMeet → Bluesky:
- Publish only the next upcoming occurrence to Bluesky
- Include a link to the full series on OpenMeet
- Add descriptive text in the event indicating it's part of a series
- After an occurrence completes, publish the next one

#### Bluesky → OpenMeet:
- Import events as standalone one-off events initially
- Store the external reference (URI, CID) for future sync
- Implement heuristics to detect potential series patterns
- Connect related events as part of a series when appropriate

### Shadow Account Handling
- Create lightweight accounts for Bluesky users who haven't joined OpenMeet
- Store minimal user information (DID, handle, display name)
- Allow claiming ownership when a user logs in with matching Bluesky credentials

### Status Mapping

**OpenMeet to Bluesky:**
- `attending` → `community.lexicon.calendar.rsvp#going`
- `interested` → `community.lexicon.calendar.rsvp#interested`
- `declined` → `community.lexicon.calendar.rsvp#notgoing`

**Bluesky to OpenMeet:**
- `community.lexicon.calendar.rsvp#going` → `attending`
- `community.lexicon.calendar.rsvp#interested` → `interested`
- `community.lexicon.calendar.rsvp#notgoing` → `declined`

## Implementation Code Examples

### Series Creation

```typescript
async createEventSeries(dto: CreateEventSeriesDto): Promise<EventSeriesDto> {
  // Create series entity
  const series = new EventSeriesEntity();
  series.name = dto.name;
  series.description = dto.description;
  series.timeZone = dto.timeZone;
  series.recurrenceRule = dto.recurrenceRule;
  series.userId = dto.userId;
  
  // Create the template event
  const template = new EventEntity();
  template.name = dto.name;
  template.description = dto.description;
  template.startDate = dto.startDate;
  template.endDate = dto.endDate;
  template.location = dto.location;
  template.userId = dto.userId;
  template.seriesId = series.id;
  
  // Save both entities in a transaction
  return await this.dataSource.transaction(async manager => {
    const savedSeries = await manager.save(series);
    template.seriesId = savedSeries.id;
    await manager.save(template);
    
    // Generate initial occurrences
    await this.generateInitialOccurrences(savedSeries, template, manager);
    
    return this.mapToDto(savedSeries);
  });
}
```

### Occurrence Generation

```typescript
async generateOccurrences(series: EventSeriesEntity, 
                          template: EventEntity, 
                          startDate: Date, 
                          endDate: Date): Promise<EventEntity[]> {
  const occurrences: EventEntity[] = [];
  
  // Calculate occurrence dates using RRule.js
  const rrule = new RRule({
    freq: series.recurrenceRule.frequency,
    interval: series.recurrenceRule.interval || 1,
    dtstart: startDate,
    until: endDate,
    byweekday: this.convertByWeekday(series.recurrenceRule.byweekday),
  });
  
  const dates = rrule.all();
  
  // Create occurrence entities
  for (const date of dates) {
    const occurrence = new EventEntity();
    
    // Copy template properties
    Object.assign(occurrence, {
      name: template.name,
      description: template.description,
      location: template.location,
      // Copy other relevant fields
      
      // Set occurrence-specific fields
      seriesId: series.id,
      originalOccurrenceDate: date,
      startDate: date,
      // Calculate end date based on template duration
      endDate: this.calculateEndDate(date, template),
    });
    
    occurrences.push(occurrence);
  }
  
  return occurrences;
}
```

### ATProtocol Event Publishing

```typescript
async publishEventToBluesky(user: User, event: EventEntity): Promise<void> {
  try {
    const agent = await this.getAgentForUser(user);
    
    // Check if event is part of series
    const isPartOfSeries = !!event.seriesId;
    let description = event.description || '';
    
    // Add series link if applicable
    if (isPartOfSeries) {
      const series = await this.eventSeriesRepository.findOne({
        where: { id: event.seriesId }
      });
      
      // Add series info to description
      description += `\n\nThis event is part of a recurring series. View the full series at: ${this.config.appUrl}/event-series/${series.slug}`;
    }
    
    // Create Bluesky event
    const result = await agent.post({
      collection: 'community.lexicon.calendar.event',
      repo: user.blueskyDid,
      record: {
        name: event.name,
        description: description,
        createdAt: new Date().toISOString(),
        startsAt: event.startDate.toISOString(),
        endsAt: event.endDate?.toISOString(),
        // Other event properties
      }
    });
    
    // Store external references
    event.externalId = result.uri;
    event.externalCid = result.cid;
    await this.eventRepository.save(event);
    
  } catch (error) {
    this.logger.error(`Failed to publish event to Bluesky: ${error.message}`);
    // Implement retry logic or add to queue for later retry
  }
}
```

## Planned End State

The complete implementation will feature:

1. **Fully Functional Series Management**
   - Series creation, modification, and deletion
   - Template-based occurrence generation
   - Materialization of individual occurrences
   - Following vs. attendance distinction

2. **Robust ATProtocol Integration**
   - Bidirectional sync with Bluesky
   - Shadow account management
   - Pragmatic one-off event strategy until Bluesky supports recurrence
   - Automatic detection of potential series from Bluesky events

3. **Optimized Performance**
   - Efficient query patterns for calendar views
   - Caching for recurrence calculations
   - Background generation of future occurrences
   - Pagination support for large series

4. **Enhanced User Experience**
   - Clear visualization of recurring events
   - Intuitive editing of individual occurrences vs. entire series
   - Support for timezone-aware scheduling
   - Calendar export functionality