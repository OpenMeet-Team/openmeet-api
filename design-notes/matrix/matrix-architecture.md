# Matrix Architecture for OpenMeet - Hybrid Client Architecture

This document outlines the hybrid Matrix chat integration architecture for OpenMeet, combining frontend Matrix clients with backend admin bot services.

## System Architecture Overview

### Hybrid Client + Admin Bot Model

The new architecture separates concerns between real-time messaging and administrative operations:

- **Frontend Matrix Clients**: Handle real-time messaging, sync, and user interactions
- **Backend Admin Bot**: Manages room creation, permissions, and server-side operations
- **Secure Credential API**: Provides Matrix credentials to authenticated frontend clients

## Key Components

### 1. **Frontend (Vue/Quasar + Matrix JS SDK)**
   - **Matrix JS SDK Integration**: Direct Matrix client in browser
   - **Real-time Sync**: Native Matrix sync for instant messaging
   - **Secure Credential Management**: Session-based Matrix token storage
   - **Connection Management**: Auto-reconnection and offline handling
   - **Chat UI Components**: Enhanced real-time features (typing, read receipts, presence)

### 2. **Backend Admin Bot (NestJS)**
   - **MatrixAdminService**: Bot-like service for administrative operations
   - **Room Lifecycle Management**: Creates/destroys rooms for events and groups
   - **Permission Synchronization**: Maps OpenMeet roles to Matrix power levels
   - **User Provisioning**: Creates Matrix accounts via admin API
   - **Credential API**: Secure endpoint to provide Matrix tokens to authenticated users

### 3. **Matrix Server (Synapse)**
   - **User Account Storage**: Matrix users provisioned via admin API
   - **Room Management**: Rooms created and managed by admin bot
   - **Real-time Messaging**: Direct client-to-server communication
   - **Federation Disabled**: Single-tenant Matrix deployment

## Architecture Diagrams

### Message Flow (New Hybrid Architecture)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend        │    │  Matrix Server  │
│  Matrix Client  │    │   Admin Bot      │    │   (Synapse)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │ 1. Get credentials    │                       │
         ├──────────────────────►│                       │
         │ 2. Matrix tokens      │                       │
         │◄──────────────────────┤                       │
         │                       │                       │
         │ 3. Connect & sync     │                       │
         ├───────────────────────┼──────────────────────►│
         │ 4. Direct messaging   │                       │
         │◄──────────────────────┼───────────────────────┤
         │                       │                       │
         │                       │ 5. Room creation      │
         │                       ├──────────────────────►│
         │                       │ 6. Permission sync    │
         │                       ├──────────────────────►│
```

### System Component Integration
```
┌─────────────────────────────────────────────────────────────┐
│                    OpenMeet Platform                         │
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────────┐ │
│  │  Chat UI        │         │     Event/Group UI          │ │
│  │                 │         │                             │ │
│  │ ┌─────────────┐ │         │ ┌─────────────────────────┐ │ │
│  │ │Matrix Client│ │         │ │  OpenMeet API Client    │ │ │
│  │ │(JS SDK)     │ │         │ │  (REST/GraphQL)         │ │ │
│  │ └─────────────┘ │         │ └─────────────────────────┘ │ │
│  └─────────────────┘         └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │ Matrix Protocol              │ HTTP/WebSocket
           │                              │
┌─────────────────────────────────────────────────────────────┐
│                    OpenMeet API                              │
│                                                             │
│  ┌─────────────────────────────┐   ┌─────────────────────┐   │
│  │     Matrix Admin Bot        │   │   OpenMeet Core     │   │
│  │                             │   │                     │   │
│  │ ┌─────────────────────────┐ │   │ ┌─────────────────┐ │   │
│  │ │  Room Management        │ │   │ │ Event Service   │ │   │
│  │ │  Permission Sync        │ │   │ │ Group Service   │ │   │
│  │ │  User Provisioning      │ │   │ │ User Service    │ │   │
│  │ │  Credential API         │ │   │ │ Auth Service    │ │   │
│  │ └─────────────────────────┘ │   │ └─────────────────┘ │   │
│  └─────────────────────────────┘   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │                              
           │ Matrix Admin API             
           │                              
