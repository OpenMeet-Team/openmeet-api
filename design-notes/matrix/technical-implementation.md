# Matrix Technical Implementation

## Architecture Changes

### Backend Components
- Replace Zulip service with Matrix service in the NestJS backend
- Implement Matrix client SDK for server-side operations
- Create mapping between OpenMeet entities and Matrix rooms/users

### Data Model Updates
- Add Matrix-specific fields to User entity (matrixUserId, accessToken)
- Update ChatRoom entity to store Matrix room IDs
- Create mapping tables for Matrix events if needed

### API Layer Changes
- Update chat endpoints to interact with Matrix instead of Zulip
- Add new endpoints for Matrix-specific features
- Maintain backward compatibility where possible

### Frontend Updates
- Integrate Matrix client SDK in the frontend
- Update chat components to use Matrix events
- Implement real-time updates using Matrix sync API

## Matrix Integration Details

### User Management
- Create Matrix users for each OpenMeet user
- Map OpenMeet authentication to Matrix authentication
- Handle user profile synchronization

### Room Management
- Create Matrix rooms for OpenMeet groups and events
- Set appropriate room permissions based on OpenMeet roles
- Assign moderator privileges (power level 50) to event/group admins and hosts
- Handle room membership changes when group/event membership changes
- Automatic permission elevation when admins/hosts join rooms

### Message Handling
- Send/receive messages through Matrix API
- Handle message formatting and rich content
- Implement message editing and deletion

### Real-time Updates
- Use Matrix sync API for real-time message delivery
- Implement efficient sync handling to minimize resource usage
- Handle reconnection and state recovery
- Maintain per-user syncing clients with automatic cleanup

### Media Management
- Use Matrix media repository for file uploads
- Handle image resizing and thumbnails
- Implement media caching for performance

## Service Architecture Restructuring

### Consolidated Chat Module Architecture

We've completely restructured our chat-related architecture by consolidating the previously separate ChatRoom and ChatService modules into the main Chat module. This improves code organization, reduces duplication, and prepares us for a future where Matrix is the sole source of truth for chat data.

### Updated Module Relationship Diagram

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

### Consolidation Details

1. **Module Consolidation**
   - `chat-room` and `chat-service` directories and modules merged into the main `chat` module
   - File paths have been updated to reflect the new organization:
     - `chat-room/chat-room.service.ts` → `chat/rooms/chat-room.service.ts`
     - `chat-room/infrastructure/persistence/relational/entities/chat-room.entity.ts` → `chat/infrastructure/persistence/relational/entities/chat-room.entity.ts`
     - `chat-service/interfaces/chat-service.interface.ts` → `chat/interfaces/chat-service.interface.ts`
     - `chat-service/adapters/matrix-chat.service.ts` → `chat/adapters/matrix-chat-service.adapter.ts`
   - Empty/unused `event-discussion` directory has been removed
   - `ChatRoomModule` has been eliminated, with its providers now part of `ChatModule`

2. **Import Reorganization**
   - All chat-related imports now point to the correct locations within the `chat` module
   - Circular dependencies have been properly addressed with `forwardRef()`
   - Updated all references to the reorganized files across the codebase
   - Removed direct `ChatRoomModule` import from `app.module.ts`

3. **Slug-Based Event-Driven Communication**
   - Event module emits domain events with slugs instead of IDs
   - Events are properly named (e.g., `chat.event.created`, `chat.event.member.add`)
   - All cross-module communication uses slugs instead of numeric IDs
   - Chat module listens for these events and handles them autonomously
   - Eliminates direct dependencies between Event and Matrix modules

4. **Clean Interface Abstractions**
   - `DiscussionServiceInterface` defines clear contracts for discussion handling
   - `ChatProviderInterface` abstracts Matrix implementation details
   - `ChatRoomRepositoryInterface` provides a clean data access layer
   - Helper methods convert between slugs and IDs where necessary
   - Legacy ID-based methods delegate to slug-based implementations

5. **Forward References for Circular Dependencies**
   - Added proper `forwardRef()` where circular dependencies exist:
     - EventModule ↔ ChatModule
     - EventModule ↔ GroupMemberModule
     - EventModule ↔ EventAttendeeModule
     - ChatModule ↔ GroupMemberModule
     - ChatModule ↔ EventAttendeeModule
   - This ensures correct module resolution ordering during application startup

## Technical Challenges and Solutions

### Authentication
- Challenge: Securely managing Matrix access tokens
- Solution: Store encrypted tokens in database, implement token refresh

### Performance
- Challenge: Handling Matrix sync for many concurrent users
- Solution: Implement user-specific Matrix client instances with lifecycle management
  - Start dedicated client instance when a user accesses chat
  - Register event callbacks for real-time updates
  - Client remains active during user session
  - Automatic cleanup of inactive clients after period of inactivity (2 hours)
  - Resource-efficient connection pooling for admin operations

### Scalability
- Challenge: Scaling Matrix as user base grows
- Solution: Configure Matrix server for horizontal scaling, implement caching

### Data Consistency
- Challenge: Keeping OpenMeet and Matrix data in sync
- Solution: Implement transaction-based operations, retry mechanisms

### Error Handling
- Challenge: Graceful handling of Matrix service disruptions
- Solution: Implement circuit breakers, fallback mechanisms, and clear user feedback

## WebSockets Implementation

- Replaced SSE with WebSockets for real-time Matrix events
- Implemented Socket.io with NestJS WebSocketGateway
- Proper JWT token-based authentication for WebSocket connections
- Room-based broadcasting for efficient message delivery
- Bidirectional communication for typing indicators and messages
- Tenant-aware connection management
- WebSocket lifecycle management with Matrix client lifecycle
- Fixed group discussion typing notifications issues
- Implemented proper automatic room joining for users

