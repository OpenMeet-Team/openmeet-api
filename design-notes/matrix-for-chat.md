# Matrix Integration for OpenMeet Chat

## User Experience Changes

### Overview
The transition from Zulip to Matrix will be designed to be seamless from the user's perspective, with several notable improvements in functionality and performance. The core chat experience will remain familiar while introducing enhanced features. We'll be removing zulip entirely, and replacing it with matrix. 

### Key User Experience Improvements

1. **Real-time Messaging**
   - Messages will appear instantly without page refreshes
   - Typing indicators will show when other users are composing messages
   - Read receipts will indicate when messages have been seen

2. **Rich Media Support**
   - Improved image and file sharing with previews
   - Better rendering of links and embeds
   - Support for formatted text (bold, italic, code blocks)

3. **Chat Organization**
   - Clearer distinction between group chats and event chats
   - Improved notification settings per chat room
   - Simplified chronological messaging for all conversations

4. **Mobile Experience**
   - More responsive interface on mobile devices
   - Offline message queue for spotty connections
   - Reduced data usage for mobile networks

5. **Accessibility**
   - Improved keyboard navigation
   - Better screen reader support
   - Customizable text sizing and contrast

### User Flow Examples

**Group Chat Flow:**
1. User navigates to a group page
2. Chat panel loads with recent messages
3. New messages appear in real-time with sender avatars and timestamps
4. User can type messages, share files, and use formatting options
5. Notifications appear for mentions and messages in other rooms

**Event Chat Flow:**
1. User joins an event page
2. Event chat loads with context-specific information
3. Event notifications (start time, updates) appear in the chat
4. Participants can communicate before, during, and after the event
5. Event-specific resources can be shared in the chat

## Technical Implementation Plan

### Architecture Changes

1. **Backend Components**
   - Replace Zulip service with Matrix service in the NestJS backend
   - Implement Matrix client SDK for server-side operations
   - Create mapping between OpenMeet entities and Matrix rooms/users

2. **Data Model Updates**
   - Add Matrix-specific fields to User entity (matrixUserId, accessToken)
   - Update ChatRoom entity to store Matrix room IDs
   - Create mapping tables for Matrix events if needed

3. **API Layer Changes**
   - Update chat endpoints to interact with Matrix instead of Zulip
   - Add new endpoints for Matrix-specific features
   - Maintain backward compatibility where possible

4. **Frontend Updates**
   - Integrate Matrix client SDK in the frontend
   - Update chat components to use Matrix events
   - Implement real-time updates using Matrix sync API

### Matrix Integration Details

1. **User Management**
   - Create Matrix users for each OpenMeet user
   - Map OpenMeet authentication to Matrix authentication
   - Handle user profile synchronization

2. **Room Management**
   - Create Matrix rooms for OpenMeet groups and events
   - Set appropriate room permissions based on OpenMeet roles
   - Handle room membership changes when group/event membership changes

3. **Message Handling**
   - Send/receive messages through Matrix API
   - Handle message formatting and rich content
   - Implement message editing and deletion

4. **Real-time Updates**
   - Use Matrix sync API for real-time message delivery
   - Implement efficient sync handling to minimize resource usage
   - Handle reconnection and state recovery
   - Maintain per-user syncing clients with automatic cleanup

5. **Media Management**
   - Use Matrix media repository for file uploads
   - Handle image resizing and thumbnails
   - Implement media caching for performance

## Client Implementation Details

### Key Design Decisions

#### User Registration: Admin API vs. Shared Secret

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

#### Client Instance Management: User-Specific Instances with Lifecycle Management

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

### Real-time Updates Implementation

#### Server-Side (NestJS API)

1. **Event Sources**
   - Matrix client instances are maintained for each active user
   - Each Matrix client syncs with the Matrix server in real-time
   - Events are filtered and processed server-side

2. **SSE Endpoint**
   - Endpoint: `/api/matrix/events`
   - Authentication: Uses cookie-based auth to identify the user
   - Response type: `text/event-stream`
   - Implementation: NestJS SSE module with event processing

3. **Event Flow**
   - Matrix client receives events via sync API
   - Events are filtered by type and relevance
   - Events are sent to the browser via SSE
   - Connection cleanup happens automatically when client disconnects

#### Client-Side (Vue.js/Quasar)

1. **Matrix Service**
   - Singleton service to manage Matrix SSE connection
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

#### Event Handling

Events from the server are structured with specific event types:

```
event: m.room.message
data: {"room_id":"!room123:matrix.org","event_id":"$event456",
  "sender":"@user:matrix.org","content":{"body":"Hello world"}}
```

