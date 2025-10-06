# Client-Side Matrix Integration: Event & Group Chat Architecture

**Status**: ✅ Implemented
**Date**: September 2025
**Context**: Client-side Matrix client is fully implemented and deployed in production

## Implementation Overview

As of September 2025, the client-side Matrix integration is fully deployed with:

- ✅ **Client-side Matrix client**: `MatrixClientManager.ts` with MAS OIDC authentication
- ✅ **Real Matrix rooms**: Users connect directly to Matrix rooms
- ✅ **E2E encryption**: Full encryption support via `MatrixEncryptionManager.ts`
- ✅ **Direct messaging**: All messages sent/received through Matrix JS SDK (no WebSocket proxy)
- ✅ **Room discovery**: Users automatically added to rooms for their events/groups
- ✅ **Unified chat UI**: Consistent chat experience across all contexts
- ✅ **Room lifecycle management**: Application Service bot creates rooms automatically
- ✅ **Permission synchronization**: OpenMeet roles mapped to Matrix power levels
- ✅ **Token management**: Automatic token refresh via `MatrixTokenManager.ts`

## Architecture

### Core Principles
1. **Client-first**: All real-time messaging happens client-side via Matrix JS SDK
2. **Server orchestration**: Backend manages room lifecycle and permissions only
3. **Unified experience**: Same chat UI/UX patterns across all contexts
4. **Automatic joining**: Users get access to relevant rooms without manual steps
5. **Role synchronization**: OpenMeet permissions automatically reflected in Matrix

### High-Level Architecture (Implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenMeet Platform                          │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐  │
│  │  Event Page     │    │  Group Page     │    │ Chat Page   │  │
│  │                 │    │                 │    │             │  │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────┐ │  │
│  │ │Chat Sidebar │ │    │ │Chat Tab     │ │    │ │FullChat │ │  │
│  │ │(contextual) │ │    │ │(integrated) │ │    │ │         │ │  │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────┘ │  │
│  └─────────────────┘    └─────────────────┘    └─────────────┘  │
│           │                       │                     │       │
│           └───────────────────────┼─────────────────────┘       │
│                                   │                             │
│              ┌─────────────────────▼─────────────────────┐       │
│              │        Matrix JS SDK Client              │       │
│              │     (Single instance, shared state)      │       │
│              └─────────────────────┬─────────────────────┘       │
└─────────────────────────────────────┼─────────────────────────────┘
                                      │ Direct Matrix Protocol
┌─────────────────────────────────────▼─────────────────────────────┐
│                   OpenMeet API                                    │
│                                                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐   │
│  │   Room Manager      │    │     Permission Sync Service     │   │
│  │                     │    │                                 │   │
│  │ • Create rooms      │    │ • Monitor role changes         │   │
│  │ • Add/remove users  │    │ • Update Matrix power levels   │   │
│  │ • Set room metadata │    │ • Enforce tenant boundaries    │   │
│  └─────────────────────┘    └─────────────────────────────────┘   │
│                                      │                            │
│                            ┌─────────▼─────────┐                  │
│                            │  Matrix Admin Bot │                  │
│                            │ (privileged API)  │                  │
│                            └─────────┬─────────┘                  │
└─────────────────────────────────────────┼─────────────────────────┘
                                          │ Matrix Admin API
┌─────────────────────────────────────────▼─────────────────────────┐
│                    Matrix Server (Synapse)                       │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│  │   Events    │  │   Groups    │  │      Direct Messages   │    │
│  │             │  │             │  │                         │    │
│  │ Room per    │  │ Room per    │  │ Auto-created between    │    │
│  │ event       │  │ group       │  │ users as needed         │    │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Integration Design

### 1. Room Lifecycle Management

