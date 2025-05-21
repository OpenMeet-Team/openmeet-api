# End-to-End Chat Message Flow in OpenMeet

This document describes the complete flow of chat messages in OpenMeet, from user input to display on receiving clients.

## 1. Message Sending (Frontend → Backend)

**Frontend Components:**
- `MessagesComponent.vue` handles user input and triggers message sending
- `unified-message-store.ts` processes message sending requests
- `matrixService.ts` manages WebSocket communication

**Message Sending Flow:**
1. User types a message in `MessagesComponent.vue`
2. Typing indicators are sent via WebSocket while user is composing
3. On submit, `messageStore.sendMessage()` is called
4. The message is optimistically added to the local store with pending status
5. `matrixService.ts` sends WebSocket event `message` with:
   - `roomId`: The Matrix room ID 
   - `message`: The text content
   - `tenantId`: Tenant context identifier

**WebSocket Message Structure:**
```javascript
socket.emit('message', {
  roomId: matrixRoomId,
  message: messageText,
  tenantId: currentTenant
});
```

## 2. Message Processing (Backend)

**Backend Components:**
- `MatrixGateway` receives WebSocket events in the `/matrix` namespace
- `MatrixMessageService` processes and sends messages to Matrix
- `ChatRoomService` handles room management
- `MatrixCoreService` manages connection to the Matrix server

**Processing Flow:**
1. `MatrixGateway.handleMessage()` receives the WebSocket event
2. User authentication is verified via JWT token
3. Matrix credentials are retrieved for the user
4. `MatrixMessageService.sendMessage()` sends the message to Matrix using:
   - User's Matrix ID
   - User's Matrix access token
   - Room ID
   - Message content
5. Matrix server processes the message and assigns an event ID
6. `MatrixGateway` sends a confirmation to the sender via `message-sent` event

**HTTP Fallback Path (if WebSocket unavailable):**
1. Frontend `chatApi.sendEventMessage()` sends an HTTP POST request to:
   - `/api/chat/event/:slug/message`
2. `ChatController.sendEventMessage()` processes the request
3. `DiscussionService.sendEventDiscussionMessage()` handles business logic
4. `ChatRoomService.sendMessage()` delivers the message to Matrix via Matrix SDK

## 3. Matrix Server Processing

**Matrix Server Actions:**
1. Validates the message and sender
2. Assigns a permanent event ID (starting with `$`)
3. Persists the message to the room history
4. Distributes the message to all servers in the homeserver federation
5. Delivers the message to all connected clients via their respective servers

## 4. Message Broadcasting (Backend → Frontend)

**Broadcasting Components:**
- Matrix notifies the OpenMeet server about new messages
- `MatrixCoreService` receives events from Matrix
- `BroadcastManager` handles deduplication of events
- `MatrixGateway` distributes events to connected clients

**Broadcasting Flow:**
1. Matrix sends event to the OpenMeet Matrix client
2. `MatrixGateway` processes the event
3. `BroadcastManager` checks for duplicate broadcasts to prevent repeats
4. `MatrixGateway.broadcastRoomEvent()` sends event to all connected clients in the room
5. Event is emitted to the room channel via `server.to(roomId).emit('matrix-event')`
6. Event metadata is added: `_broadcastId`, `_broadcastTime`

**WebSocket Event Structure:**
```javascript
{
  type: 'message', // or other event type
  roomId: 'roomId',
  sender: 'userId',
  content: { ... }, // Message content
  eventId: '$uniqueEventId',
  timestamp: 1234567890,
  _broadcastId: 'uniqueBroadcastId',
  _broadcastTime: 1234567890
}
```

## 5. Message Reception and Display (Frontend)

**Frontend Reception Components:**
- `matrixService.ts` listens for WebSocket events
- `unified-message-store.ts` processes and stores messages
- `MessagesComponent.vue` renders the messages UI

**Reception Flow:**
1. `matrixService.ts` receives `matrix-event` WebSocket event
2. Event is processed via `processMatrixEvent()`
3. For message events, `handleMessageEvent()` is called
4. Message is dispatched to `unified-message-store.ts`
5. Store deduplicates messages using multiple strategies:
   - Event ID matching
   - Temporary/permanent ID pairing
   - Broadcast ID tracking
   - Content + sender + timestamp proximity
6. If the message is new, it's added to the store
7. If the message was previously optimistically added, its status is updated
8. Vue reactivity system automatically updates the UI
9. `MessagesComponent.vue` shows the new message
10. Auto-scroll is triggered if the user was at the bottom of the chat

## 6. Optimizations and Special Cases

**Connection Handling:**
- WebSocket connection is maintained with reconnection logic
- If disconnection occurs, the system attempts reconnection with exponential backoff
- On reconnection, the client rejoins all previously joined rooms

**Deduplication:**
- Multiple layers of deduplication prevent duplicate messages:
  - Frontend store checks for existing message IDs
  - Backend `BroadcastManager` prevents duplicate broadcasts
  - Optimistic UI updates are reconciled with server confirmations

**Error Handling:**
- Failed message sending shows error indicators
- Network issues trigger reconnection attempts
- Invalid permissions are handled gracefully with user feedback

**Typing Indicators:**
- Sent when users are composing messages
- Cleared after inactivity or when message is sent
- Debounced to prevent excessive network traffic

## 7. Security and Authentication

- All WebSocket connections require valid JWT token
- Tenant ID is verified for multi-tenant contexts
- Users can only access rooms they have permission for
- Matrix credentials are provisioned securely

## Key Files

### Backend
- `/src/matrix/matrix.gateway.ts` - WebSocket server implementation
- `/src/matrix/services/matrix-message.service.ts` - Message handling service
- `/src/matrix/helpers/broadcast-manager.helper.ts` - Deduplication logic
- `/src/chat/services/discussion.service.ts` - Business logic for chat
- `/src/chat/chat.controller.ts` - REST API endpoints for chat

### Frontend
- `MessagesComponent.vue` - UI component for message display and input
- `matrixService.ts` - WebSocket connection management
- `unified-message-store.ts` - Message state management
- `MessageItem.vue` - Individual message rendering

This comprehensive end-to-end flow ensures reliable, real-time messaging with appropriate error handling, security, and optimizations.