The Matrix service processes these events:

```typescript
eventSource.addEventListener('m.room.message', this.handleRoomMessage.bind(this))
eventSource.addEventListener('m.typing', this.handleTyping.bind(this))
eventSource.addEventListener('m.receipt', this.handleReceipt.bind(this))
```

#### Error Recovery

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

### Migration Strategy (Hard Cutover)

1. **Pre-Cutover Preparation**
   - Complete development of Matrix integration
   - Thoroughly test all functionality in staging environment
   - Prepare database migration scripts to add Matrix fields
   - Create admin tools for provisioning Matrix users and rooms

2. **Cutover Process**
   - Schedule maintenance window for the transition
   - Disable access to the platform during cutover
   - Run database migrations to add Matrix-specific fields
   - Provision Matrix users for all existing OpenMeet users
   - Create Matrix rooms for all existing groups and events
   - Deploy updated backend with Matrix integration
   - Deploy updated frontend with Matrix client
   - Enable access to the platform

3. **Post-Cutover Support**
   - Provide clear communication to users about the new chat system
   - Offer documentation on new features
   - Monitor system closely for issues
   - Have support team ready to address user questions
   - Maintain ability to quickly roll back if critical issues arise

4. **Zulip Decommissioning**
   - Once Matrix integration is confirmed stable, decommission Zulip
   - Archive Zulip data for compliance purposes
   - Remove Zulip-related code and dependencies

### Important Files 

- matrix.gateway.ts - Handles Matrix client creation and management


### Technical Challenges and Solutions

1. **Authentication**
   - Challenge: Securely managing Matrix access tokens
   - Solution: Store encrypted tokens in database, implement token refresh

2. **Performance**
   - Challenge: Handling Matrix sync for many concurrent users
   - Solution: Implement user-specific Matrix client instances with lifecycle management
     - Start dedicated client instance when a user accesses chat
     - Register event callbacks for real-time updates
     - Client remains active during user session
     - Automatic cleanup of inactive clients after period of inactivity (2 hours)
     - Resource-efficient connection pooling for admin operations

3. **Scalability**
   - Challenge: Scaling Matrix as user base grows
   - Solution: Configure Matrix server for horizontal scaling, implement caching

4. **Data Consistency**
   - Challenge: Keeping OpenMeet and Matrix data in sync
   - Solution: Implement transaction-based operations, retry mechanisms

5. **Error Handling**
   - Challenge: Graceful handling of Matrix service disruptions
   - Solution: Implement circuit breakers, fallback mechanisms, and clear user feedback

## Implementation Phases

### Phase 1: Infrastructure and Core Service (1 week) - COMPLETED
- Deploy Matrix Synapse server
- Implement basic Matrix service in NestJS
  - Admin API-based user registration (removing dependency on shared registration secret)
  - Resource-efficient client management with user-specific instances
  - Smart message retrieval using synced data when available
  - Automatic cleanup and lifecycle management
- Create user and room mapping system

#### Phase 1 Implementation Notes
- Matrix service implementation complete with the following features:
  - User provisioning via admin API (no shared secret needed)
  - Connection pooling for admin operations
  - User-specific Matrix clients with automatic cleanup
  - Room creation and management
  - User display name management and verification
  - Real-time updates via server-sent events (SSE)
  - Enhanced error handling and diagnostics
- Fixed issues:
  - Display names now properly use OpenMeet user names instead of Matrix IDs
  - Messages no longer show with incorrect "General" prefix
  - Improved real-time updates when new messages arrive

### Phase 1.5: Simplification of Message Model (1 week) 🔄 IN PROGRESS

**Implementation Status:**

**Completed:**
- ✅ Remove thread relations support from Matrix service
- ✅ Create unified message store to replace chat-store and discussion-store
- ✅ Update API methods to remove topic formatting
- ✅ Update event-discussion service to remove topic handling
- ✅ Create standardized UI components for messaging
- ✅ Implement WebSocket support for real-time messaging

**Remaining:**
- ⏳ Update existing event pages to use the new unified message component
- ⏳ Update group discussion pages to use the new unified message component
- ⏳ Update direct message pages to use the new unified message component
- ⏳ Handle graceful migration of any existing threaded discussions
- ⏳ Add comprehensive tests for the unified message components
- ⏳ Update message type definitions to remove topic-related fields

**Next Steps:**
1. Complete UI component migration to use the unified message store
2. Update the frontend routes and pages to use the new components
3. Add tests for the simplified message model
4. Update documentation for developers