#### Event Rooms
```typescript
// When event is created
POST /api/events
→ EventService.create()
→ MatrixRoomManager.createEventRoom(eventSlug, creatorSlug, tenantId)
→ Matrix Admin Bot creates room with appropriate settings
→ Event record updated with matrixRoomId

// When user attends event  
POST /api/events/{slug}/attend
→ EventService.addAttendee()
→ MatrixRoomManager.addUserToEventRoom(eventSlug, userSlug)
→ Matrix Admin Bot invites user to room and sets appropriate power level
→ User's Matrix client automatically sees new room in next sync

// When user cancels attendance
POST /api/events/{slug}/cancel-attending  
→ EventService.removeAttendee()
→ MatrixRoomManager.removeUserFromEventRoom(eventSlug, userSlug)
→ Matrix Admin Bot removes user from room
```

#### Group Rooms
```typescript
// When group is created
POST /api/groups
→ GroupService.create()
→ MatrixRoomManager.createGroupRoom(groupSlug, creatorSlug, tenantId)
→ Matrix Admin Bot creates room with appropriate settings
→ Group record updated with matrixRoomId

// When user joins group
POST /api/groups/{slug}/join
→ GroupService.addMember()
→ MatrixRoomManager.addUserToGroupRoom(groupSlug, userSlug)
→ Matrix Admin Bot invites user to room
→ User's Matrix client automatically sees new room in next sync

// When user leaves group
DELETE /api/groups/{slug}/leave
→ GroupService.removeMember()  
→ MatrixRoomManager.removeUserFromGroupRoom(groupSlug, userSlug)
→ Matrix Admin Bot removes user from room

// when user role changes
unsure about api endpoint
- listen for event attendee role changes
- listen for group member role changes
- make appropriate power level changes in the event or group chatrooms

```

#### Room Settings & Metadata
```typescript
interface MatrixRoomSettings {
  // Basic room configuration
  name: string;              // "JavaScript Workshop" / "Tech Meetup Group"
  topic: string;             // Event description / Group description
  avatar_url?: string;       // Event/Group image
  
  // OpenMeet-specific metadata
  om_entity_type: 'event' | 'group';
  om_entity_slug: string;    // event-slug or group-slug
  om_tenant_id: string;      // For tenant isolation
  om_created_by: string;     // OpenMeet user slug
  
  // Access control
  join_rules: 'invite';      // Invitation only - controlled by OpenMeet
  guest_access: 'forbidden'; // No guest access
  history_visibility: 'invited'; // Only see history after joining
}
```

### 2. Permission Synchronization

#### OpenMeet → Matrix Role Mapping
```typescript
enum MatrixPowerLevel {
  BANNED = -1,          // Banned users
  DEFAULT = 0,          // Regular group members / event attendees
  MODERATOR = 50,       // Group admins / event organizers
  ADMIN = 75,          // Group owners / event creators + OpenMeet admins
  OPENMEET_BOT = 90,  // OpenMeet bot
  OPENMEET_ADMIN = 100,  // OpenMeet admin
}

interface PermissionMapping {
  // Event permissions
  'event.creator': MatrixPowerLevel.ADMIN,
  'event.organizer': MatrixPowerLevel.MODERATOR,
  'event.attendee': MatrixPowerLevel.DEFAULT,
  
  // Group permissions  
  'group.owner': MatrixPowerLevel.ADMIN,
  'group.admin': MatrixPowerLevel.MODERATOR,
  'group.member': MatrixPowerLevel.DEFAULT,
  
  // OpenMeet global permissions
  'platform.admin': MatrixPowerLevel.OPENMEET_ADMIN, // Can moderate any room
  'tenant.admin': MatrixPowerLevel.ADMIN,   // Can moderate tenant rooms
}
```

#### Permission Sync Events
```typescript
// When user role changes in OpenMeet
EventEmitter.emit('user.role.changed', {
  userSlug: 'user-slug',
  entityType: 'group',
  entitySlug: 'group-slug', 
  oldRole: 'member',
  newRole: 'admin'
});

// Permission sync service listens and updates Matrix
MatrixPermissionSync.handleRoleChange(event) {
  const matrixRoomId = await getMatrixRoomId(event.entityType, event.entitySlug);
  const powerLevel = mapRoleToMatrixPowerLevel(event.newRole);
  const matrixUserId = await getMatrixUserId(event.userSlug);
  
  await MatrixAdminBot.setPowerLevel(matrixRoomId, matrixUserId, powerLevel);
}
```

