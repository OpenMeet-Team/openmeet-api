# Matrix Implementation Details

This document details the technical implementation of Matrix chat in OpenMeet, focusing on key design decisions, patterns, and credential management.

## Service Architecture

### Matrix Module Services

1. **MatrixCoreService**
   - Handles SDK loading and initialization
   - Manages admin client for system operations
   - Provides admin token regeneration capability
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
   - Ensures admin is in room before performing operations
   - Handles power levels based on OpenMeet roles
   - Provides utility methods for room operations
   - Gracefully handles rate limiting errors

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

#### For Regular Users:
```
Try operation → If M_UNKNOWN_TOKEN error → Try token refresh → If fails → Reprovision
```

#### For Admin Operations:
```
Try operation → If M_UNKNOWN_TOKEN error → Regenerate admin token using password → Retry operation
```

### Implementation Patterns for Error Handling

#### User Operation Pattern
- First attempt the Matrix operation
- If token error (M_UNKNOWN_TOKEN) is encountered, refresh user credentials
- If refresh fails, reprovision the user with new Matrix credentials
- Retry the original operation with new credentials
- Handle other errors appropriately (logging, retries for rate limiting)

#### Admin Operation Pattern
- First ensure admin is in the target room
- Attempt the Matrix admin operation
- If token error (M_UNKNOWN_TOKEN) is encountered, regenerate admin token
- Use stored admin password to authenticate and get new token
- Update admin client with new token
- Retry the original operation
- If token regeneration fails, log error and notify administrators

### Key Strategies

1. **Preserve Matrix User IDs**
   - When refreshing tokens, keep existing Matrix IDs
   - Avoids duplicating users in Matrix
   - Maintains consistent identity across resets

2. **Progressive Recovery**
   - First attempt: refresh token for existing Matrix ID
   - Second attempt: full re-provisioning if needed
   - Transparent to end users

3. **Admin Token Regeneration**
   - Store admin password securely in environment variables
   - Automatically regenerate admin tokens when they expire
   - Maintain system operations without manual intervention

4. **Proactive Admin Room Joining**
   - Ensure admin user joins rooms before operations
   - Check room membership status before operations
   - Avoid common "User not in room" errors

5. **Security-First Approach**
   - Server-side credential management only
   - No exposure of Matrix tokens to frontend
   - Secure storage in database

6. **Reset Options**
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

1. **End-to-End Encryption Options**
   - Currently: Messages in encrypted rooms are sent unencrypted via backend clients
   - Implementation options:
     a) **Client-Side Only Encryption**: Handle encryption exclusively in frontend clients, backend never handles encrypted content
     b) **Persistent Backend Clients**: Maintain long-lived client instances per user with persistent crypto store in database
     c) **Key Backup Implementation**: Implement Matrix key backup/recovery with securely stored backup keys
   - Challenges with current architecture:
     - Temporary clients have no persistent crypto store
     - Each message send creates a new "device" without historical keys
     - Message history becomes unreadable for users when logging in
     - No device verification across sessions
   - Recommended approach: Keep encryption for client-side only, use unencrypted rooms for server-initiated messages

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