**Benefits:**
- Simpler, more maintainable codebase
- More consistent user experience across the platform
- Better alignment with Matrix's native messaging model
- Reduced complexity in state management

### Phase 1.6: Secure Matrix Credential Management 🆕 IN PROGRESS

**Current Status:**
- Basic WebSocket integration for Matrix chat completed
- Matrix credentials currently passed from client to server (security concern)

**Implementation Goals:**
- Implement hybrid credential management approach for Matrix authentication
- Maintain real-time WebSocket benefits while securing Matrix credentials

**Approach:**
1. **Session-based Matrix Client:**
   - Create a Matrix client instance when WebSocket connection is established
   - Associate client with the user's WebSocket session
   - Keep client in memory only for the duration of the WebSocket connection
   - Use the client for all Matrix operations during the session

2. **Server-side Credential Management:**
   - Store Matrix credentials securely in database (encrypted)
   - Retrieve credentials using user ID from JWT authentication
   - Never send Matrix credentials to client
   - Use ElastiCache for temporary credential caching, if beneficial

3. **Clean Credential Lifecycle:**
   - When WebSocket connection is established:
     - Authenticate user via JWT
     - Retrieve Matrix credentials from database
     - Create Matrix client instance with these credentials
   - During session:
     - Use Matrix client for all operations
     - Periodically check if tokens need refresh
   - When WebSocket connection closes:
     - Destroy Matrix client
     - Clear credentials from memory

4. **Multi-tenant Support:**
   - WebSocket connections must include tenant ID for proper authentication
   - Tenant ID can be provided in one of the following ways:
     - As part of Socket.io auth object: `socket.handshake.auth.tenantId`
     - As a query parameter: `socket.handshake.query.tenantId`
     - As a header: `socket.handshake.headers['x-tenant-id']`
   - The tenant ID must be passed to UserService methods:
     - `userService.findById(userId, tenantId)` - Missing this parameter causes "Tenant ID is required" error
   - Frontend must ensure tenant ID is properly included in WebSocket connection
   - Frontend should store tenant ID in localStorage as fallback mechanism
   - Default to 'default' tenant ID if no specific tenant is provided

**Security Benefits:**
- Matrix credentials never exposed to client
- Credentials only in memory during active session
- No credential transmission over network (beyond initial DB fetch)
- Reduced attack surface

**Performance Benefits:**
- Maintains all WebSocket advantages (real-time, low latency)
- Avoids credential lookup on every Matrix operation
- Efficient use of resources with proper cleanup

**Implementation Timeline:**
- Backend changes (1-2 days)
- Frontend adjustments (1 day)
- Testing and validation (1 day)

**Implementation Status:**
- ✅ Server-side Matrix credential management
- ✅ WebSocket tenant ID handling (auth object, query param, headers)
- ✅ Matrix client lifecycle management with WebSocket session
- ✅ JWT-only authentication for WebSockets (no Matrix credentials sent)
- ✅ Secure WebSocket connection initialization
- ⏳ Backend hotfix: Passing tenant ID to UserService.findById()

**Next Steps:**
1. Update Matrix service to implement the hybrid approach - COMPLETED
2. Modify WebSocket gateway to securely handle Matrix credentials - COMPLETED 
3. Update frontend to work with the new authentication pattern - COMPLETED
4. Add backend hotfix for tenant ID handling:
   ```typescript
   // In matrix.gateway.ts authentication middleware:
   const tenantId = socket.handshake.auth.tenantId;
   // Pass both user ID and tenant ID to findById:
   const user = await userService.findById(userId, tenantId);
   ```

### Phase 1.9: Service Architecture Restructuring ✅ COMPLETED

**Current Status:**
- Complete restructuring of services to eliminate cross-module dependencies
- Moved discussion-related endpoints from EventController to ChatController
- Implemented event-based communication with slugs instead of IDs
- Eliminated direct dependencies between Event and Matrix modules
- Frontend updated to use new slug-based API endpoints
- Moved obsolete EventDiscussionService files to disabled-tests directory
- Fixed Matrix SDK ESM/CommonJS compatibility issues using dynamic imports

**Matrix SDK ESM Compatibility Solution:**
- The Matrix SDK (matrix-js-sdk) uses ES modules, causing compatibility issues with CommonJS in ts-node
- Implemented a dynamic import pattern with placeholder constants to ensure compatibility in all environments
- Initialization happens in onModuleInit using await import() instead of static imports
- This pattern works for ts-node, Jest tests, and production builds without modification