### 3. Frontend Integration Points

#### Event Page Integration
```vue
<!-- Event Details Page -->
<template>
  <div class="event-page">
    <!-- Main event content -->
    <EventDetails :event="event" />
    
    <!-- Chat sidebar (desktop) or tab (mobile) -->
    <div class="event-chat-sidebar" v-if="userIsAttending">
      <UnifiedChatComponent
        context-type="event"
        :context-id="event.slug"
        :matrix-room-id="event.matrixRoomId"
        mode="sidebar"
        :show-header="true"
      />
    </div>
    
    <!-- Chat invitation for non-attendees -->
    <div class="chat-invitation" v-else>
      <q-banner class="bg-info">
        <template v-slot:avatar>
          <q-icon name="chat" />
        </template>
        <div>Join this event to participate in the discussion</div>
        <template v-slot:action>
          <q-btn label="Attend Event" @click="attendEvent" />
        </template>
      </q-banner>
    </div>
  </div>
</template>
```

#### Group Page Integration
```vue
<!-- Group Details Page -->
<template>
  <div class="group-page">
    <q-tabs v-model="activeTab">
      <q-tab name="about" label="About" />
      <q-tab name="events" label="Events" />
      <q-tab name="discussion" label="Discussion" v-if="userIsMember" />
      <q-tab name="members" label="Members" />
    </q-tabs>
    
    <q-tab-panels v-model="activeTab">
      <q-tab-panel name="about">
        <GroupAbout :group="group" />
      </q-tab-panel>
      
      <q-tab-panel name="events">
        <GroupEvents :group="group" />
      </q-tab-panel>
      
      <q-tab-panel name="discussion" v-if="userIsMember">
        <UnifiedChatComponent
          context-type="group"
          :context-id="group.slug"
          :matrix-room-id="group.matrixRoomId"
          mode="fullscreen"
          :show-header="false"
        />
      </q-tab-panel>
      
      <q-tab-panel name="members">
        <GroupMembers :group="group" />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>
```

#### Standalone Chat Page
```vue
<!-- Messages Page - All Chats -->
<template>
  <div class="messages-page">
    <UnifiedChatComponent
      context-type="all"
      mode="dashboard"
      :show-info-sidebar="true"
    />
  </div>
</template>
```

### 4. Matrix Client Service Architecture

#### Single Shared Instance
```typescript
// Singleton Matrix client shared across all components
class MatrixClientService {
  private static instance: MatrixClientService;
  private client: MatrixClient | null = null;
  private rooms: Map<string, Room> = new Map();
  
  // Get shared instance
  static getInstance(): MatrixClientService {
    if (!MatrixClientService.instance) {
      MatrixClientService.instance = new MatrixClientService();
    }
    return MatrixClientService.instance;
  }
  
  // Initialize once per session
  async initialize(): Promise<void> {
    if (this.client?.isLoggedIn()) return;
    
    // OIDC authentication flow
    await this.performOIDCAuth();
    
    // Start client and sync
    await this.client.startClient();
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  // Room management methods
  getRoomBySlug(entityType: 'event' | 'group', slug: string): Room | null {
    return this.rooms.get(`${entityType}:${slug}`);
  }
  
  // Messaging methods
  async sendMessage(roomId: string, content: string): Promise<void> {
    const room = this.client.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    
    await this.client.sendMessage(roomId, {
      msgtype: 'm.text',
      body: content
    });
  }
  
  // Event emission for UI updates
  private setupEventListeners(): void {
    this.client.on('Room.timeline', (event, room) => {
      // Emit custom events for UI components
      document.dispatchEvent(new CustomEvent('matrix:message', {
        detail: { event, room }
      }));
    });
    
    this.client.on('RoomMember.typing', (event, member) => {
      document.dispatchEvent(new CustomEvent('matrix:typing', {
        detail: { event, member }
      }));
    });
  }
}
```

### 5. Backend Services Needed