┌─────────────────────────────────────────────────────────────┐
│                  Matrix Server (Synapse)                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Rooms     │  │   Users     │  │  Federation (Off)   │  │
│  │             │  │             │  │                     │  │
│  │ Event Rooms │  │ Matrix      │  │ Single Tenant Only  │  │
│  │ Group Rooms │  │ Accounts    │  │                     │  │
│  │ DM Rooms    │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. **User Authentication & Matrix Setup**
   1. User logs into OpenMeet (JWT token issued)
   2. User accesses chat feature for first time
   3. Frontend requests Matrix credentials from secure API
   4. Backend verifies JWT, checks/provisions Matrix account
   5. Backend returns Matrix credentials (user ID, access token, device ID)
   6. Frontend creates Matrix client and begins sync

### 2. **Room Access Pattern**
   1. User joins OpenMeet event/group
   2. Backend admin bot ensures Matrix room exists
   3. Backend admin bot adds user to Matrix room with appropriate permissions
   4. Frontend Matrix client automatically sees new room in sync
   5. User can immediately send/receive messages

### 3. **Real-time Messaging Flow**
   1. User types message in OpenMeet chat UI
   2. Frontend Matrix client sends message directly to Matrix server
   3. Matrix server processes and distributes message
   4. All participants' Matrix clients receive message instantly via sync
   5. Chat UI updates immediately with new message

### 4. **Permission Management**
   1. OpenMeet role/permission changes occur (e.g., user becomes event host)
   2. Backend admin bot receives notification via event system
   3. Admin bot updates Matrix room power levels to match OpenMeet permissions
   4. Changes take effect immediately for all Matrix clients

## Authentication Architecture

### OIDC-Based Single Sign-On

OpenMeet serves as an OIDC (OpenID Connect) identity provider for Matrix, enabling unified authentication across all Matrix clients while supporting existing social login providers.

#### Authentication Flow Design
```
Matrix Client → Matrix Server → OpenMeet OIDC → Social Auth (Google/Bluesky) → Matrix Access
```

#### Multi-Provider Integration
- **Google OAuth**: Users with Google accounts can access Matrix clients via OpenMeet OIDC
- **Bluesky Login**: Bluesky authentication flows through to Matrix access
- **Email/Password**: Traditional OpenMeet accounts work seamlessly
- **New User Creation**: Matrix client access can trigger OpenMeet account creation

#### OIDC Implementation
```yaml
# Matrix Server Configuration
oidc_providers:
  - idp_id: "openmeet"
    idp_name: "OpenMeet"
    issuer: "https://api.openmeet.net/oidc"
    client_id: "matrix_synapse"
    user_mapping_provider:
      config:
        localpart_template: "{{ user.matrix_handle }}"
        display_name_template: "{{ user.name }}"
        email_template: "{{ user.email }}"
```

#### Matrix Handle System

**User-Friendly Matrix IDs**: Users choose their own Matrix handles for clean, professional identities.

```
Matrix ID: @john.doe:matrix.openmeet.net  (Clean & Professional)
Not:       @user-slug_tenant123:matrix.openmeet.net  (Clunky & Technical)
```

**Global Uniqueness**: Matrix handles are unique across all tenants to avoid conflicts and enable cross-tenant communication.

**User Selection Process**:
1. Account creation: "Choose your Matrix username: john.doe"
2. Uniqueness validation: Real-time check against global database
3. Handle reservation: Permanently associated with user account
4. OIDC integration: Handle used for Matrix account creation

**Tenant Isolation Strategy**: 
- Matrix usernames are globally unique (no tenant prefixes)
- Tenant isolation enforced via room membership and permissions
- Admin bot ensures users only access rooms for their tenant
- Cross-tenant communication possible if explicitly enabled

