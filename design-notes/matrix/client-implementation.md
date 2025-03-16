# Matrix Client Implementation Details

## Key Design Decisions

### User Registration: Admin API vs. Shared Secret

We've chosen to use the Matrix Admin API exclusively for user registration instead of the shared secret registration method.

**Rationale:**
- More secure - doesn't require storing a shared secret in configuration
- Provides better isolation from implementation details of the Matrix server
- Works with any Matrix server implementation, not just Synapse
- Gives us more granular control over user creation
- Simplifies configuration by removing an environment variable

**Implementation:**
- Uses `PUT /_synapse/admin/v2/users/@username:server` endpoint
- Sets password and admin status directly
- Performs standard login to obtain the user's access token and device ID
- No dependency on Synapse-specific registration endpoints

### Client Instance Management: User-Specific Instances with Lifecycle Management

We've implemented a sophisticated approach for real-time Matrix client management:

**Architecture:**
- Each active user gets a dedicated Matrix client instance
- Admin operations use a separate connection pool
- Clients have automatic lifecycle management

**How it works:**
1. **Client Creation & Start**
   - When a user accesses chat, a dedicated Matrix client is created
   - Client is configured with the user's credentials (userId, accessToken, deviceId)
   - Client starts syncing to receive real-time events
   - Event callbacks are registered for handling messages

2. **Activity Tracking**
   - Each client tracks the last activity timestamp
   - Activity is updated when the user interacts with chat

3. **Automatic Cleanup**
   - Inactive clients (no activity for 2 hours) are automatically cleaned up
   - Cleanup runs periodically to prevent resource exhaustion
   - When service is shut down, all clients are properly stopped

4. **Event Handling**
   - Real-time events are delivered through callbacks
   - Multiple callbacks can be registered per client
   - Callbacks can be added/removed dynamically

5. **Message Retrieval**
   - Smart message retrieval that uses synced data when available
   - Falls back to REST API for historical messages
   - Optimized for both real-time and historical data access

## Real-time Updates Implementation

### Server-Side (NestJS API)

1. **Event Sources**
   - Matrix client instances are maintained for each active user
   - Each Matrix client syncs with the Matrix server in real-time
   - Events are filtered and processed server-side

2. **WebSocket Implementation**
   - Endpoint: `/socket.io/matrix`
   - Authentication: Uses JWT and tenant ID for secure identification
   - Implementation: NestJS WebSocketGateway with Socket.io
   - Properly handles room subscription and event broadcasting

3. **Event Flow**
   - Matrix client receives events via sync API
   - Events are filtered by type and relevance
   - Events are sent to the browser via WebSocket rooms
   - Connection cleanup happens automatically when client disconnects

### Client-Side (Vue.js/Quasar)

1. **Matrix Service**
   - Singleton service to manage Matrix WebSocket connection
   - Handles connection, error recovery, and event distribution
   - Provides a consistent API for consuming Matrix events

2. **Store Integration**
   - Unified message store handles all real-time message events
   - Single consistent approach for all messaging contexts
   - Store subscribes to Matrix events via the Matrix service

3. **UI Components**
   - MessagesPage displays direct messages with real-time updates
   - DiscussionComponent shows chronological group/event discussions
   - All components use a consistent message display pattern
   - All implement typing indicators and read receipts

### Event Handling

Events from the server are structured with specific event types:

```
event: m.room.message
data: {"room_id":"!room123:matrix.org","event_id":"$event456",
  "sender":"@user:matrix.org","content":{"body":"Hello world"}}
```

The Matrix service processes these events:

```typescript
socket.on('matrix-event', (event) => {
  if (event.type === 'm.room.message') {
    this.handleRoomMessage(event);
  } else if (event.type === 'm.typing') {
    this.handleTyping(event);
  } else if (event.type === 'm.receipt') {
    this.handleReceipt(event);
  }
});
```

### Error Recovery

The implementation includes sophisticated error recovery:

1. **Connection monitoring**
   - Tracks connection status
   - Detects disconnections and errors

2. **Exponential backoff**
   - Progressive delays between reconnection attempts
   - Prevents overwhelming the server during outages

3. **State restoration**
   - Maintains connection state
   - Resumes from last known point after reconnection

## Secure Matrix Credential Management

**Implementation Status:**
- Server-side Matrix credential management implemented
- WebSocket tenant ID handling (auth object, query param, headers) configured
- Matrix client lifecycle management with WebSocket session established
- JWT-only authentication for WebSockets (no Matrix credentials sent)
- Secure WebSocket connection initialization verified
- Backend fixed: Tenant ID now properly passed to UserService.findById()

**Security Implementation Details:**
1. **Session-based Matrix Client:**
   - Matrix client instances are now created when WebSocket connections are established
   - Each client is associated with the user's WebSocket session
   - Clients remain in memory only for the duration of the WebSocket connection
   - All Matrix operations use the session-bound client

2. **Server-side Credential Management:**
   - Matrix credentials are stored securely in the database (encrypted)
   - Credentials are retrieved using user ID from JWT authentication
   - No Matrix credentials are ever sent to the client
   - ElastiCache is used for temporary credential caching to improve performance

3. **Clean Credential Lifecycle:**
   - When WebSocket connection is established:
     - User is authenticated via JWT
     - Matrix credentials are retrieved from database
     - Matrix client instance is created with these credentials
   - During session:
     - The Matrix client is used for all operations
     - Tokens are periodically checked for refresh needs
   - When WebSocket connection closes:
     - Matrix client is destroyed
     - Credentials are cleared from memory

4. **Multi-tenant Support:**
   - WebSocket connections include tenant ID for proper authentication
   - Tenant ID is provided consistently via Socket.io auth object
   - All UserService methods correctly receive tenant ID parameter
   - Frontend ensures tenant ID is properly included in WebSocket connection
   - Tenant ID is stored in localStorage as fallback mechanism
   - Default 'default' tenant ID is used if no specific tenant is provided

**Security Benefits:**
- Matrix credentials never exposed to client
- Credentials only in memory during active session
- No credential transmission over network (beyond initial DB fetch)
- Reduced attack surface
- Proper tenant isolation

**Performance Benefits Realized:**
- All WebSocket advantages maintained (real-time, low latency)
- Credential lookup avoided on every Matrix operation
- Efficient use of resources with proper cleanup
- Improved response times for Matrix operations