#### Room Manager Service
```typescript
@Injectable()
export class MatrixRoomManagerService {
  constructor(
    private matrixAdmin: MatrixAdminService,
    private tenantService: TenantService
  ) {}
  
  async createEventRoom(eventSlug: string, creatorSlug: string, tenantId: string): Promise<string> {
    const event = await this.eventService.findBySlug(eventSlug);
    const creator = await this.userService.findBySlug(creatorSlug);
    const creatorMatrixId = await this.getMatrixUserId(creator);
    
    const roomOptions = {
      name: event.name,
      topic: event.description,
      preset: 'private_chat', // Invitation only
      power_level_content_override: {
        users: {
          [creatorMatrixId]: 100 // Event creator is admin
        }
      },
      initial_state: [
        {
          type: 'com.openmeet.room.metadata',
          content: {
            entity_type: 'event',
            entity_slug: eventSlug,
            tenant_id: tenantId,
            created_by: creatorSlug
          }
        }
      ]
    };
    
    const roomId = await this.matrixAdmin.createRoom(roomOptions);
    
    // Update event record with Matrix room ID
    await this.eventService.update(eventSlug, { matrixRoomId: roomId });
    
    return roomId;
  }
  
  async addUserToEventRoom(eventSlug: string, userSlug: string): Promise<void> {
    const event = await this.eventService.findBySlug(eventSlug);
    const user = await this.userService.findBySlug(userSlug);
    const userMatrixId = await this.getMatrixUserId(user);
    
    if (!event.matrixRoomId) {
      throw new Error('Event does not have Matrix room');
    }
    
    // Invite user to room
    await this.matrixAdmin.inviteUser(event.matrixRoomId, userMatrixId);
    
    // Set appropriate power level
    const powerLevel = this.mapEventRoleToPowerLevel(user.roleInEvent);
    await this.matrixAdmin.setPowerLevel(event.matrixRoomId, userMatrixId, powerLevel);
  }
  
  // Similar methods for groups...
}
```

#### Permission Sync Service
```typescript
@Injectable()
export class MatrixPermissionSyncService {
  constructor(
    private matrixAdmin: MatrixAdminService,
    private eventEmitter: EventEmitter
  ) {
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Listen for role changes
    this.eventEmitter.on('user.role.changed', this.handleRoleChange.bind(this));
    this.eventEmitter.on('group.member.added', this.handleMemberAdded.bind(this));
    this.eventEmitter.on('event.attendee.added', this.handleAttendeeAdded.bind(this));
    // etc...
  }
  
  private async handleRoleChange(event: RoleChangeEvent): Promise<void> {
    const roomId = await this.getMatrixRoomId(event.entityType, event.entitySlug);
    if (!roomId) return;
    
    const userMatrixId = await this.getMatrixUserId(event.userSlug);
    const powerLevel = this.mapRoleToPowerLevel(event.entityType, event.newRole);
    
    await this.matrixAdmin.setPowerLevel(roomId, userMatrixId, powerLevel);
    
    console.log(`Updated Matrix power level for ${userMatrixId} in ${roomId} to ${powerLevel}`);
  }
}
```

## Implementation Roadmap

### Phase 1: Backend Services (1-2 weeks)
1. **Create MatrixRoomManagerService**
   - Room creation for events and groups
   - User invitation/removal methods
   - Room metadata management

2. **Create MatrixPermissionSyncService**
   - Event listeners for role changes
   - Power level synchronization
   - Tenant boundary enforcement

3. **Update Event/Group Services**
   - Integrate room creation in create/update flows
   - Add user management hooks
   - Add Matrix room ID to entity models

### Phase 2: Frontend Integration (1-2 weeks)
1. **Enhance UnifiedChatComponent**
   - Support for contextual modes (sidebar, tab, fullscreen)
   - Integration with Matrix client service
   - Real-time message updates via DOM events

2. **Update Event/Group Pages**
   - Add chat integration to event pages
   - Add discussion tabs to group pages  
   - Implement access control (members-only)

3. **Matrix Client Service Improvements**
   - Singleton pattern with shared state
   - Room caching and management
   - Event emission for UI updates