**Implementation Goals:**
- Establish a clean, modular architecture with proper separation of concerns
- Eliminate circular dependencies between modules
- Create clear interfaces for all components to ensure maintainability
- Utilize slug-based methods for all inter-module communication

**Updated Module Relationship Diagram:**

```
┌─────────────────────────┐     ┌──────────────────────┐
│                         │     │                      │
│     Event Module        │     │    Chat Module       │
│                         │     │                      │
│ ┌─────────────────────┐ │     │ ┌──────────────────┐ │
│ │EventController      │ │     │ │ChatController    │ │
│ └─────────────────────┘ │     │ └──────────────────┘ │
│ ┌─────────────────────┐ │     │ ┌──────────────────┐ │
│ │EventManagementService│ │     │ │DiscussionService│ │
│ └─────────────────────┘ │     │ └──────────────────┘ │
│ ┌─────────────────────┐ │     │ ┌──────────────────┐ │
│ │EventQueryService    │ │     │ │ChatListener      │ │
│ └─────────────────────┘ │     │ └──────────────────┘ │
│ ┌─────────────────────┐ │     │        ▲             │
│ │EventListener        │─┼─────┼────────┘             │
│ └─────────────────────┘ │     │        │             │
│           │             │     │        │             │
└───────────┼─────────────┘     └────────┼─────────────┘
            │                            │
Events:      │                            │
chat.event.created   │                            │
chat.event.member.add│                            ▼
chat.event.member.remove                 ┌──────────────────────┐
            │                            │                      │
            └─────────────────────┐      │  ChatRoom Module     │
                                  │      │                      │
                                  │      │ ┌──────────────────┐ │
                                  └──────┼─▶ChatRoomService   │ │
                                         │ └──────────────────┘ │
                                         │        │             │
                                         └────────┼─────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────────────┐
                                         │                      │
                                         │    Matrix Module     │
                                         │                      │
                                         │ ┌──────────────────┐ │
                                         │ │MatrixService     │ │
                                         │ └──────────────────┘ │
                                         │ ┌──────────────────┐ │
                                         │ │MatrixGateway     │ │
                                         │ └──────────────────┘ │
                                         │                      │
                                         └──────────────────────┘
```

**Key Architectural Changes:**

1. **Slug-Based Event-Driven Communication**
   - Event module now emits domain events with slugs instead of IDs
   - Events are now properly named (e.g., `chat.event.created`, `chat.event.member.add`)
   - All cross-module communication uses slugs instead of numeric IDs
   - Chat module listens for these events and handles them autonomously
   - Eliminates direct dependencies between Event and Matrix modules

2. **Clean Interface Abstractions**
   - Created `DiscussionServiceInterface` to define clear contracts
   - Created `ChatProviderInterface` to abstract Matrix implementation details
   - Added helper methods to convert between slugs and IDs where necessary
   - Legacy ID-based methods delegate to slug-based implementations

3. **Consolidated Chat Functionality**
   - Moved all chat-related business logic to Chat module
   - Event module focuses on event domain logic only
   - ChatRoom and Matrix modules are now only directly used by the Chat module
   - Clearer separation of concerns for easier maintenance

4. **Forward References for Circular Dependencies**
   - Use of `forwardRef()` where circular dependencies still exist
   - Proper resolution ordering for dependent modules

**Implementation Progress:**
- ✅ Moved EventDiscussionService functionality to DiscussionService in Chat module
- ✅ Created ChatController with all discussion-related endpoints
- ✅ Updated EventController to remove discussion endpoints
- ✅ Implemented slug-based event communication between modules
- ✅ Added ChatListener to handle events from other modules
- ✅ Fixed tenant ID handling throughout service layer
- ✅ Removed direct dependencies between Event and Matrix modules
- ✅ Updated module imports to use forwardRef() where needed
- ✅ Created helper methods to convert between slugs and IDs where needed
- ✅ Updated API endpoints in frontend to use new slug-based patterns
- ✅ Modified frontend components to use correct parameter types (string slugs instead of numeric IDs)
- ✅ Updated event-store.ts, chat.ts, and events.ts in frontend to use new endpoints

**Frontend Changes:**
- Updated API endpoints in chat.ts and events.ts to match the new backend structure
- Changed URL patterns to use '/api/chat/event/:slug/...' instead of '/api/events/:slug/discussions/...'
- Modified method signatures to use string slugs instead of numeric IDs
- Updated EventTopicsComponent and other components to use user.slug instead of user.id
- Fixed TypeScript types throughout the codebase