#### User Experience Benefits
- **Clean Matrix IDs**: Professional handles like @john.doe:matrix.openmeet.net
- **Single Credentials**: One OpenMeet login works for web, mobile, and third-party Matrix clients
- **Social Login Everywhere**: Google/Bluesky authentication available in any Matrix client
- **Third-Party Client Support**: Element, FluffyChat, and other Matrix clients work natively
- **Cross-Device Sync**: Messages sync seamlessly between OpenMeet web and Matrix mobile apps
- **No Password Management**: Users never need separate Matrix passwords
- **Easy Sharing**: Clean Matrix IDs can be shared with external contacts

## Security Model

### OIDC Authentication Security
- **Identity Federation**: OpenMeet acts as trusted identity provider for Matrix
- **Token-Based Access**: No passwords stored in Matrix server
- **Social Login Integration**: Existing Google/Bluesky security applies to Matrix access
- **Tenant Isolation**: OIDC user mapping includes tenant context for isolation
- **Revocation Support**: OpenMeet can revoke Matrix access by invalidating OIDC tokens

### Frontend Client Security  
- **No Credential Storage**: Frontend Matrix clients authenticate via OIDC, not stored tokens
- **Session Management**: Matrix SDK handles secure token refresh and storage
- **Tenant Context**: OIDC claims ensure users only access their tenant's Matrix resources
- **Standard Permissions**: Frontend clients have normal Matrix user permissions (not admin)

### Backend Admin Operations
- **Privileged Access**: Admin bot has elevated Matrix server permissions
- **Secure Storage**: Admin credentials never exposed to frontend or OIDC flow
- **Audit Trail**: All admin operations logged for security monitoring
- **Tenant Boundaries**: Admin bot enforces tenant isolation in room management

### Third-Party Client Security
- **Standard OIDC Flow**: Third-party Matrix clients use industry-standard OIDC authentication
- **No OpenMeet API Access**: External clients only get Matrix access, not OpenMeet API permissions
- **Tenant Scoped**: OIDC user mapping prevents cross-tenant access
- **Centralized Revocation**: OpenMeet admin can disable Matrix access without affecting OpenMeet login

## Implementation Benefits

### User Experience Improvements
- **Instant Messaging**: Sub-100ms message delivery (like WhatsApp/Slack)
- **Real-time Features**: Native typing indicators, read receipts, presence
- **Reliable Sync**: Matrix SDK handles connection management and offline queuing
- **Cross-device Sync**: Messages sync automatically between browser tabs and devices
- **Mobile Ready**: Same architecture works for future mobile apps

### Technical Advantages
- **Reduced Server Load**: Frontend handles real-time sync, not backend
- **Better Scalability**: Matrix server designed for massive concurrent connections
- **Simplified Architecture**: No WebSocket proxy layer needed
- **Connection Efficiency**: One Matrix connection per browser session instead of per operation
- **Offline Support**: Matrix SDK provides built-in offline message queuing

### Development Benefits
- **Separation of Concerns**: Messaging vs admin operations clearly separated
- **Easier Testing**: Frontend and backend Matrix code can be tested independently
- **Framework Alignment**: Leverages Matrix SDK's intended usage patterns
- **Mobile Path**: Same patterns extend naturally to mobile Matrix SDKs

## Migration Strategy

### Phase 1: Parallel Implementation
- Implement Matrix credential API alongside existing WebSocket system
- Add Matrix JS SDK to frontend with feature flag
- Create admin bot service while maintaining existing Matrix services
- Test hybrid architecture with subset of users

### Phase 2: Feature Enhancement  
- Implement enhanced real-time features (typing, presence, read receipts)
- Add offline message support and better connection management
- Optimize UI for instant message delivery
- Implement cross-device message sync

### Phase 3: Full Migration
- Switch all chat functionality to hybrid architecture
- Remove WebSocket message proxy system
- Deprecate server-side Matrix client management for messaging
- Cleanup legacy Matrix services and gateway code