### Phase 3: User Experience Polish (1 week)
1. **Onboarding Flow**
   - First-time Matrix setup
   - Room joining notifications
   - Chat feature discovery

2. **Mobile Optimization**
   - Mobile-first chat layouts
   - Touch-optimized interactions
   - Responsive design improvements

3. **Error Handling**
   - Graceful Matrix client failures
   - Offline state management
   - Retry mechanisms

### Phase 4: Migration & Cleanup (1 week)
1. **Remove Legacy Systems**
   - WebSocket proxy removal
   - Old message store cleanup
   - Legacy API endpoint removal
   - ui components that are no longer needed and related tests

2. **Performance Optimization**
   - Message loading optimization
   - Connection management improvements
   - Memory usage optimization

3. **Documentation & Testing**
   - User guides for new chat features
   - API documentation updates
   - Integration test coverage

## Technical Decisions

### ADR-007: Context-Aware Chat Components
**Decision**: Implement chat components that adapt to their context (event sidebar, group tab, standalone page)
**Rationale**: Provides consistent experience while respecting each page's layout and user flow
**Implementation**: Single `UnifiedChatComponent` with mode prop that changes layout and behavior

### ADR-008: Automatic Room Management
**Decision**: Automatically create Matrix rooms when events/groups are created, and add users when they join
**Rationale**: Eliminates manual steps and ensures every group/event has associated chat capability
**Implementation**: Backend services that hook into existing event/group workflows

### ADR-009: Power Level Synchronization
**Decision**: Automatically sync OpenMeet roles to Matrix power levels using event-driven architecture
**Rationale**: Ensures chat permissions always match OpenMeet permissions without manual intervention
**Implementation**: Permission sync service that listens to role change events and updates Matrix

### ADR-010: Single Matrix Client Instance
**Decision**: Use singleton Matrix client shared across all components in the frontend
**Rationale**: Reduces resource usage, ensures consistent state, and simplifies client management
**Implementation**: Shared service with DOM event emission for component communication

## Success Metrics

### Technical Metrics
- **Message latency**: < 100ms for same-tenant users
- **Room creation time**: < 2 seconds for event/group room creation
- **Permission sync delay**: < 1 second from role change to Matrix update
- **Client connection success**: > 99% Matrix client initialization success rate

### User Experience Metrics
- **Feature discovery**: % of users who use chat within 7 days of joining group/event
- **Engagement**: Average messages per user per week in group/event chats
- **Retention**: % of users who return to chat after first use
- **Error rate**: < 1% of chat interactions result in errors

### Business Metrics
- **Group engagement**: Groups with active chat have higher member retention
- **Event engagement**: Events with active chat have higher attendance rates
- **Platform stickiness**: Users with active chat usage have higher overall platform engagement

## Risks & Mitigation

### Technical Risks
1. **Matrix client stability**: Browser-based Matrix client may have connection issues
   - **Mitigation**: Implement robust reconnection logic and fallback mechanisms

2. **Permission synchronization lag**: Delay between OpenMeet role changes and Matrix updates
   - **Mitigation**: Event-driven architecture with retry mechanisms and monitoring

3. **Room scaling**: Large groups/events may have performance issues in Matrix rooms
   - **Mitigation**: Monitor room size and implement sharding if needed. What sizes of rooms are we talking about?

### User Experience Risks
1. **Feature complexity**: Users may be confused by new chat integration
   - **Mitigation**: Gradual rollout with user education and onboarding flows

2. **Mobile performance**: Matrix client may have issues on mobile browsers
   - **Mitigation**: Extensive mobile testing and responsive design optimization

3. **Notification overload**: Users may get too many chat notifications
   - **Mitigation**: Smart notification settings and user preference controls

## Production Migration Strategy

### Challenge: Preserving Existing Chat History

**Requirement**: When transitioning from the old server-side WebSocket proxy to the new client-side Matrix integration, we must preserve existing chat rooms and their history.

### Migration Options Analysis

#### Option 1: Keep Existing Rooms (Recommended)
**Approach**: Migrate existing Matrix rooms to work with the new client-side system
- **Pros**: 
  - Preserves all chat history and user relationships
  - No disruption to ongoing conversations
  - Users don't lose context
  - Maintains user trust and engagement