### Implementation Notes
- Matrix events are now exclusively sent via WebSockets
- Each client explicitly joins their Matrix rooms as Socket.io rooms
- Matrix timeline events are captured and broadcast to WebSocket clients
- SSE endpoints have been removed in favor of WebSockets
- Improved reconnection handling and error recovery
- Secure connection management without exposing Matrix credentials
- Proper room membership handling ensures typing notifications work correctly
- Added comprehensive logging for troubleshooting connection issues

## Performance Optimizations

- Implemented request-scoped caching to prevent redundant database operations
- Added debouncing for typing notifications (15-second cooldown for unchanged states)
- Optimized Matrix room joining with direct join-first strategy
- Reduced excessive logging by moving verbose logs to debug level
- Added in-memory cache for group/user chat room membership verification
- Optimized WebSocket handlers to reduce duplicate Matrix API calls
- Modified error handling to gracefully handle "already in room" cases
- Improved database queries by fetching related data in single operations
- Implemented smarter duplicate event detection to prevent redundant broadcasts
- Added automatic moderator privileges for event admins/hosts when joining rooms

## Room Permissions Management

The system manages Matrix room power levels to provide appropriate moderation capabilities:

- Event/group creators automatically receive moderator status (power level 50) during room creation
- Event admins/hosts and group admins/moderators receive moderator privileges (power level 50) when joining rooms
- Regular members receive default power level (0) which allows messaging but not moderation
- Power levels are assigned by checking user roles and permissions
- For events, users with host or moderator roles AND ManageEvent permission receive moderator privileges
- For groups, users with owner, admin, or moderator roles receive moderator privileges
- Permission assignment happens after successful room joining, ensuring users have Matrix credentials
- Error handling ensures basic join functionality works even if permission setting fails

### TODO: Permission Model Improvements (Priority: High)

The current permission model between OpenMeet and Matrix needs further simplification. Key improvements to consider:

1. **Unidirectional Permission Flow**: Make OpenMeet the single source of truth for permissions, with Matrix reflecting these permissions automatically.

2. **Role-Based Matrix Power Levels**: Create a more granular mapping between OpenMeet roles and Matrix power levels:
   - System Admin → Matrix Admin (100)
   - Event/Group Owner → Moderator (50)
   - Event/Group Admin → Moderator (50)
   - Event/Group Moderator → Chat Moderator (40)
   - Regular Member → Regular User (0)

3. **Simplified Permission Checks**: Reduce the complex permission checks currently needed to determine Matrix power levels.

4. **Audit and Enforcement**: Periodically verify that Matrix room permissions match OpenMeet role assignments and fix any discrepancies.

5. **Cache-Friendly Design**: Design permission checks to work efficiently with request-scoped caching.

6. **API Abstraction**: Create a clear permission-related API in the ChatService to hide Matrix-specific implementation details.

This work should be prioritized after current unit testing and stability improvements.

## Testing Strategy for Chat Module

The recent consolidation of chat-related modules requires a comprehensive testing strategy. Here's our plan:

### Unit Testing Plan (High Priority)

1. **Re-enable and Update Disabled Tests**
   - Move tests from `disabled-tests/chat-room/chat-room.service.spec.ts` to `src/chat/rooms/chat-room.service.spec.ts`
   - Move tests from `disabled-tests/matrix/*` to appropriate locations in the codebase
   - Update all imports and mocks to reflect the new module structure

2. **New Tests for Consolidated Services**
   - Create/update tests for `DiscussionService`
   - Create tests for `MatrixChatServiceAdapter`
   - Improve tests for `ChatController` to cover all endpoints
   - Add tests for circular dependency edge cases

3. **Mock Strategy**
   - Create proper mocks for Matrix SDK in the test/mocks directory
   - Develop a consistent mocking strategy for Matrix API responses
   - Create test fixtures for common chat-related entities and DTOs
   - Implement request-scoped cache testing

4. **Coverage Targets**
   - Target 80%+ coverage for ChatService, ChatRoomService
   - Target 90%+ coverage for ChatController endpoints
   - Target 70%+ coverage for Matrix adapters
   - Focus first on public API methods that are used by other modules

### Integration Testing Plan (Medium Priority)

1. **Update E2E Tests**
   - Fix the skipped tests in `test/chat/chat.e2e-spec.ts`
   - Expand coverage to include new consolidated functionality
   - Add tests for real Matrix integration (using a test server)
   - Test both slug-based and ID-based APIs

2. **Matrix WebSocket Testing**
   - Add WebSocket testing for real-time Matrix events
   - Test connection management and lifecycle events
   - Create mock WebSocket clients for automated testing

### Performance Testing (Lower Priority)

1. **Benchmark Tests**
   - Add performance tests for chat operations under load
   - Test request-scoped caching effectiveness
   - Measure Matrix client connection pool efficiency

2. **Load Testing**
   - Test room creation and message sending at scale
   - Verify WebSocket performance with many concurrent connections

### Implementation Timeline

1. Week 1: Re-enable disabled tests and update imports
2. Week 2: Complete unit tests for core services
3. Week 3: Update and expand E2E tests
4. Week 4: Implement WebSocket testing and load tests

## Matrix SDK ESM Compatibility Solution

- The Matrix SDK (matrix-js-sdk) uses ES modules, causing compatibility issues with CommonJS in ts-node
- Implemented a dynamic import pattern with placeholder constants to ensure compatibility in all environments
- Initialization happens in onModuleInit using await import() instead of static imports
- This pattern works for ts-node, Jest tests, and production builds without modification