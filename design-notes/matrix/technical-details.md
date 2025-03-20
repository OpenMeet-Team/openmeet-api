# Matrix Technical Details

This document details the technical implementation of Matrix chat in OpenMeet, including architecture, data models, and key design decisions.

## Architecture

### Backend Components

#### Matrix Module

The Matrix module has been refactored from a monolithic service into specialized services:

1. **MatrixCoreService**
   - Handles SDK loading and configuration
   - Manages admin client for system operations
   - Uses dynamic imports for ESM compatibility

2. **MatrixUserService**
   - User provisioning and authentication
   - Matrix client lifecycle management
   - Display name synchronization

3. **MatrixRoomService**
   - Room creation and configuration
   - Membership management (invitations, joins)
   - Power level and permission handling

4. **MatrixMessageService**
   - Message sending and retrieval
   - Timeline event handling
   - Typing notification management

5. **MatrixGateway**
   - WebSocket-based real-time communication
   - Event broadcasting to connected clients
   - Tenant-aware connection management

#### Chat Module Consolidation

We've consolidated previously separate chat-related modules:

```
┌─────────────────────────┐     ┌───────────────────────────────────┐
│                         │     │                                   │
│     Event Module        │     │           Chat Module             │
│                         │     │                                   │
│ ┌─────────────────────┐ │     │ ┌───────────────────┐            │
│ │EventController      │ │     │ │ChatController     │            │
│ └─────────────────────┘ │     │ └───────────────────┘            │
│ ┌─────────────────────┐ │     │ ┌───────────────────┐            │
│ │EventManagementService│ │     │ │DiscussionService │            │
│ └─────────────────────┘ │     │ └───────────────────┘            │
│ ┌─────────────────────┐ │     │ ┌───────────────────┐            │
│ │EventQueryService    │ │     │ │ChatListener       │            │
│ └─────────────────────┘ │     │ └───────────────────┘            │
│ ┌─────────────────────┐ │     │ ┌───────────────────┐            │
│ │EventListener        │─┼─────┼─►ChatRoomService    │            │
│ └─────────────────────┘ │     │ └───────────────────┘            │
│           │             │     │ ┌───────────────────┐            │
└───────────┼─────────────┘     │ │MatrixChatService  │            │
            │                    │ └───────────────────┘            │
Events:      │                    │                                   │
chat.event.created   │                    │                                   │
chat.event.member.add│                    │                                   │
chat.event.member.remove                  │                                   │
            │                    │                                   │
            └────────────────────┘                                   │
                                       │                                   │
                                       │                                   │
                                       ▼                                   │
                          ┌────────────────────────┐                      │
                          │                        │                      │
                          │     Matrix Module      │◄─────────────────────┘
                          │                        │
                          │ ┌──────────────────┐   │
                          │ │MatrixService     │   │
                          │ └──────────────────┘   │
                          │ ┌──────────────────┐   │
                          │ │MatrixGateway     │   │
                          │ └──────────────────┘   │
                          │                        │
                          └────────────────────────┘
```

Key architectural changes include:
- Directory reorganization for better code structure
- Slug-based event-driven communication
- Clean interface abstractions
- Proper resolution of circular dependencies

### Data Model Updates

1. **User Entity**
   - `matrix_user_id`: Matrix user identifier (@user:server)
   - `matrix_access_token`: Authentication token for Matrix operations
   - `matrix_device_id`: Device identifier for the Matrix client

2. **ChatRoom Entity**
   - `matrix_room_id`: Matrix room identifier
   - Mapping to OpenMeet entities (event or group)
   - Room type and visibility settings

### Client Instance Management

We've implemented a sophisticated approach for Matrix client management:

1. **Client Creation & Start**
   - User-specific Matrix client instances
   - Configured with user credentials
   - Event callbacks for real-time updates

2. **Activity Tracking**
   - Last activity timestamp tracking
   - Activity updated on user interactions

3. **Automatic Cleanup**
   - Inactive clients (no activity for 2 hours) automatically cleaned up
   - Periodic cleanup to prevent resource exhaustion
   - Proper shutdown on service termination