- **Cons**: 
  - More complex migration process
  - Need to ensure all users have proper Matrix credentials
  - May have inconsistent room configurations from old system

#### Option 2: Fresh Start (Development Only)
**Approach**: Clear all Matrix room IDs and let the system create new rooms
- **Pros**:
  - Clean slate with consistent configurations
  - Simpler migration - just clear the IDs
  - All rooms created with new architecture patterns
- **Cons**:
  - **Loss of all chat history** - unacceptable for production
  - Users lose conversation context
  - May need to re-add users to discussions

#### Option 3: Hybrid Approach
**Approach**: Try to preserve active rooms, recreate inactive ones
- Could work but adds complexity in determining "active" vs "inactive"

### Recommended Production Migration Strategy

**Decision**: Use **Option 1 (Keep Existing Rooms)** with a phased validation approach.

#### Phase 1: Pre-Migration Assessment
```bash
#!/bin/bash
# Production room validation script

echo "=== Matrix Room Validation Report ==="

# Get all Matrix room IDs from database
ROOM_IDS=$(psql -t -c "
  SELECT DISTINCT matrixRoomId 
  FROM (
    SELECT matrixRoomId FROM events WHERE matrixRoomId IS NOT NULL AND matrixRoomId != ''
    UNION 
    SELECT matrixRoomId FROM groups WHERE matrixRoomId IS NOT NULL AND matrixRoomId != ''
    UNION
    SELECT matrixRoomId FROM chatRooms WHERE matrixRoomId IS NOT NULL AND matrixRoomId != ''
  ) AS all_rooms
")

VALID_ROOMS=0
INVALID_ROOMS=0
INVALID_ROOM_LIST=""

for roomId in $ROOM_IDS; do
  # Test if room exists via Matrix API
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $MATRIX_ADMIN_TOKEN" \
    "$MATRIX_SERVER/_matrix/client/v3/rooms/$roomId/state")
  
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Room exists: $roomId"
    VALID_ROOMS=$((VALID_ROOMS + 1))
  else
    echo "❌ Room missing (HTTP $HTTP_STATUS): $roomId"
    INVALID_ROOMS=$((INVALID_ROOMS + 1))
    INVALID_ROOM_LIST="$INVALID_ROOM_LIST $roomId"
  fi
done

echo ""
echo "=== Summary ==="
echo "Valid rooms: $VALID_ROOMS"
echo "Invalid rooms: $INVALID_ROOMS"
echo ""
echo "Invalid room IDs to be cleared:"
echo "$INVALID_ROOM_LIST"
```

#### Phase 2: User Credential Provisioning
```sql
-- Check users missing Matrix credentials
SELECT 
  id, 
  slug, 
  email,
  CASE 
    WHEN matrixUserId IS NULL THEN 'Missing Matrix User ID'
    WHEN matrixAccessToken IS NULL THEN 'Missing Access Token'
    WHEN matrixDeviceId IS NULL THEN 'Missing Device ID'
    ELSE 'Complete'
  END as matrix_status
FROM users 
WHERE matrixUserId IS NULL 
   OR matrixAccessToken IS NULL 
   OR matrixDeviceId IS NULL
ORDER BY matrix_status, created_at;
```

Strategy: Provision Matrix credentials for users as they log in (gradual provisioning).

#### Phase 3: Room Cleanup & Migration
```sql
-- Production migration script (execute with extreme caution)
BEGIN;

-- Step 1: Clear room IDs for rooms that don't exist (identified by validation script)
UPDATE events 
SET matrixRoomId = NULL 
WHERE matrixRoomId IN (
  -- Paste list of invalid room IDs from validation script
  '!invalidroom1:matrix.example.com',
  '!invalidroom2:matrix.example.com'
  -- etc...
);

-- Step 2: Clear chat room records for non-existent Matrix rooms
DELETE FROM chatRooms 
WHERE matrixRoomId IN (
  -- Same list of invalid room IDs
  '!invalidroom1:matrix.example.com',
  '!invalidroom2:matrix.example.com'
  -- etc...
);

-- Step 3: Clear group room IDs for non-existent rooms
UPDATE groups 
SET matrixRoomId = NULL 
WHERE matrixRoomId IN (
  -- Same list of invalid room IDs
  '!invalidroom1:matrix.example.com',
  '!invalidroom2:matrix.example.com'
  -- etc...
);

-- Step 4: Keep existing valid rooms as-is
-- The new system will work with existing rooms

COMMIT;
```