**Next Steps:**
1. Complete comprehensive integration testing of the new architecture
2. Refactor ChatRoomService to use slugs directly rather than IDs
3. Remove any remaining legacy ID-based code
4. Update documentation and developer guides to reflect the new architecture
5. Implement dark mode styling for discussion components
6. Verify that all Matrix-related functionality works with the new architecture

### Phase 2: Feature Implementation (2 weeks)
- Implement all chat functionality (messaging, rooms, media)
- Update API endpoints
- Complete frontend integration
- Develop user/room provisioning tools

### Phase 3: Testing and Preparation (1 week)
- Comprehensive testing in staging environment
- Performance testing under load
- Security review
- Prepare cutover plan and rollback procedures

### Phase 4: Cutover (1 day)
- Execute hard cutover during maintenance window
- Provision all users and rooms in Matrix
- Deploy updated code
- Verify functionality

### Phase 5: Stabilization (1 week)
- Monitor system performance
- Address any issues
- Collect user feedback
- Optimize based on real-world usage

## Simplification of Message Model

As of Phase 1.5, we've made the decision to simplify our messaging model by removing topic-based threading in favor of standard chronological messaging. This simplification offers several benefits:

1. **More Consistent with Matrix**
   - Aligns with Matrix's native message timeline model
   - Leverages Matrix's strengths without adding complex abstractions

2. **Simpler Implementation**
   - Unified message store instead of separate chat/discussion stores
   - Reduced complexity in state management
   - More maintainable codebase with fewer edge cases

3. **Better User Experience**
   - Consistent message display across all contexts
   - Familiar chat experience similar to other messaging platforms
   - Reduced learning curve for users

### Implementation Changes

1. **Client-Side**
   - Removed topic metadata from messages
   - Unified chat and discussion stores
   - Standardized UI components for message display

2. **Server-Side**
   - Simplified message handling in Matrix service
   - Consistent API endpoints for all messaging contexts
   - Streamlined data model for messages

## Future Enhancements

1. **End-to-End Encryption**
   - Implement E2EE for direct messages
   - Handle key management and verification

2. **Federation**
   - Explore Matrix federation capabilities
   - Potential integration with other Matrix communities

3. **Bots and Integrations**
   - Develop chatbots for common tasks
   - Integrate with other services (calendar, task management)

4. **Advanced Search**
   - Implement full-text search across chat history
   - Provide advanced filtering options

5. **Connection Optimization**
   - Implement smarter connection management based on user activity patterns
   - Potential for shared syncing for users in the same rooms

6. **Performance Monitoring**
   - Track sync performance metrics
   - Identify and address bottlenecks

7. **Offline Support**
   - Cache messages when offline
   - Queue outgoing messages
   - Sync when connection is restored
   
8. **IMPLEMENTED: WebSockets Instead of SSE**
   - ✅ Replaced SSE with WebSockets for real-time Matrix events
   - ✅ Implemented Socket.io with NestJS WebSocketGateway
   - ✅ Proper JWT token-based authentication for WebSocket connections
   - ✅ Room-based broadcasting for efficient message delivery
   - ✅ Bidirectional communication for typing indicators and messages
   - ✅ Tenant-aware connection management
   - ✅ WebSocket lifecycle management with Matrix client lifecycle
   
   **Implementation Notes:**
   - Matrix events are now exclusively sent via WebSockets
   - Each client explicitly joins their Matrix rooms as Socket.io rooms
   - Matrix timeline events are captured and broadcast to WebSocket clients
   - SSE endpoints have been removed in favor of WebSockets
   - Improved reconnection handling and error recovery
   
   **Current Focus (Phase 1.7 - March 2025):**
   - Debugging WebSocket room membership and event broadcasting
   - Ensuring Matrix timeline events are properly captured
   - Adding comprehensive logging for event flow tracing
   - Implementing proper error handling for WebSocket connections
   - Testing with multiple concurrent users
   
   **Next Steps:**
   1. Fix event propagation from Matrix to WebSocket clients
   2. Add additional Matrix event types (typing indicators, read receipts)
   3. Optimize room membership handling for better reliability
   4. Add client-side reconnection handling
   5. Complete frontend integration with the unified message store

9. **IMPLEMENTED: Dark Mode Support for Chat Components**
   - ✅ Added proper dark mode styling for discussion components
   - ✅ Fixed issue with light text on light background in dark mode
   - ✅ Implemented consistent color scheme for messages in both light and dark modes
   
   **Visual Impact:**
   - Messages now correctly display with dark background and light text in dark mode
   - Consistent contrast ratio for improved readability
   - Timestamps and secondary elements use appropriate opacity for visual hierarchy
   - Message content maintains proper contrast in both modes