## Key Technical Decisions

### User Registration: Admin API vs. Shared Secret

We've chosen the Admin API approach for user registration:
- More secure - no shared secret in configuration
- Better isolation from Matrix server implementation details
- Works with any Matrix server implementation
- More granular control over user creation

### WebSocket Integration

We've replaced Server-Sent Events (SSE) with WebSockets:
- Socket.io implementation with NestJS WebSocketGateway
- JWT token-based authentication
- Room-based event broadcasting
- Bidirectional communication
- Proper connection lifecycle management
- Tenant-aware authentication

### Performance Optimizations

1. **Request-scoped Caching**
   - Prevents redundant database queries
   - Cache keys based on entity types and IDs
   - Automatic initialization and cleanup

2. **Matrix Room Joining**
   - Direct join-first strategy
   - Fallback to invite+join when needed
   - Cache for room membership state

3. **WebSocket Efficiency**
   - Reduced message size
   - Duplicate event detection
   - Debouncing for typing notifications (15-second cooldown)

4. **Database Optimizations**
   - Fetching related data in single operations
   - Minimizing queries for membership verification
   - Efficient entity relationship traversal

### Room Permissions Management

Power levels are assigned based on OpenMeet roles:
- Event/group creators: moderator status (power level 50)
- Event admins/hosts: moderator privileges (power level 50)
- Group admins/moderators: moderator privileges (power level 50)
- Regular members: default power level (0)

Permission checks:
- For events: User must have host or moderator role AND ManageEvent permission
- For groups: User must have owner, admin, or moderator role

### Matrix SDK ESM Compatibility

We've solved the ESM/CommonJS compatibility issue:
- Dynamic import pattern with placeholder constants
- Initialization in onModuleInit using await import()
- Works in ts-node, Jest tests, and production builds

## Current Technical Challenges

### Credential Management

We're currently addressing 401 M_UNKNOWN_TOKEN errors:
- Maintaining existing Matrix User IDs when possible
- Graceful handling of authentication errors
- Avoiding frequent validation to reduce overhead
- Implementing token refresh strategies

**Current Implementation Plan:**
```typescript
// Example of handling token errors - this would go in a catch block
if (error.errcode === 'M_UNKNOWN_TOKEN') {
  this.logger.warn(`Matrix token invalid for user ${userId}, attempting re-auth...`);
  
  try {
    // Try to reset token by logging in with existing Matrix ID if possible
    const existingMatrixId = user.matrixUserId;
    const newCredentials = await this.resetUserToken(existingMatrixId);
    
    // Update database with new token
    await this.userService.update(userId, {
      matrixAccessToken: newCredentials.accessToken,
      matrixDeviceId: newCredentials.deviceId,
      // Keep the same Matrix user ID
    });
    
    // Retry the original operation
    return this.originalOperation();
  } catch (resetError) {
    // If re-auth fails, go through full user provisioning as fallback
    // This might create a new Matrix user ID if necessary
    await this.reprovisionMatrixUser(userId);
  }
}
```

### Permission Model Improvements

The permission model needs further refinement:
1. Make OpenMeet the single source of truth for permissions
2. Create a more granular mapping between OpenMeet roles and Matrix power levels
3. Simplify complex permission checks
4. Implement periodic verification of permissions
5. Design permission checks to work efficiently with caching
6. Create clear permission-related API abstractions

## Future Technical Improvements

1. **End-to-End Encryption**
   - Implement E2EE for direct messages
   - Handle key management and verification

2. **Federation**
   - Explore Matrix federation capabilities
   - Potential integration with other Matrix communities

3. **Bots and Integrations**
   - Develop chatbots for common tasks
   - Integrate with other services

4. **Advanced Search**
   - Implement full-text search across chat history
   - Provide advanced filtering options

5. **Connection Optimization**
   - Implement smarter connection management
   - Explore shared syncing for users in same rooms

6. **Performance Monitoring**
   - Track sync performance metrics
   - Identify and address bottlenecks

7. **Offline Support**
   - Cache messages when offline
   - Queue outgoing messages
   - Sync when connection is restored