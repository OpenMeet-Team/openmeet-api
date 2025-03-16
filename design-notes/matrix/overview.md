# Matrix Integration for OpenMeet Chat

## Overview

OpenMeet has integrated Matrix as its chat infrastructure, replacing the previous Zulip-based system. This directory contains design documents explaining various aspects of the Matrix integration.

## Document Structure

- [**overview.md**](./overview.md) - This document
- [**user-experience.md**](./user-experience.md) - User-facing changes and improvements
- [**technical-implementation.md**](./technical-implementation.md) - Technical architecture and implementation details
- [**client-implementation.md**](./client-implementation.md) - Client-side implementation specifics
- [**phases.md**](./phases.md) - Implementation phases and progress
- [**fixes.md**](./fixes.md) - Important fixes and improvements

## Key Technical Achievements

1. **Matrix Server Integration**
   - Complete integration with Matrix homeserver
   - User provisioning and authentication
   - Room creation and management

2. **Enhanced Real-time Communications**
   - WebSocket-based event delivery
   - Typing indicators
   - Read receipts

3. **Unified Message Model**
   - Simplified chronological messaging
   - Consistent experience across group and event chats
   - Removal of Zulip-style threading

4. **Secure Credential Management**
   - Server-side Matrix credential storage
   - No client exposure of Matrix tokens
   - Tenant-aware authentication

5. **Advanced Room Management**
   - Automatic room creation for events and groups
   - Permission-based moderation
   - Event-based system for user membership changes

6. **Performance Optimizations**
   - Request-scoped caching
   - Smart room joining strategies
   - Efficient WebSocket communication
   - Automatic cleanup of inactive clients

## Architecture Summary

The Matrix integration follows a service-oriented architecture with clear separation of concerns. As of March 2025, we've consolidated the previously separate chat services into a unified Chat module:

- **Matrix Service** - Core Matrix API operations and API client management
- **Matrix Gateway** - WebSocket event handling and real-time communication
- **Chat Module** (Consolidated):
  - **ChatRoomService** - Room creation, membership, and permissions management
  - **DiscussionService** - Business logic for group and event discussions
  - **MatrixChatServiceAdapter** - Implementation of the ChatServiceInterface for Matrix
  - **ChatController** - API endpoints for all chat functionality

Events flow through the system in a unidirectional manner:

1. Backend events (e.g., user joins event) trigger room membership changes
2. Matrix events flow from Matrix server to Matrix Gateway
3. Gateway broadcasts events to connected clients
4. Frontend stores update with new message data
5. UI components render the messages

This consolidated architecture improves code organization, reduces duplication, and prepares us for a future where Matrix is the sole source of truth for chat data.

See [technical-implementation.md](./technical-implementation.md) for detailed architecture information and [phases.md](./phases.md) for the implementation timeline.