### Phase 4: Mobile Preparation
- Extract Matrix credential and room management patterns
- Document frontend Matrix client integration patterns
- Prepare Matrix SDK integration guides for mobile development
- Test multi-device sync scenarios

## API Design

### OIDC Authentication Endpoints
```typescript
// OIDC Authorization Endpoint
GET /oidc/auth?client_id=matrix_synapse&redirect_uri=...&scope=openid+profile+email+tenant&state=...
→ Redirects to OpenMeet login (supports Google/Bluesky/email)
→ After successful login, redirects back with authorization code

// OIDC Token Exchange
POST /oidc/token
Content-Type: application/x-www-form-urlencoded
{
  grant_type: "authorization_code",
  code: "auth_code_here",
  client_id: "matrix_synapse",
  client_secret: "client_secret",
  redirect_uri: "matrix_redirect_uri"
}

Response:
{
  "access_token": "oidc_access_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "jwt_id_token",
  "scope": "openid profile email tenant"
}

// OIDC User Information
GET /oidc/userinfo
Authorization: Bearer <oidc_access_token>

Response:
{
  "sub": "john.doe",
  "name": "John Doe",
  "email": "john@example.com", 
  "matrix_handle": "john.doe",
  "tenant_id": "tenant123",
  "tenant_domain": "acme.openmeet.net"
}
```

### Matrix Client Access Flow
```typescript
// User Experience in any Matrix client:
1. Server: "matrix.openmeet.net"
2. Click "Login with OpenMeet" 
3. Redirects to OpenMeet → User logs in (Google/Bluesky/email)
4. Returns to Matrix client with full access to OpenMeet rooms

// Resulting Matrix User ID: @john.doe:matrix.openmeet.net
```

### Admin Bot Operations
```typescript
// Room creation (internal API)
POST /internal/matrix/rooms
{
  "entityType": "event" | "group",
  "entitySlug": "event-slug-here",
  "creatorSlug": "user-slug", 
  "tenantId": "tenant-id"
}

// Permission sync (internal API)  
POST /internal/matrix/permissions
{
  "roomId": "!room:matrix.domain.com",
  "userSlug": "user-slug",
  "powerLevel": 0 | 50 | 100,
  "tenantId": "tenant-id"
}
```

## Implementation Status

### ✅ Completed (Previous Architecture)
- Core Matrix server infrastructure
- User provisioning via admin API
- Room creation and management
- Basic message sending and retrieval
- Connection leak fixes

### ✅ Completed (Frontend Matrix Integration)
- ✅ OIDC identity provider implementation in OpenMeet API
- ✅ Matrix server OIDC configuration for OpenMeet integration
- ✅ Frontend Matrix JS SDK integration with OIDC authentication
- ✅ Manual authentication flow with rate limiting protection
- ✅ Session persistence across page reloads
- ✅ Component integration in EventPage.vue
- ✅ Removal of deprecated WebSocket proxy system
- ✅ Room creation and joining with permission integration

### 🔧 Current Implementation Tasks
- **Icon Display Fix**: Resolve missing send/fullscreen icons in MatrixChatInterface
- **Message History**: Implement room timeline loading for historical messages
- **Real-time Sync**: Fix incoming message event handling for multi-client sync
- **Enhanced Features**: Add typing indicators, read receipts, presence status
- **Mobile Optimization**: Optimize touch interface and responsive design

### 📋 Future Enhancements
- Cross-device sync testing and optimization
- Element/FluffyChat compatibility testing and user guides
- Performance monitoring and Matrix server scaling
- File upload and media sharing capabilities
- End-to-end encryption support

#### User Moderation System
- **Individual User Actions**:
  - Kick users from rooms (temporary removal)
  - Ban users from rooms (permanent removal with re-invite prevention)
  - Mute users (prevent message sending while maintaining room access)
  - Timeout users (temporary mute with automatic restoration)
- **Bulk Message Management**:
  - Mass message deletion/redaction by user or time range
  - Bulk export of messages for moderation review
  - Message search and filtering for policy violations
  - Automated moderation triggers based on content patterns
