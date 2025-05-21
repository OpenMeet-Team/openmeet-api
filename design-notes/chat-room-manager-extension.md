# System Design Document: Chat Room Manager Extension

## Overview
This document outlines the plan to extend the ChatRoomManagerInterface to handle group operations, reducing code redundancy and improving chat system architecture by moving away from request-scoped dependencies to a more robust, tenant-aware implementation.

## Business Context
- **Problem statement**: The current chat system has redundant code between the request-scoped DiscussionService and the new tenant-aware MatrixChatRoomManagerAdapter.
- **Architectural issue**: Event handlers operating outside HTTP request context can't access tenant information, causing errors with request-scoped services.
- **Technical debt**: Multiple implementations of similar functionality (chat room creation, user addition, message sending) exist across different services.

## Goals & Success Metrics
- Extend ChatRoomManagerInterface to handle all chat operations (events AND groups)
- Refactor ChatListener to use the adapter for all operations
- Gradually phase out redundant code in DiscussionService
- Eliminate "Cannot read properties of undefined (reading 'tenantId')" errors in event handlers
- Improve code maintainability by centralizing Matrix chat functionality

## System Requirements
### Functional Requirements
- Full support for group chat operations
- Maintain backward compatibility during transition
- Handle tenant context explicitly for event handlers
- Support all existing chat functionality (room creation, messages, membership management)

### Non-Functional Requirements
- No disruption to existing chat functionality during migration
- Clear deprecation path for redundant code
- Improved error handling with detailed logging
- Enhanced testability without complex mocking of request scope

## Technical Design
### Architecture Changes

#### 1. Extended Interface
Extend ChatRoomManagerInterface to include group operations:

```typescript
export interface ChatRoomManagerInterface {
  // Existing event methods
  ensureEventChatRoom(eventId: number, creatorId: number, tenantId: string): Promise<ChatRoomEntity>;
  addUserToEventChatRoom(eventId: number, userId: number, tenantId: string): Promise<void>;
  removeUserFromEventChatRoom(eventId: number, userId: number, tenantId: string): Promise<void>;
  // ...other existing methods...

  // New group methods
  ensureGroupChatRoom(groupId: number, creatorId: number, tenantId: string): Promise<ChatRoomEntity>;
  addUserToGroupChatRoom(groupId: number, userId: number, tenantId: string): Promise<void>;
  removeUserFromGroupChatRoom(groupId: number, userId: number, tenantId: string): Promise<void>;
  isUserInGroupChatRoom(groupId: number, userId: number, tenantId: string): Promise<boolean>;
  getGroupChatRooms(groupId: number, tenantId: string): Promise<ChatRoomEntity[]>;
  deleteGroupChatRooms(groupId: number, tenantId: string): Promise<void>;
  checkGroupExists(groupId: number, tenantId: string): Promise<boolean>;
}
```

#### 2. Implementation in MatrixChatRoomManagerAdapter
Implement new methods in MatrixChatRoomManagerAdapter, following the same pattern as event methods:

```typescript
// Example implementation for ensureGroupChatRoom
async ensureGroupChatRoom(
  groupId: number,
  creatorId: number,
  tenantId: string,
): Promise<ChatRoomEntity> {
  // Get database connection for the tenant
  const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);
  const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
  const groupRepository = dataSource.getRepository(GroupEntity);

  // Check if a chat room already exists for this group
  const existingRoom = await chatRoomRepository.findOne({
    where: { group: { id: groupId } },
  });

  if (existingRoom) {
    return existingRoom;
  }

  // If no chat room exists, create one
  const group = await this.groupService.findOne(groupId);
  if (!group) {
    throw new Error(`Group with id ${groupId} not found`);
  }

  // Get the creator user
  const creator = await this.userService.findById(creatorId, tenantId);
  if (!creator) {
    throw new Error(`Creator user with id ${creatorId} not found`);
  }

  // Create a chat room in Matrix
  const roomName = this.generateRoomName('group', group.slug, tenantId);
  const roomInfo = await this.matrixRoomService.createRoom({
    name: roomName,
    topic: `Discussion for ${group.name}`,
    isPublic: group.visibility === 'public',
    isDirect: false,
    encrypted: false,
    inviteUserIds: creator.matrixUserId ? [creator.matrixUserId] : [],
    powerLevelContentOverride: creator.matrixUserId
      ? {
          users: {
            [creator.matrixUserId]: 50, // Moderator level
          },
        }
      : undefined,
  });

  // Create a chat room entity
  const chatRoom = chatRoomRepository.create({
    name: roomName,
    topic: `Discussion for ${group.name}`,
    matrixRoomId: roomInfo.roomId,
    type: ChatRoomType.GROUP,
    visibility:
      group.visibility === 'public'
        ? ChatRoomVisibility.PUBLIC
        : ChatRoomVisibility.PRIVATE,
    creator: creator,
    group: group,
    settings: {
      historyVisibility: 'shared',
      guestAccess: false,
      requireInvitation: group.visibility !== 'public',
      encrypted: false,
    },
  });

  // Save the chat room
  await chatRoomRepository.save(chatRoom);

  // Update the group with Matrix room ID
  await groupRepository.update({ id: groupId }, { matrixRoomId: roomInfo.roomId });

  this.logger.log(
    `Created chat room for group ${group.slug} in tenant ${tenantId}`,
  );
  return chatRoom;
}

// Additional method implementations following similar patterns...
```

