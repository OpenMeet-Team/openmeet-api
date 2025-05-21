# Chat Room Management System Design

This document outlines a comprehensive design for an improved chat room management system within OpenMeet, addressing the current limitations and providing a more robust architecture for chat functionality.

## Current Challenges

1. **Implicit Room Creation**: Chat rooms are currently created implicitly when users join discussions, leading to potential race conditions and initialization loops.

2. **Component-Level Management**: Room creation is managed at the component level (EventTopicsComponent), resulting in complex initialization logic.

3. **Inconsistent State Management**: Multiple refreshes and checks are required to ensure proper room initialization.

4. **Permission Ambiguity**: The relationship between event/group permissions and chat permissions is implicit.

5. **Limited Admin Controls**: No dedicated endpoints for admins to manage chat rooms.

## Proposed Architecture

### 1. Core Principles

- **Explicit Creation**: Chat rooms are explicitly created by system or by admins, not implicitly on user join
- **Entity Lifecycle Alignment**: Chat room lifecycle tied to parent entity (event/group)
- **Separation of Concerns**: Clear distinction between room management and message delivery
- **Role-Based Access Control**: Fine-grained permissions for different chat actions

### 2. Database Schema Changes

```sql
-- New tables for chat room management
CREATE TABLE chat_rooms (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(255) NOT NULL UNIQUE,  -- Matrix room ID
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',  -- active, archived, deleted
  visibility VARCHAR(50) NOT NULL DEFAULT 'private',  -- public, private
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  tenant_id VARCHAR(255) NOT NULL
);

-- Many-to-many relationship between entities and chat rooms
CREATE TABLE entity_chat_rooms (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,  -- 'event', 'group', etc.
  entity_id INT NOT NULL,
  chat_room_id INT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- Flag for primary room
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  tenant_id VARCHAR(255) NOT NULL,
  UNIQUE(entity_type, entity_id, chat_room_id, tenant_id)
);

-- Chat room membership table
CREATE TABLE chat_room_members (
  id SERIAL PRIMARY KEY,
  chat_room_id INT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',  -- admin, moderator, member
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  tenant_id VARCHAR(255) NOT NULL,
  UNIQUE(chat_room_id, user_id, tenant_id)
);

-- Chat room settings table
CREATE TABLE chat_room_settings (
  id SERIAL PRIMARY KEY,
  chat_room_id INT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  tenant_id VARCHAR(255) NOT NULL,
  UNIQUE(chat_room_id, setting_key, tenant_id)
);
```

### 3. API Endpoints

#### Admin Endpoints

```
# Room Management
POST   /api/chat-rooms               - Create new chat room
GET    /api/chat-rooms               - List all chat rooms (with filtering)
GET    /api/chat-rooms/:id           - Get chat room details
PUT    /api/chat-rooms/:id           - Update chat room settings
DELETE /api/chat-rooms/:id           - Delete/archive chat room

# Entity Associations
POST   /api/chat-rooms/entity        - Associate room with entity
DELETE /api/chat-rooms/entity/:id    - Remove entity association
GET    /api/chat-rooms/entity/:type/:id - Get rooms for entity

# Member Management
GET    /api/chat-rooms/:id/members         - List room members
POST   /api/chat-rooms/:id/members         - Add member to room
PUT    /api/chat-rooms/:id/members/:userId - Update member role
DELETE /api/chat-rooms/:id/members/:userId - Remove member from room
```

#### User Endpoints

```
# Room Information
GET    /api/chat/rooms                 - List available chat rooms for current user
GET    /api/chat/rooms/:id             - Get room details if member

# Membership
POST   /api/chat/rooms/:id/join        - Join a room (if permitted)
DELETE /api/chat/rooms/:id/leave       - Leave a room

# Messages
GET    /api/chat/rooms/:id/messages    - Get messages for room
POST   /api/chat/rooms/:id/messages    - Send message to room
```

#### Entity-Specific Endpoints

```
# For backward compatibility
GET    /api/chat/event/:slug/room      - Get primary chat room for event
GET    /api/chat/group/:slug/room      - Get primary chat room for group 
```

### 4. Service Layer

#### ChatRoomService

```typescript
// Core room management
createRoom(data: CreateChatRoomDto): Promise<ChatRoom>
updateRoom(id: number, data: UpdateChatRoomDto): Promise<ChatRoom>
deleteRoom(id: number): Promise<void>
archiveRoom(id: number): Promise<ChatRoom>
getRoom(id: number): Promise<ChatRoom>
getRoomBySlug(slug: string): Promise<ChatRoom>
listRooms(filters: ChatRoomFilters): Promise<PaginatedResponse<ChatRoom>>

// Entity associations
associateWithEntity(roomId: number, entityType: string, entityId: number, isPrimary: boolean): Promise<void>
removeEntityAssociation(id: number): Promise<void>
getRoomsForEntity(entityType: string, entityId: number): Promise<ChatRoom[]>
getPrimaryRoomForEntity(entityType: string, entityId: number): Promise<ChatRoom | null>

// Room membership
addMember(roomId: number, userId: number, role: string): Promise<ChatRoomMember>
updateMemberRole(roomId: number, userId: number, role: string): Promise<ChatRoomMember>
removeMember(roomId: number, userId: number): Promise<void>
listMembers(roomId: number, filters: MemberFilters): Promise<PaginatedResponse<ChatRoomMember>>
```

#### ChatProviderService