- **Administrative Controls**:
  - Power level management (promote/demote moderators)
  - Room permission matrix updates (who can invite, send files, etc.)
  - Moderation action audit logs with admin oversight
  - Cross-room moderation policies for repeat offenders
- **Integration Points**:
  - OpenMeet role-based permissions mapping to Matrix power levels
  - Tenant-wide moderation policies and user reputation tracking
  - Notification system for moderation actions and appeals
  - API endpoints for programmatic moderation and analytics

## Performance Characteristics

### ✅ Achieved Improvements
- **Architecture Simplification**: Eliminated WebSocket proxy layer entirely
- **Authentication Integration**: Seamless OIDC flow with OpenMeet permissions
- **Component Separation**: Clear separation between Matrix chat and OpenMeet logic
- **Session Management**: Persistent authentication across page reloads
- **Error Recovery**: Robust error handling with user-friendly feedback

### 🎯 Targeted Performance Gains (Post UI Fixes)
- **Message Latency**: 500ms → 50-100ms (5-10x faster)
- **Server Resource Usage**: 70% reduction in backend Matrix connections
- **Real-time Features**: Native Matrix features vs limited WebSocket proxy
- **Offline Reliability**: Matrix SDK queuing vs custom implementation
- **Scalability**: Matrix server optimized for concurrent persistent connections

### Monitoring Metrics
- Matrix server connection count and resource usage
- Frontend Matrix client connection success rates
- Message delivery latency and reliability
- Credential API response times and error rates
- Cross-device sync performance and accuracy

---

## Architectural Decision Records

### ADR-001: Frontend Matrix Client Architecture
**Decision**: Implement Matrix JS SDK directly in frontend for real-time messaging
**Rationale**: Eliminates WebSocket proxy complexity, provides native Matrix features, improves performance
**Alternatives Considered**: Continue server-side proxy, implement custom WebSocket bridge
**Status**: Approved - Implementation in progress

### ADR-002: Hybrid Admin Bot Model  
**Decision**: Maintain backend admin bot for room and permission management
**Rationale**: Preserves security boundaries, centralizes tenant logic, maintains audit trail
**Alternatives Considered**: Full frontend Matrix administration, purely server-side architecture
**Status**: Approved - Implementation in progress

### ADR-003: OIDC Authentication Integration
**Decision**: Implement OpenMeet as OIDC identity provider for Matrix authentication
**Rationale**: Eliminates dual credential management, enables third-party Matrix client access, maintains social login compatibility
**Alternatives Considered**: 
- Separate Matrix credentials with secure API exposure
- Application Service authentication bridge
- Hybrid password + token system for external clients
**Benefits**:
- Single sign-on across all Matrix clients (web, mobile, third-party)
- Social login (Google/Bluesky) works in any Matrix client
- No Matrix password management required
- Industry-standard OIDC security
- Third-party client support (Element, FluffyChat, etc.)
**Status**: Approved - Implementation in progress

### ADR-004: User-Chosen Matrix Handles
**Decision**: Allow users to choose their own Matrix handles globally unique across all tenants
**Rationale**: Provides clean, professional Matrix IDs that users can easily share and remember
**Alternatives Considered**:
- Tenant-prefixed usernames: `@user-slug_tenant123:matrix.openmeet.net` (clunky)
- Email-based handles: `@john.doe.acme:matrix.openmeet.net` (exposes company info)
- Tenant-specific domains: `@john.doe:acme.matrix.openmeet.net` (complex infrastructure)
**Implementation**:
- Global uniqueness enforced via database constraints
- User selection during account creation with real-time validation
- Tenant isolation via room membership rather than username prefixes
- Clean Matrix IDs: `@john.doe:matrix.openmeet.net`
**Benefits**:
- Professional, shareable Matrix identities
- No exposure of internal tenant structure
- Cross-tenant communication capability if needed
- Better user experience in third-party Matrix clients
**Status**: Approved - Implementation in progress

