# Matrix Architecture for OpenMeet

This document provides a high-level overview of the Matrix chat integration in OpenMeet, including architecture, key components, and data flow.

## System Architecture

### Key Components

1. **Backend (NestJS)**
   - **Matrix Module**
     - `MatrixCoreService`: SDK loading, admin client, configuration
     - `MatrixUserService`: User provisioning, authentication, credential management
     - `MatrixRoomService`: Room creation, membership, permissions
     - `MatrixMessageService`: Message sending and retrieval
     - `MatrixGateway`: WebSocket-based real-time events
   - **Chat Module**
     - `ChatController`: API endpoints for chat functionality
     - `ChatRoomService`: Room management and membership
     - `DiscussionService`: Group and event discussion logic
     - `MatrixChatServiceAdapter`: Implementation of ChatService interface

2. **Matrix Server (Synapse)**
   - Synapse homeserver for message storage and delivery
   - User accounts provisioned via Admin API
   - Rooms created for events, groups, and direct messages

3. **Frontend (Vue/Quasar)**
   - WebSocket client for real-time updates
   - Unified message store for all chat contexts
   - Consistent UI components for messaging

### Module Interaction Diagram

```
┌─────────────────────────┐     ┌───────────────────────────────────┐
│                         │     │                                   │
│     Event Module        │     │           Chat Module             │
│                         │     │                                   │
│ ┌─────────────────────┐ │     │ ┌───────────────────┐            │
│ │EventListener        │─┼─────┼─►ChatRoomService    │            │
│ └─────────────────────┘ │     │ └───────────────────┘            │
│           │             │     │ ┌───────────────────┐            │
└───────────┼─────────────┘     │ │MatrixChatAdapter  │            │
            │                    │ └───────────────────┘            │
Events:      │                    │                                   │
chat.event.created   │                    │                                   │
chat.event.member.add│                    │                                   │
            │                    │                                   │
            └────────────────────┘                                   │
                                       │                                   │
                                       ▼                                   │
                          ┌────────────────────────┐                      │
                          │                        │                      │
                          │     Matrix Module      │◄─────────────────────┘
                          │                        │
                          │ ┌──────────────────┐   │
                          │ │MatrixServices    │   │
                          │ └──────────────────┘   │
                          │ ┌──────────────────┐   │
                          │ │MatrixGateway     │   │
                          │ └──────────────────┘   │
                          │                        │
                          └────────────────────────┘
```

## Data Flow

1. **User Authentication**
   - OpenMeet backend provisions Matrix users
   - Matrix credentials stored securely in OpenMeet database
   - Matrix operations performed server-side only

2. **Room Provisioning**
   - Events and groups automatically get Matrix rooms
   - Room IDs mapped to OpenMeet entities
   - Room permissions mirror OpenMeet roles

3. **Real-time Communication**
   - WebSocket connection established with tenant-aware authentication
   - Matrix events flow through WebSocket to frontend
   - Typing indicators and read receipts supported

4. **Message Flow**
   1. User sends message via OpenMeet UI
   2. Request sent to OpenMeet API
   3. API uses Matrix SDK to send to Matrix server
   4. Matrix server processes and stores message
   5. Matrix server sends event to OpenMeet via Matrix SDK
   6. OpenMeet backend broadcasts to connected clients via WebSocket
   7. Frontend receives and displays message in real-time

## User Experience Improvements

1. **Real-time Messaging**
   - Instant message delivery without page refreshes
   - Typing indicators and read receipts
   - Consistent notifications

2. **Simplified Messaging Model**
   - Chronological chat replaces threaded discussions
   - Familiar messaging experience across contexts
   - Better alignment with Matrix's native capabilities

3. **Enhanced Features**
   - Better media sharing and rendering
   - Improved mobile experience
   - Dark mode support

## Key Technical Achievements

1. **Secure Integration**
   - Server-side Matrix credential management
   - No client exposure of Matrix tokens
   - Tenant-aware authentication

2. **Enhanced Real-time Communications**
   - WebSocket-based event delivery
   - Typing indicators and read receipts
   - Efficient client connection management

3. **Efficient Resource Management**
   - Request-scoped caching
   - Optimized room joining strategies
   - Automatic cleanup of inactive clients

## Implementation Status

- ✅ Core infrastructure and services
- ✅ WebSocket real-time communication
- ✅ User provisioning and authentication
- ✅ Room creation and management
- ✅ Service architecture optimization
- ✅ Credential management improvements
- ✅ Admin token regeneration
- ✅ Robust room operation error handling
- 🚧 Comprehensive testing in progress