#### 3. ChatListener Refactoring
Update ChatListener to use the new adapter methods for group operations:

```typescript
@OnEvent('chat.group.member.add')
async handleChatGroupMemberAdd(params: { 
  groupId: number; 
  userId: number;
  tenantId?: string;
}) {
  this.logger.log('chat.group.member.add event received', params);

  try {
    // Tenant ID is required in all environments
    if (!params.tenantId) {
      this.logger.error('Tenant ID is required in the event payload');
      throw new Error('Tenant ID is required');
    }

    // Use the tenant-aware ChatRoomManagerInterface implementation
    await this.chatRoomManager.addUserToGroupChatRoom(
      params.groupId,
      params.userId,
      params.tenantId,
    );

    this.logger.log(
      `Added user ${params.userId} to group ${params.groupId} chat room in tenant ${params.tenantId}`,
    );
  } catch (error) {
    this.logger.error(
      `Failed to add user ${params.userId} to group ${params.groupId} chat room: ${error.message}`,
      error.stack,
    );
  }
}

// Other group event handlers updated similarly...
```

#### 4. Future ChatController Refactoring
Refactor ChatController to use ChatRoomManagerInterface for operations:

```typescript
// Example method update in ChatController
@Post('groups/:slug/messages')
async sendGroupMessage(
  @Param('slug') slug: string,
  @AuthUser() user: UserEntity,
  @Body() body: { message: string },
) {
  const group = await this.groupService.getGroupBySlug(slug);
  if (!group) {
    throw new NotFoundException(`Group with slug ${slug} not found`);
  }

  // Use adapter with explicit tenant ID instead of DiscussionService
  const chatRoom = await this.chatRoomManager.ensureGroupChatRoom(
    group.id,
    user.id,
    this.request.tenantId,
  );

  const messageId = await this.chatRoomManager.sendMessage(
    chatRoom.id,
    user.id,
    body.message,
    this.request.tenantId,
  );

  return { id: messageId };
}
```

### Implementation Phases

#### Phase 1: Interface Extension & Implementation
1. Extend ChatRoomManagerInterface with group-related methods
2. Implement these methods in MatrixChatRoomManagerAdapter
3. Add comprehensive tests for new methods
4. Update ChatListener to use the new methods for group-related events

#### Phase 2: Service Layer Transition
1. Create wrapper/facade methods in DiscussionService that delegate to ChatRoomManagerInterface
2. Update controllers to use the adapter directly where possible
3. Mark redundant methods in DiscussionService as @Deprecated
4. Add logging to track usage of deprecated methods

#### Phase 3: Full Migration & Cleanup
1. Complete migration of all callers to use the adapter
2. Remove deprecated methods from DiscussionService
3. Consider refactoring DiscussionService into a thin facade
4. Update documentation to reflect new architecture

## Testing Strategy
- Unit tests for all new methods in MatrixChatRoomManagerAdapter
- Integration tests for end-to-end group chat functionality
- Specific tests for tenant context handling
- Tests for ChatListener with mocked event payload

## Deployment Strategy
- Deploy in phases with backward compatibility maintained
- Monitor chat functionality closely during each deployment
- Have rollback plan ready in case of issues

## Future Considerations
- Consider moving all Matrix-specific code to a dedicated service
- Evaluate a more generic interface that could support different chat backends
- Improve error recovery mechanisms for Matrix API failures
- Add support for direct messaging using the same architecture

## Appendix
- Related documents:
  - Current ChatRoomManagerInterface implementation
  - ExistingDiscussionService implementation
  - Matrix chat system documentation