### ADR-005: Silent OIDC Authentication for Frontend Matrix Client
**Decision**: Implement transparent OIDC authentication for Matrix JS SDK integration in the frontend
**Rationale**: Provides seamless user experience while enabling full Matrix client features with secure authentication
**Alternatives Considered**:
- **Direct credential exposure**: Frontend receives Matrix access tokens via API
  - Rejected: Security risk of exposing long-lived tokens in browser
- **Separate Matrix login flow**: Users click "Connect to Matrix" button for explicit OIDC flow
  - Rejected: Creates friction and confusion for users
- **Short-lived token API**: Backend issues temporary Matrix tokens with refresh logic
  - Rejected: Complex implementation and still exposes tokens to frontend
- **Enhanced WebSocket proxy**: Add Matrix features to current server-side approach
  - Rejected: Not a "real" Matrix client, limits future third-party client support
**Implementation**:
- Silent OIDC authentication in iframe/popup when user navigates to chat
- Matrix JS SDK initialization with OIDC-obtained credentials
- No fallback mechanism - if OIDC/Matrix client fails, chat is unavailable
- Matrix client session shared across browser tabs
**Benefits**:
- **Transparent UX**: No additional login steps for users
- **Real Matrix client**: Full SDK features (file upload, redaction, cross-device sync)
- **Secure authentication**: No stored credentials, industry-standard OIDC
- **Third-party client support**: Users can optionally use Element, FluffyChat, etc.
- **Simplified architecture**: Single authentication path, no complex fallback logic
**User Experience Flow**:
1. User logs into OpenMeet → JWT session established
2. User navigates to any chat → Silent OIDC authentication happens automatically
3. Matrix client initializes with full features transparently
4. Chat works with enhanced Matrix capabilities or fails gracefully
**Credential Management**: Matrix credentials obtained via OIDC are ephemeral session-only (not stored in OpenMeet database)
**Status**: Approved - Implementation in progress

### ADR-006: Abandon Message Store Abstraction for Direct Matrix SDK Usage
**Decision**: Use Matrix JS SDK directly in components instead of maintaining abstraction layer compatibility
**Rationale**: Simplifies architecture and eliminates unnecessary complexity since we've committed to Matrix
**Previous Approach**:
- Frontend → Custom WebSocket → Backend Matrix proxy → unified-message-store abstraction → Matrix server
- Complex message routing and store synchronization
- Multiple layers of event handling and potential duplication
**New Approach**:
- Frontend Matrix JS SDK → Matrix server (direct connection)
- Components use Matrix SDK methods directly: `room.timeline`, `room.on('Room.timeline')`, etc.
- Native Matrix message storage, sync, and offline support
- Custom events for UI components that need message notifications
**Benefits**:
- **Simplified Architecture**: Eliminates multiple abstraction layers
- **Better Performance**: Direct Matrix connection (50-100ms vs 500ms)
- **Native Features**: Full Matrix SDK capabilities (file uploads, encryption, etc.)
- **Easier Maintenance**: Single source of truth (Matrix SDK)
- **Future-Proof**: Standard Matrix patterns work with any Matrix client
**Implementation**:
- Matrix client service emits custom DOM events: `matrix:message`, `matrix:typing`
- Components listen to these events for UI updates while using Matrix SDK for data
- Gradual migration from unified-message-store to direct Matrix SDK usage
**Status**: Approved - Implementation in progress

## Current Implementation Issues

### Frontend Matrix Client OIDC Authentication Challenges

**Problem**: Implementing silent OIDC authentication for Matrix JS SDK integration has encountered cross-origin session inheritance issues that prevent seamless authentication.

#### Issue Analysis

**Root Cause**: Cross-origin cookie restrictions prevent iframe/popup-based OIDC authentication from inheriting the user's existing OpenMeet session.

**Current Symptoms**:
- OIDC authentication iframe/popup prompts user for email despite already being logged into OpenMeet
- Session cookies are partitioned due to cross-origin context in iframe
- Matrix server redirects to different domain (localdev.openmeet.net) than frontend (localhost:9005)

