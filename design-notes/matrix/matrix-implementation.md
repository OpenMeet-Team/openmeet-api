# Matrix Implementation Details

This document details the technical implementation of Matrix chat in OpenMeet, focusing on key design decisions, patterns, and credential management.

## Service Architecture

### Matrix Module Services

1. **MatrixCoreService**
   - Handles SDK loading and initialization
   - Manages admin client for system operations
   - Uses dynamic imports for ESM compatibility
   - Centralizes configuration and access to Matrix API

2. **MatrixUserService**
   - Manages user provisioning and authentication
   - Handles Matrix user creation and login
   - Synchronizes display names with OpenMeet
   - Implements token refresh and credential management

3. **MatrixRoomService**
   - Creates and configures Matrix rooms
   - Manages room membership and invitations
   - Handles power levels based on OpenMeet roles
   - Provides utility methods for room operations

4. **MatrixMessageService**
   - Sends and retrieves messages
   - Manages typing notifications
   - Handles timeline event processing
   - Formats messages for consistent display

5. **MatrixGateway**
   - Implements WebSocket communication via Socket.io
   - Authenticates connections with JWT tokens
   - Broadcasts room events to connected clients
   - Manages tenant-aware connection lifecycle

### Chat Module Adapters

1. **MatrixChatServiceAdapter**
   - Implements the ChatService interface using Matrix
   - Acts as the bridge between Chat and Matrix modules
   - Handles error recovery and credential management
   - Provides chat functionality to controllers

2. **MatrixChatProvider**
   - Lower-level adapter for Matrix operations
   - Implements the ChatProvider interface
   - Abstracts Matrix-specific implementation details
   - Handles room creation, joining, and message sending

## Credential Management

### Error Handling Flow

The credential management system implements a multi-stage fallback approach for handling Matrix token errors:

```
Try operation → If M_UNKNOWN_TOKEN error → Try token refresh → If fails → Reprovision
```

### Implementation Pattern

```typescript
// Error handling pattern
try {
  // Attempt Matrix operation
} catch (error) {
  if (error.errcode === 'M_UNKNOWN_TOKEN') {
    // Refresh credentials or reprovision user
    await this.handleCredentialRefresh(userId);
    // Retry original operation
  } else {
    // Handle other errors
  }
}
```

### Key Strategies

1. **Preserve Matrix User IDs**
   - When refreshing tokens, keep existing Matrix IDs
   - Avoids duplicating users in Matrix
   - Maintains consistent identity across resets

2. **Progressive Recovery**
   - First attempt: refresh token for existing Matrix ID
   - Second attempt: full re-provisioning if needed
   - Transparent to end users

3. **Security-First Approach**
   - Server-side credential management only
   - No exposure of Matrix tokens to frontend
   - Secure storage in database

4. **Reset Options**
   ```sql
   -- Preserve Matrix IDs (preferred)
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   
   -- Full Reset (if needed)
   UPDATE "user" SET matrix_user_id = NULL, matrix_access_token = NULL;
   UPDATE events SET "matrixRoomId" = NULL;
   UPDATE groups SET "matrixRoomId" = NULL;
   DELETE FROM "chatRooms";
   ```

## Performance Optimizations

1. **Request-scoped Caching**
   - Prevents redundant database queries
   - Caches entity relationships
   - Automatically initialized and cleaned up

2. **Matrix Room Joining**
   - Direct join-first strategy with fallback
   - Caches room membership state
   - Reduces redundant API calls

3. **WebSocket Efficiency**
   - Optimized message structure
   - Debouncing for typing notifications
   - Proper connection lifecycle management

4. **Matrix SDK ESM Compatibility**
   - Dynamic import pattern to handle ESM modules
   - Initialization in onModuleInit
   - Works in all environments (development, testing, production)

## Permission Management

### Power Level Assignment

Power levels in Matrix rooms are assigned based on OpenMeet roles:

- Event/group creators: moderator status (power level 50)
- Event admins/hosts: moderator privileges (power level 50)
- Group admins/moderators: moderator privileges (power level 50)
- Regular members: default power level (0)

### Permission Checks

- For events: User must have host or moderator role AND ManageEvent permission
- For groups: User must have owner, admin, or moderator role

## Direct Matrix Client Access

OpenMeet allows users to set their own Matrix passwords for use with third-party clients:

```
POST /api/matrix/set-password
{
  "password": "securePassword123"
}
```

Benefits:
- Access to advanced Matrix client features
- Use on multiple devices and clients
- Integration with other Matrix services

## Key Design Decisions

1. **Admin API vs. Shared Secret**
   - Using Admin API for user registration
   - More secure - no shared secret exposed
   - Better isolation from Matrix implementation details

2. **WebSocket vs. SSE**
   - Replaced Server-Sent Events with WebSockets
   - Bidirectional communication
   - Room-based event broadcasting
   - Proper connection lifecycle management

3. **Event-Based Architecture**
   - Loosely coupled modules communicate via events
   - Events use slugs for entity identification
   - Clean separation of concerns between modules

4. **Domain-Driven Design**
   - Clean interfaces for module boundaries
   - Dependency injection for service composition
   - Adapters for external systems like Matrix

## Current Technical Challenges

1. **Comprehensive Testing**
   - Expanded test coverage for credential management
   - WebSocket integration testing
   - Load testing and performance verification

2. **Permission Refinements**
   - Single source of truth for permissions
   - Granular mapping between roles and Matrix powers
   - Periodic permission verification

## Future Enhancements

1. **End-to-End Encryption**
   - Implement E2EE for direct messages
   - Handle key management and verification

2. **Advanced Search**
   - Full-text search across chat history
   - Advanced filtering options

3. **Performance Monitoring**
   - Track sync performance metrics
   - Identify and address bottlenecks

4. **Offline Support**
   - Cache messages when offline
   - Queue outgoing messages
   - Sync when connection is restored