#### Phase 4: Room Permission Synchronization
After migration, ensure existing rooms have correct power levels:

```typescript
// Post-migration room audit service
@Injectable()
export class MigrationAuditService {
  async auditAndFixRoomPermissions(roomId: string): Promise<void> {
    // Get room metadata to determine entity type and slug
    const roomState = await this.matrixAdmin.getRoomState(roomId);
    const metadata = roomState.find(event => 
      event.type === 'com.openmeet.room.metadata'
    );
    
    if (!metadata) {
      // Legacy room - add metadata
      await this.matrixAdmin.sendStateEvent(roomId, 'com.openmeet.room.metadata', '', {
        entity_type: 'unknown', // Will need manual review
        migration_date: new Date().toISOString(),
        legacy_room: true
      });
    }
    
    // Sync current OpenMeet permissions to Matrix power levels
    const entityType = metadata.content.entity_type;
    const entitySlug = metadata.content.entity_slug;
    
    if (entityType === 'event') {
      await this.syncEventRoomPermissions(roomId, entitySlug);
    } else if (entityType === 'group') {
      await this.syncGroupRoomPermissions(roomId, entitySlug);
    }
  }
  
  private async syncEventRoomPermissions(roomId: string, eventSlug: string): Promise<void> {
    const event = await this.eventService.findBySlug(eventSlug);
    const attendees = await this.eventAttendeeService.findByEventId(event.id);
    
    for (const attendee of attendees) {
      const user = attendee.user;
      if (!user.matrixUserId) continue; // Skip users without Matrix credentials
      
      const powerLevel = this.mapEventRoleToPowerLevel(attendee.role);
      await this.matrixAdmin.setPowerLevel(roomId, user.matrixUserId, powerLevel);
    }
  }
}
```

### Migration Rollback Plan

If issues arise during migration:

1. **Database Rollback**: Restore from pre-migration backup
2. **Matrix Room State**: Existing rooms remain unchanged (safest approach)
3. **User Sessions**: Clear Matrix client sessions to force re-initialization
4. **Gradual Rollback**: Can disable new chat features while keeping old rooms accessible

### Migration Testing

#### Pre-Production Testing
1. **Clone production data** to staging environment
2. **Run validation script** to identify invalid rooms
3. **Execute migration script** on staging
4. **Test new chat functionality** with staging data
5. **Verify room permissions** are correctly synchronized

#### Production Deployment
1. **Maintenance window**: Brief downtime for database updates
2. **Database backup**: Full backup before any changes
3. **Execute migration**: Clear only invalid room IDs
4. **Monitor**: Watch for authentication and room access issues
5. **Gradual enablement**: Enable new chat features for subset of users first

### Success Criteria

- ✅ **Zero chat history loss**: All existing valid rooms preserved
- ✅ **User access maintained**: Users can access their existing rooms
- ✅ **New functionality works**: Client-side Matrix integration functional
- ✅ **Permission consistency**: Matrix power levels match OpenMeet roles
- ✅ **Performance maintained**: No degradation in chat performance

### Communication Plan

#### To Users
- **Advance notice**: Email about upcoming chat improvements
- **During migration**: Brief status page update about maintenance
- **Post-migration**: Announcement of new chat features and how to use them

#### To Team
- **Migration runbook**: Detailed step-by-step procedures
- **Monitoring dashboard**: Real-time migration progress and error tracking
- **Rollback procedures**: Clear steps for reverting if needed

---

**Migration Timeline**: Plan for 1-2 week migration window with staged rollout to minimize risk.

---

**Next Steps**: Review this design with team and begin Phase 1 implementation of backend services.