#### Technical Details

**Local Development Setup**:
- Frontend: `localhost:9005` (Quasar dev server)
- API: `localhost:3000` (NestJS backend)  
- Matrix: `localhost:8448` (Synapse server in Docker)
- OIDC Provider: OpenMeet API serving OIDC endpoints

**Cross-Origin Flow**:
```
Matrix Client (localhost:9005) 
  → Matrix Server (localhost:8448)
  → OIDC Redirect (localdev.openmeet.net or localhost:3000)
  → Session cookies not inherited due to different origin
  → User prompted for credentials despite existing session
```

#### Attempted Solutions

**1. Enhanced OIDC Parameters** ❌
- Added `prompt=none` and `login_hint` parameters
- Still prompted for email due to partitioned cookies

**2. Iframe-based Authentication** ❌ 
- Implemented hidden iframe for transparent auth
- Failed due to Content Security Policy restrictions and cookie partitioning

**3. Same-Origin Proxy Approach** ❌
- Added Quasar dev server proxy to serve API from same origin
- Local development only solution, doesn't work in K8s production environment
- Complex dual proxy configuration required for mixed endpoint structure

**4. Matrix Server Configuration Updates** ❌
- Updated Matrix OIDC endpoints to use same origin
- Docker networking issues prevent Matrix server from reaching dev server

#### Architecture Constraints

**Local Development vs Production Mismatch**:
- Local: Separate services on different ports/origins
- Production: Services need same-origin for cookie inheritance
- K8s: Requires ingress/ALB path-based routing for same-origin setup

**Mobile Considerations**:
- Popup-based authentication has poor UX on mobile devices
- iOS Safari and Android Chrome block or mishandle popup windows
- Full-page redirect would be more reliable but disrupts frontend application flow

#### Potential Solutions

**1. Ingress/ALB Path-Based Routing** (Recommended)
- Deploy frontend and API under same domain with path separation
- Production: `openmeet.net/` → frontend, `openmeet.net/api/` → backend
- Development: `localdev.openmeet.net/` → frontend, `localdev.openmeet.net/api/` → backend
- Eliminates cross-origin issues entirely

**2. PostMessage-Based Authentication**
- Use iframe with postMessage communication instead of URL monitoring
- Avoids cross-origin URL access restrictions
- Still subject to cookie partitioning issues

**3. Full-Page Redirect Flow**
- Replace popup/iframe with full-page redirect for OIDC
- Better mobile compatibility
- Disrupts single-page application flow

**4. Backend-Assisted Token Exchange**
- Backend endpoint exchanges OpenMeet session for Matrix credentials
- Requires storing Matrix tokens server-side (conflicts with OIDC-only approach)
- Adds complexity but avoids browser security restrictions

#### Current Status

**Immediate Blocker**: Cross-origin session inheritance prevents silent OIDC authentication from working as designed.

**Next Steps**:
1. Implement ingress/ALB same-origin deployment for development and production
2. Test iframe-based authentication with same-origin setup
3. Implement full-page redirect fallback for mobile compatibility
4. Document deployment requirements for proper Matrix client integration

**✅ Resolution**: Implemented manual authentication flow with rate limiting protection, avoiding the complexity of silent authentication while maintaining full Matrix client functionality.

#### Current Architecture Status

**✅ Completed Features**:
- Direct Matrix JS SDK integration replacing WebSocket proxy
- OIDC authentication with manual connect/reconnect buttons
- Persistent session management preventing re-authentication on reload
- Rate limiting detection with user-friendly countdown timers
- Component separation with EventMatrixChatComponent handling Matrix logic
- Full removal of deprecated WebSocket-based chat system

**🔧 Remaining Implementation Tasks**:
1. **UI Icon Issues**: Missing "send" and "fullscreen" icons in chat interface
2. **Message History Loading**: Historical messages not displaying when joining rooms
3. **Real-time Message Sync**: Messages from other clients/sessions not appearing
4. **Enhanced Matrix Features**: Typing indicators, read receipts, presence status