```typescript
// Matrix-specific operations
createMatrixRoom(name: string, isPublic: boolean): Promise<string> // Returns Matrix room ID
deleteMatrixRoom(roomId: string): Promise<void>
inviteToRoom(roomId: string, userId: string): Promise<void>
removeFromRoom(roomId: string, userId: string): Promise<void>
getRoomState(roomId: string): Promise<RoomState>
```

### 5. Business Logic

#### Automatic Room Creation

```typescript
// Example of automatic room creation when an event is created
@EventPattern('event.created')
async handleEventCreated(data: EventCreatedEvent) {
  const { event, tenantId } = data;
  
  // Create a chat room for the event
  const chatRoom = await this.chatRoomService.createRoom({
    name: `Discussion for ${event.name}`,
    slug: `event-${event.slug}-discussion`,
    description: `Chat room for event: ${event.name}`,
    visibility: event.visibility === 'public' ? 'public' : 'private',
    tenantId,
  });
  
  // Associate the room with the event
  await this.chatRoomService.associateWithEntity(
    chatRoom.id,
    'event',
    event.id,
    true, // Primary room
  );
  
  // Add event creator as admin
  if (event.createdBy) {
    await this.chatRoomService.addMember(
      chatRoom.id,
      event.createdBy.id,
      'admin',
    );
  }
}
```

#### Permission System

```typescript
// Permission checking middleware
@Injectable()
export class ChatRoomPermissionGuard implements CanActivate {
  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roomId = request.params.id;
    const action = request.method; // GET, POST, PUT, DELETE
    
    // Check if user is a member of the room
    const membership = await this.chatRoomService.getMembership(roomId, user.id);
    
    if (!membership) {
      // Check if room is associated with an entity the user has access to
      const roomEntities = await this.chatRoomService.getRoomEntities(roomId);
      
      for (const entity of roomEntities) {
        // Check entity-specific permissions
        if (entity.type === 'event') {
          const hasEventAccess = await this.permissionService.canAccessEventChat(
            entity.id,
            user.id,
          );
          
          if (hasEventAccess) {
            return true;
          }
        } else if (entity.type === 'group') {
          const hasGroupAccess = await this.permissionService.canAccessGroupChat(
            entity.id,
            user.id,
          );
          
          if (hasGroupAccess) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    // Check role-based permissions
    switch(action) {
      case 'GET':
        return true; // Members can always read
      case 'POST':
        return true; // Members can always post
      case 'PUT':
        return membership.role === 'admin' || membership.role === 'moderator';
      case 'DELETE':
        return membership.role === 'admin';
      default:
        return false;
    }
  }
}
```

### 6. Frontend Changes

#### New Chat Management UI

- Admin panel with room management capabilities
- Room creation/editing forms
- Member management interface
- Room statistics and monitoring

#### Simplified Component Logic

```typescript
// Simplified EventTopicsComponent logic
const eventChatRoom = computed(() => {
  if (!event.value) return null;
  
  // Primary room is included in event response
  return event.value.primaryChatRoom;
});

// Load chat component when room exists
onMounted(async () => {
  if (event.value?.primaryChatRoom) {
    // Just display the chat component, no complex initialization
    isLoading.value = false;
  } else if (event.value?.attendee?.status === 'confirmed') {
    // Simple API call to join room without complex retry logic
    try {
      await chatApi.joinEventChatRoom(event.value.slug);
      // Refresh event to get updated roomId
      await eventStore.getEventBySlug(event.value.slug);
    } catch (error) {
      console.error('Error joining chat room:', error);
    } finally {
      isLoading.value = false;
    }
  }
});
```

### 7. Migration Plan

1. **Database Migration**:
   - Create new tables without disrupting existing functionality
   - Add foreign keys to connect with existing event/group tables
   - Backfill data from existing rooms to new schema

2. **Backend Changes**:
   - Implement new services and controllers
   - Create backward compatibility layer for existing endpoints
   - Add event listeners for automatic room creation/deletion

3. **Frontend Changes**:
   - Update components to use new endpoints
   - Simplify initialization logic
   - Add admin UI for room management

4. **Rollout Strategy**:
   - Deploy database changes first
   - Release backend changes with dual support for old/new patterns
   - Deploy frontend changes
   - Gradually migrate existing rooms to new system
   - Remove deprecated endpoints after transition period

## Benefits

1. **Simplified Frontend**: No complex initialization logic or retries needed
2. **Explicit Lifecycle Management**: Rooms tied to entity lifecycle
3. **Improved Performance**: Fewer API calls required for initialization
4. **Better Admin Controls**: Full control over room creation and management
5. **Clearer Permissions**: Explicit permission model instead of implicit
6. **Flexible Architecture**: Support for multiple rooms per entity
7. **Better Error Handling**: Clear error states and recovery paths
8. **Enhanced User Experience**: More predictable chat availability

## Implementation Considerations

1. **Matrix Integration**: Ensure compatibility with Matrix APIs and protocols
2. **Tenant Awareness**: All operations must respect tenant boundaries
3. **Caching**: Implement caching for room metadata and permissions
4. **Metrics & Monitoring**: Track room usage, error rates, etc.
5. **Rate Limiting**: Protect against abuse of chat creation/deletion
6. **Privacy**: Ensure rooms respect entity visibility settings
7. **Performance**: Optimize for large numbers of rooms and messages
8. **Error Recovery**: Implement robust error recovery for Matrix operations

This design represents a significant architectural improvement over the current implementation, addressing the core issues and providing a foundation for future chat features.