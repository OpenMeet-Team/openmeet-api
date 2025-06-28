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

### ADR-004: User-Chosen Matrix Handles - Multi-Phase Implementation
**Decision**: Allow users to choose their own Matrix handles globally unique across all tenants
**Rationale**: Provides clean, professional Matrix IDs that users can easily share and remember

**Alternatives Considered**:
1. **Tenant-prefixed usernames**: `@user-slug_tenant123:matrix.openmeet.net` (clunky)
2. **Email-based handles**: `@john.doe.acme:matrix.openmeet.net` (exposes company info)  
3. **Virtual domains per tenant**: `@john.doe:tenant-abc.matrix.openmeet.net` (complex infrastructure)
4. **Matrix application services**: `@_tenant_abc_john.doe:matrix.openmeet.net` (protocol-level support)
5. **Separate Matrix servers**: Complete tenant isolation (high infrastructure cost)

**Phased Implementation Strategy**:

#### **Phase 1: Global Handle Registry (Current - Option 4)**
**Implementation**:
- Global uniqueness enforced via `matrixHandleRegistry` table
- User selection during account creation with real-time validation  
- Tenant isolation via room membership rather than username prefixes
- Clean Matrix IDs: `@john.doe:matrix.openmeet.net`
- Migration service to move from tenant-suffixed IDs to clean handles

**Current Architecture**:
```sql
-- Global registry tracks handle ownership across tenants
CREATE TABLE matrixHandleRegistry (
  id SERIAL PRIMARY KEY,
  handle VARCHAR(255) UNIQUE NOT NULL,
  tenantId VARCHAR(255) NOT NULL,
  userId INTEGER NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

**OIDC Integration**:
```typescript
// Maps clean handles to Matrix authentication
preferred_username: extractedMatrixHandle, // e.g., "john.doe"
matrix_handle: extractedMatrixHandle,
tenant_id: tenantId // For room access control
```

**Benefits**:
- ✅ **Immediate clean handles** for users
- ✅ **Works with existing infrastructure** (Docker, K8s)
- ✅ **Simple local development** setup
- ✅ **No DNS complexity** required
- ✅ **Investment protection** of current OIDC work

**Trade-offs**:
- ❌ **Global handle conflicts** require resolution
- ❌ **Complex migration logic** from old tenant-suffixed accounts
- ❌ **Cross-tenant collision management** needed
- ❌ **Additional database layer** for handle mapping

#### **Phase 2: Virtual Domains (Future - Option 1)**
**Future Implementation** (when infrastructure matures):
```
Tenant A: @john.doe:tenant-abc.matrix.openmeet.net
Tenant B: @john.doe:tenant-xyz.matrix.openmeet.net
```

**Infrastructure Requirements**:
- DNS: `*.matrix.openmeet.net` → Matrix server
- Matrix virtual host configuration per tenant
- OIDC issuer per tenant domain
- Load balancer path-based routing

**Migration Path Phase 1 → Phase 2**:
1. **Add tenant domain fields** to user records
2. **Implement domain-aware OIDC** mapping
3. **Create virtual domain infrastructure** 
4. **Migrate users gradually** to tenant domains
5. **Deprecate global registry** when complete

**Benefits of Virtual Domains**:
- ✅ **Natural tenant isolation** - no registry needed
- ✅ **Zero handle conflicts** - each tenant has own namespace  
- ✅ **Standard Matrix behavior** - works with any client
- ✅ **Better tenant privacy** - domains don't expose other tenants
- ✅ **Simplified architecture** - eliminates global handle logic

**Current Decision**: **Continue with Phase 1 (Global Registry), Plan for Phase 2 (Virtual Domains)**
- **Short term**: Fix migration bugs and ship clean handles via global registry
- **Medium term**: Optimize global registry performance and UX
- **Long term**: Evaluate virtual domains when infrastructure team is ready

**Status**: Phase 1 approved and in progress - Phase 2 planned for future evaluation

### ADR-005: User-Selectable OpenMeet Slugs + Matrix Handle Synchronization
**Decision**: Plan migration from auto-generated OpenMeet slugs to user-selectable slugs with optional Matrix handle sync

**Current State Analysis**:
- **OpenMeet Slugs**: Auto-generated (e.g., `david-jones-null-knhtj6`) - used in URLs, user mentions, unique identification
- **Matrix Handles**: User-selectable via global registry (e.g., `david.jones`) - for Matrix chat identity
- **No Synchronization**: OpenMeet slugs and Matrix handles are independent

**User-Selectable Slugs Implementation Plan**:

#### **Phase 1: Just-in-Time Matrix User Creation**
**Current Implementation**: Matrix users created only when needed for chat functionality
```typescript
// Flow: User joins event with chat → Handle selection UI → Matrix account creation
1. User registers OpenMeet account (auto-generated slug: "david-jones-null-knhtj6")
2. User joins event with chat features
3. Matrix handle selection UI: "Choose your Matrix handle: @______:matrix.openmeet.net"
4. Global uniqueness validation via matrixHandleRegistry
5. Matrix user created with chosen handle (e.g., "@david.jones:matrix.openmeet.net")
```

**Benefits**:
- ✅ **Lower friction** - No Matrix concerns during OpenMeet registration
- ✅ **Resource efficiency** - Matrix users only for chat participants
- ✅ **Better UX** - Handle selection when contextually relevant
- ✅ **Flexibility** - Users see real-time availability during selection

#### **Phase 2: User-Selectable OpenMeet Slugs** 
**Future Enhancement**: Allow users to choose their OpenMeet slug during registration
```typescript
// Enhanced registration flow
1. User registration form includes optional "Choose your username: @______"
2. Real-time validation against existing OpenMeet slugs
3. Fallback to auto-generation if no choice made
4. OpenMeet URLs use clean slugs: "/users/david.jones" vs "/users/david-jones-null-knhtj6"
```

**Registry Requirements Analysis**:

**Option A: No OpenMeet Slug Registry (Recommended)**
```sql
-- Use existing unique constraint on users.slug 
ALTER TABLE users ADD CONSTRAINT unique_slug_per_tenant UNIQUE(slug, tenantId);
```
**Rationale**: 
- ✅ **Simpler architecture** - reuse existing database constraints
- ✅ **Tenant isolation built-in** - slugs only unique within tenant
- ✅ **Standard SQL performance** - indexed unique constraints
- ✅ **No additional complexity** - no registry service needed

**Option B: Separate OpenMeet Slug Registry**
```sql
-- Mirror Matrix handle registry pattern
CREATE TABLE openMeetSlugRegistry (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) UNIQUE NOT NULL,
  tenantId VARCHAR(255) NOT NULL,
  userId INTEGER NOT NULL
);
```
**Trade-offs**:
- ❌ **Added complexity** - duplicate tracking system
- ❌ **Sync requirements** - keep registry + users table aligned
- ⚠️ **Only needed for cross-tenant slug uniqueness** (questionable benefit)

**Recommendation**: **Option A** - Use database constraints, not registry for OpenMeet slugs

#### **Phase 3: OpenMeet Slug + Matrix Handle Sync Strategy**

**Sync Options**:

**Option 3A: Optional Sync (Recommended)**
```typescript
// User choice during Matrix handle selection
if (matrixHandle === openMeetSlug) {
  // User chose same handle for both systems
  displayMessage: "Your Matrix handle matches your OpenMeet username!"
} else {
  // Different handles - show both clearly in UI
  displayMessage: "OpenMeet: @david-jones | Matrix: @david.jones"
}
```

**Option 3B: Automatic Sync**
```typescript
// Force Matrix handle to match OpenMeet slug
const matrixHandle = user.slug; // No user choice
await registerMatrixHandle(matrixHandle, tenantId, userId);
```

**Option 3C: Independent Systems**
```typescript
// Completely separate - no sync expectations
// Users understand they have different identities in each system
```

**Recommendation**: **Option 3A (Optional Sync)** 
- **Flexibility**: Users can choose same handle for consistency or different handles for privacy
- **Clear UX**: Show both identities clearly when they differ
- **Future-proof**: Allows for user preference changes

#### **Implementation Timeline**:
1. **Current**: Just-in-Time Matrix creation (✅ in progress)
2. **Q2 2025**: User-selectable OpenMeet slugs during registration
3. **Q3 2025**: Optional sync UI during Matrix handle selection
4. **Future**: Advanced handle management (bulk changes, history, aliases)

#### **Migration Considerations**:
- **Existing Users**: Keep current auto-generated slugs, offer one-time change opportunity
- **URL Stability**: Support both old and new slug formats during transition
- **API Compatibility**: Maintain slug-based API endpoints with proper redirects

**Status**: Planning phase - awaiting Phase 1 Matrix handle registry completion

### ADR-006: Matrix Handle Migration for Existing Users
**Decision**: Provide optional, user-driven migration from tenant-suffixed Matrix IDs to clean handles

**Problem**: Existing Matrix users have tenant-suffixed handles (e.g., `@user-slug_tenant:matrix.openmeet.net`) but new users will get clean handles (e.g., `@user.chosen:matrix.openmeet.net`)

**Matrix Technical Constraints**:
- Matrix usernames are **immutable** after account creation
- No built-in username change capability in Matrix specification
- All data (messages, rooms, devices) tied to original User ID
- Federation protocols assume stable User IDs

**Migration Options Analysis**:

#### **Option 1: Account Recreation (SELECTED)**
```typescript
// User-initiated migration process
1. User requests clean handle in profile settings
2. Clear warning about data loss implications  
3. Create new Matrix account with chosen clean handle
4. Update matrixHandleRegistry mapping
5. Delete old Matrix account
6. User must re-join rooms and loses history
```

**Trade-offs**:
- ✅ **Clean handles available** for existing users
- ✅ **User choice** and informed consent
- ✅ **Registry consistency** maintained
- ❌ **Message history lost** (Matrix limitation)
- ❌ **Device verification reset** (Matrix limitation)
- ❌ **Must re-join rooms** (Matrix limitation)

#### **Option 2: Grandfathered Coexistence (Considered)**
Keep existing tenant-suffixed IDs indefinitely while new users get clean handles.
**Rejected**: Creates permanent inconsistent user experience and technical debt.

#### **Option 3: Forced Migration (Rejected)**
Automatically migrate all existing users to clean handles.
**Rejected**: Data loss without user consent is unacceptable.

**Implementation Plan**:

#### **Phase 1: New Users Get Clean Handles (Current)**
```typescript
// Just-in-Time Matrix creation
async function provisionMatrixUser(user, tenantId, userId) {
  if (!hasExistingMatrixAccount(userId)) {
    // New users: clean handle selection UI
    const chosenHandle = await showHandleSelectionUI(user);
    return await createMatrixUserWithHandle(chosenHandle);
  } else {
    // Existing users: continue using current Matrix credentials
    return await getExistingMatrixCredentials(userId);
  }
}
```

#### **Phase 2: Migration UI for Existing Users (Q2 2025)**
```typescript
// User profile settings component
<MatrixHandleMigrationCard>
  <CurrentHandle>
    @david-jones-null-knhtj6_lsdfaopkljdfs:matrix.openmeet.net
  </CurrentHandle>
  
  <ProposedHandle>
    @david.jones:matrix.openmeet.net
  </ProposedHandle>
  
  <MigrationWarning>
    ⚠️ Important: Migrating to a clean handle will:
    • Permanently delete your Matrix chat history
    • Remove you from all current chat rooms (you can re-join)
    • Reset device verification and encryption keys
    • Cannot be undone
    
    ✅ Benefits:
    • Clean, professional Matrix handle
    • Better compatibility with Matrix clients
    • Easier to share and remember
  </MigrationWarning>
  
  <HandleSelection>
    <Input placeholder="Choose your new handle" onChange={validateHandle} />
    <ValidationMessage>{handleValidation}</ValidationMessage>
  </HandleSelection>
  
  <Actions>
    <Button onClick={confirmMigration} disabled={!isValidHandle}>
      I understand - Migrate to Clean Handle
    </Button>
    <Button onClick={dismissMigration}>
      Keep Current Handle
    </Button>
  </Actions>
</MatrixHandleMigrationCard>
```

#### **Phase 3: User-Driven Migration Service (Q3 2025)**
```typescript
// Backend migration service - ONLY triggered by explicit user request
async function migrateUserMatrixHandle(
  userId: number, 
  tenantId: string, 
  newHandle: string,
  userConfirmation: boolean // Explicit user consent required
) {
  if (!userConfirmation) {
    throw new Error('User confirmation required for Matrix handle migration');
  }

  // 1. Validate new handle availability
  const isAvailable = await globalMatrixValidationService.isMatrixHandleUnique(newHandle);
  if (!isAvailable) {
    throw new Error(`Handle ${newHandle} is already taken`);
  }

  // 2. Create new Matrix account with clean handle
  const newMatrixUser = await matrixUserService.createUser({
    username: newHandle,
    password: MatrixUserService.generateMatrixPassword(),
    displayName: MatrixUserService.generateDisplayName(user)
  });

  // 3. Update handle registry (atomic operation)
  await globalMatrixValidationService.registerMatrixHandle(newHandle, tenantId, userId);

  // 4. Delete old Matrix account
  const oldMatrixUserId = await getOldMatrixUserId(userId, tenantId);
  await matrixUserService.deleteUser(oldMatrixUserId);

  // 5. Clear cached Matrix credentials
  await clearStoredMatrixCredentials(userId);

  return {
    newMatrixUserId: newMatrixUser.userId,
    migrationComplete: true,
    userMustRejoinRooms: true
  };
}
```

**Migration Safety Measures**:
1. **Multiple Confirmation Steps**: User must confirm understanding of data loss
2. **Handle Validation**: Real-time check for availability before migration
3. **Atomic Operations**: Registry updates and account creation in transaction
4. **Clear Communication**: Explicit warnings about limitations and data loss
5. **User-Initiated Only**: No automated or scheduled migrations
6. **Rollback Plan**: Unable to rollback due to Matrix limitations (communicated clearly)

**User Communication Strategy**:
- **Optional Migration**: Clearly communicate that migration is entirely optional
- **Data Loss Warning**: Prominent, clear warnings about chat history loss
- **Benefits Education**: Explain advantages of clean handles for user adoption
- **Support Documentation**: Step-by-step migration guide with screenshots
- **Success Metrics**: Track migration adoption and user satisfaction

**Migration Timeline**:
1. **Q1 2025**: New users get clean handles automatically (✅ current)
2. **Q2 2025**: Add migration UI to user profile settings
3. **Q3 2025**: Launch user-driven migration service with safety measures
4. **Q4 2025**: Evaluate migration adoption and user feedback
5. **2026**: Consider deprecation timeline for tenant-suffixed handles (if high adoption)

**Success Criteria**:
- Migration process completes successfully without data corruption
- Users clearly understand data loss implications before migrating
- Migration adoption rate indicates user value perception
- No user complaints about unexpected data loss
- Clean handle users report improved Matrix client experience

**Rollback Strategy**:
Due to Matrix technical limitations, there is **no rollback capability** once migration is complete. This must be clearly communicated to users as an irreversible decision.

**Status**: Planned for implementation after Phase 1 Matrix handle registry completion

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

---

## Detailed Authentication Flow Documentation

### Overview: Platform → API → Matrix Authentication Chain

OpenMeet implements a multi-step authentication flow that enables users to seamlessly access Matrix chat through OIDC (OpenID Connect) integration. This section documents the detailed conversation between Platform, API, and Matrix during initial login and subsequent Matrix chat authentication.

### Authentication Flow 1: Initial Platform Login

**Scenario**: User logs into OpenMeet platform for the first time using social authentication (Google, Bluesky, etc.)

#### Step-by-Step Platform Authentication Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant P as Platform Frontend
    participant A as OpenMeet API
    participant G as Google OAuth
    participant DB as Database

    U->>P: 1. Navigate to OpenMeet login page
    P->>U: 2. Display login options (Google, Bluesky, Email)
    U->>P: 3. Click "Login with Google"
    P->>G: 4. Redirect to Google OAuth
    Note over P,G: https://accounts.google.com/oauth/authorize?...
    
    U->>G: 5. Authenticate with Google
    G->>P: 6. Redirect with authorization code
    Note over G,P: https://platform.openmeet.net/auth/google/callback?code=...
    
    P->>A: 7. POST /api/auth/google/callback
    Note over P,A: { authorizationCode: "...", state: "..." }
    
    A->>G: 8. Exchange code for Google access token
    Note over A,G: POST https://oauth2.googleapis.com/token
    
    G->>A: 9. Return Google access token + user profile
    Note over G,A: { access_token: "...", user: { email: "...", name: "..." } }
    
    A->>DB: 10. Check if user exists by email
    Note over A,DB: SELECT * FROM users WHERE email = 'user@example.com'
    
    alt User doesn't exist
        A->>DB: 11a. Create new user account
        Note over A,DB: INSERT INTO users (email, firstName, lastName, ...)
        A->>DB: 11b. Create user session
        Note over A,DB: INSERT INTO sessions (userId, hash, ...)
    else User exists  
        A->>DB: 11c. Create new session for existing user
        Note over A,DB: INSERT INTO sessions (userId, hash, ...)
    end
    
    A->>A: 12. Generate JWT token with user ID + session ID
    Note over A: JWT payload: { id: userId, sessionId: sessionId, iat: timestamp }
    
    A->>P: 13. Return authentication response
    Note over A,P: { token: "jwt-token", refreshToken: "...", user: {...} }
    
    P->>P: 14. Store JWT token in localStorage
    P->>U: 15. Redirect to authenticated dashboard
    Note over P,U: User is now logged into OpenMeet platform
```

#### Key Data Structures in Platform Authentication

**JWT Token Payload**:
```typescript
{
  id: number,           // User ID in OpenMeet database
  sessionId: number,    // Session ID for tracking
  tenantId: string,     // Tenant context
  iat: number,          // Issued at timestamp
  exp: number          // Expiration timestamp
}
```

**Session Database Record**:
```sql
-- sessions table
id: 664
userId: 3
hash: "cde66c0e35f426408b241e09bd5ee93e5a94366de36f83ecad03e1cc10f030ac"
createdAt: "2025-06-22 13:48:04"
deletedAt: null
```

**User Database Record**:
```sql
-- users table  
id: 3
email: "tompscanlan+updated@gmail.com"
firstName: "Tom"
lastName: "Scanlan"
slug: "tom-scanlan-abc123"
matrixHandle: "tom.scanlan"  -- User-chosen Matrix username
```

### Authentication Flow 2: Matrix Chat Connection via OIDC

**Scenario**: User (already logged into OpenMeet) clicks "Connect to Chat" to access Matrix messaging

#### Step-by-Step Matrix OIDC Authentication Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant P as Platform Frontend
    participant A as OpenMeet API
    participant M as Matrix Server
    participant MC as Matrix Client SDK

    Note over U,MC: User is already logged into OpenMeet with JWT token

    U->>P: 1. Click "Connect to Chat" button
    P->>MC: 2. Initialize Matrix JS SDK
    Note over P,MC: matrixClient = sdk.createClient(homeserverUrl)
    
    MC->>M: 3. Discover authentication flows
    Note over MC,M: GET /_matrix/client/v3/login
    
    M->>MC: 4. Return available auth methods including OIDC
    Note over M,MC: { flows: [{ type: "m.login.sso" }], identity_providers: [...] }
    
    MC->>M: 5. Request OIDC SSO redirect
    Note over MC,M: GET /_matrix/client/v3/login/sso/redirect/oidc-openmeet?redirectUrl=...&state=...&login_hint=user@example.com&tenant_id=...
    
    M->>M: 6. Generate Matrix session cookie and state
    Note over M: Creates oidc_session macaroon for flow tracking
    
    M->>A: 7. Redirect to OpenMeet OIDC authorization endpoint
    Note over M,A: 302 Redirect to: /api/oidc/auth?client_id=matrix_synapse&redirect_uri=...&scope=openid+profile+email&state=...
    
    A->>A: 8. Process OIDC authorization request
    Note over A: Extract Matrix state, client_id, scope validation
    
    A->>A: 9. Check for existing user authentication
    Note over A: Looks for JWT token in Authorization header or user_token query param
    
    alt No JWT token provided
        A->>U: 10a. Display email form for user identification
        Note over A,U: Email input form with OIDC parameters preserved
        U->>A: 10b. Submit email address
        A->>A: 10c. Look up user by email across tenants
        A->>U: 10d. Redirect to tenant-specific login with social options
        Note over A,U: User completes login flow, gets JWT token
    else JWT token provided
        A->>A: 10e. Verify JWT token and extract user ID
        Note over A: Validate signature, check expiration, extract user.id
    end
    
    A->>A: 11. Generate OIDC authorization code
    Note over A: JWT with user ID, tenant ID, Matrix client info, expiration
    
    A->>M: 12. Redirect back to Matrix with authorization code
    Note over A,M: 302 Redirect to: /_synapse/client/oidc/callback?code=JWT_AUTH_CODE&state=MATRIX_STATE
    
    M->>M: 13. Validate Matrix session and state
    Note over M: Verify oidc_session macaroon matches state parameter
    
    M->>A: 14. Exchange authorization code for OIDC tokens
    Note over M,A: POST /api/oidc/token with grant_type=authorization_code
    
    A->>A: 15. Validate authorization code JWT
    Note over A: Verify signature, extract user ID, tenant ID
    
    A->>A: 16. Generate OIDC access token and ID token
    Note over A: Create new JWTs for OIDC response with user claims
    
    A->>M: 17. Return OIDC token response
    Note over A,M: { access_token: "...", id_token: "...", token_type: "Bearer" }
    
    M->>A: 18. Fetch user information with access token
    Note over M,A: GET /api/oidc/userinfo with Authorization: Bearer access_token
    
    A->>A: 19. Validate access token and build user claims
    Note over A: Extract user info and format for Matrix consumption
    
    A->>M: 20. Return user claims for Matrix account creation
    Note over A,M: { sub: "tom.scanlan", name: "Tom Scanlan", email: "...", matrix_handle: "tom.scanlan", tenant_id: "..." }
    
    M->>M: 21. Create or update Matrix user account
    Note over M: @tom.scanlan:matrix.openmeet.net with display name "Tom Scanlan"
    
    M->>M: 22. Generate Matrix access token and device
    Note over M: Create device and access token for Matrix client authentication
    
    M->>MC: 23. Complete SSO flow with Matrix credentials
    Note over M,MC: Redirect to original URL with loginToken
    
    MC->>M: 24. Exchange login token for full Matrix session
    Note over MC,M: POST /_matrix/client/v3/login with token
    
    M->>MC: 25. Return Matrix session credentials
    Note over M,MC: { access_token: "...", user_id: "@tom.scanlan:matrix.openmeet.net", device_id: "..." }
    
    MC->>MC: 26. Initialize Matrix client with credentials
    Note over MC: Start sync, join rooms, enable real-time messaging
    
    MC->>P: 27. Notify frontend of successful connection
    Note over MC,P: Custom event or callback indicating Matrix client ready
    
    P->>U: 28. Display connected chat interface
    Note over P,U: User can now send/receive Matrix messages in real-time
```

#### Detailed OIDC Token Exchange Process

**Authorization Code JWT Structure**:
```typescript
// Authorization code generated by OpenMeet API (step 11)
{
  "type": "auth_code",
  "client_id": "matrix_synapse", 
  "redirect_uri": "http://localhost:8448/_synapse/client/oidc/callback",
  "scope": "openid profile email",
  "state": "t9yRj00zc4tCbw4IljqJH8onEdYAfv", // Matrix-generated state
  "nonce": "3szN5MNFhVrYzeWR741M3p23E5iVkvEX", // Matrix-generated nonce
  "exp": 1750600706, // 10 minute expiration
  "userId": 3, // OpenMeet user ID
  "tenantId": "lsdfaopkljdfs", // Tenant context
  "iat": 1750600106 // Issued at timestamp
}
```

**OIDC Token Response** (step 17):
```typescript
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...", // JWT access token
  "id_token": "eyJhbGciOiJSUzI1NiIs...",     // JWT ID token with user claims
  "token_type": "Bearer",
  "expires_in": 3600 // 1 hour expiration
}
```

**User Claims Response** (step 20):
```typescript
{
  "sub": "tom.scanlan",                    // User-chosen Matrix handle (unique globally)
  "name": "Tom Scanlan",                   // Display name from OpenMeet profile  
  "email": "tompscanlan+updated@gmail.com", // Email from OpenMeet account
  "matrix_handle": "tom.scanlan",          // Same as sub, for explicit clarity
  "tenant_id": "lsdfaopkljdfs"            // Tenant isolation context
}
```

#### Matrix User Account Creation

When Matrix receives user claims, it automatically creates/updates the Matrix account:

**Matrix User ID**: `@tom.scanlan:matrix.openmeet.net`
- **Localpart**: `tom.scanlan` (from claims.sub)
- **Server Name**: `matrix.openmeet.net` (configured in Matrix)
- **Display Name**: `Tom Scanlan` (from claims.name)
- **Email**: Associated but not part of Matrix ID

### Authentication Security Model

#### Session Security (Fixed Vulnerabilities)

**Problem Previously**: OIDC session cookies could persist across users, causing identity mixups
**Solution Implemented**: 
1. **Session Expiration**: 24-hour timeout for OIDC sessions
2. **Session Cleanup**: Invalid session cookies automatically cleared
3. **Identity Validation**: login_hint email verified against session user
4. **Cross-User Prevention**: Session user ID validated against expected user

**Security Flow Example**:
```typescript
// Step 9 detailed - Authentication verification
const sessionCookie = request.cookies['oidc_session'];
if (sessionCookie) {
  const userFromSession = await getUserFromSession(sessionCookie);
  
  // Security check: verify session age (24hr limit)
  if (sessionAge > maxSessionAge) {
    logger.warn(`Session expired, age: ${sessionAge}ms`);
    return null; // Force fresh authentication
  }
  
  // Security check: verify user identity matches login_hint
  if (loginHint && userFromSession.email !== loginHint) {
    logger.warn(`Identity mismatch: session=${userFromSession.email}, hint=${loginHint}`);
    clearOidcSessionCookies(); // Clear invalid session
    redirectToFreshLogin(); // Force re-authentication
    return;
  }
}
```

#### JWT Token Flow Security

**Platform Authentication**:
- JWT tokens stored in browser localStorage
- Short-lived (15 minutes) with refresh token rotation
- Session ID tracking for revocation capability

**OIDC Token Exchange**:
- Authorization codes are short-lived JWT (10 minutes)
- Access tokens are limited scope (1 hour expiration)  
- Matrix credentials never stored in OpenMeet database

#### Cross-Origin Security Considerations

**Current Development Setup**:
- Platform Frontend: `localhost:9005`
- OpenMeet API: `localhost:3000` 
- Matrix Server: `localhost:8448`

**Production Setup**:
- Platform Frontend: `https://dev.openmeet.net/`
- OpenMeet API: `https://api-dev.openmeet.net/`
- Matrix Server: `https://matrix-dev.openmeet.net/`

**Security Implications**:
- Cross-origin cookie restrictions prevent automatic session inheritance
- Email form prompt required when JWT token not provided in Authorization header
- OIDC flow works correctly but requires manual user identification step

### Troubleshooting Authentication Issues

#### Common User Experience Issues

**Issue**: User prompted for email despite being logged into OpenMeet
**Cause**: Frontend not including JWT token in Matrix OIDC request
**Solution**: Frontend should include `Authorization: Bearer JWT_TOKEN` header when initiating Matrix connection

**Issue**: "Chuck Roy" identity appears instead of correct user
**Cause**: Stale OIDC session cookie from previous user
**Solution**: Clear all cookies for OpenMeet domains, implemented automatic session cleanup

**Issue**: Matrix connection fails with "cannot determine data format of binary-encoded macaroon"
**Cause**: Missing Matrix OIDC endpoint configuration 
**Solution**: Ensure all `MATRIX_OIDC_*` environment variables configured correctly

#### Development vs Production Environment Differences

**Local Development**:
```yaml
# Matrix homeserver.yaml
authorization_endpoint: "${MATRIX_OIDC_AUTHORIZATION_ENDPOINT}"
# Resolves to: https://localdev.openmeet.net/api/oidc/auth

# API Configuration  
MATRIX_OIDC_AUTHORIZATION_ENDPOINT=https://localdev.openmeet.net/api/oidc/auth
MATRIX_OIDC_TOKEN_ENDPOINT=https://localdev.openmeet.net/api/oidc/token
```

**Kubernetes Production**:
```yaml
# Matrix synapse config
authorization_endpoint: "${MATRIX_OIDC_AUTHORIZATION_ENDPOINT}"
# Resolves to: https://api-dev.openmeet.net/api/oidc/auth

# API Configuration
MATRIX_OIDC_AUTHORIZATION_ENDPOINT=https://api-dev.openmeet.net/api/oidc/auth
MATRIX_OIDC_TOKEN_ENDPOINT=https://api-dev.openmeet.net/api/oidc/token
```

### Performance Characteristics

**Platform Login Performance**:
- Google OAuth redirect: ~2-3 seconds
- User lookup/creation: ~100-200ms
- JWT generation: ~50ms
- Total login time: ~3-5 seconds

**Matrix OIDC Authentication Performance**:
- Matrix SSO discovery: ~100ms
- OIDC authorization: ~200ms (with existing session)
- Token exchange: ~150ms
- User claims fetch: ~100ms
- Matrix account setup: ~300ms
- Client initialization: ~500ms
- **Total Matrix connection time**: ~1.5-2 seconds (when session exists)

**With Email Form Prompt**:
- Additional 10-30 seconds for user email entry
- Increases total flow to 15-35 seconds

### Future Optimization Opportunities

**Seamless Authentication**:
- Frontend include JWT token in Matrix connection requests
- Eliminates email form prompt for logged-in users
- Reduces Matrix connection time to ~1-2 seconds

**Cross-Device Sync**:
- Matrix credentials shared across browser tabs
- Automatic reconnection on page reload
- Session persistence across browser restarts

**Mobile Integration**:
- Same OIDC flow works for mobile Matrix clients
- Third-party clients (Element, FluffyChat) supported
- Single sign-on across all Matrix client types

---

### ADR-007: Migration to Matrix Authentication Service (MAS)
**Decision**: Adopt Matrix Authentication Service (MAS) to replace legacy Matrix OIDC implementation and resolve macaroon compatibility issues
**Status**: Planned - Research Phase

#### Problem Statement

Current Matrix Synapse OIDC implementation suffers from fundamental compatibility issues:
- **MacaroonDeserializationException**: Matrix v1.132.0 cannot deserialize its own session cookies
- **pymacaroons Library Issues**: Binary format incompatibility in containerized environments  
- **Legacy Architecture**: Matrix uses hybrid OIDC+macaroons instead of pure OIDC tokens
- **Browser Security Conflicts**: Cross-origin cookie restrictions in modern browsers
- **Maintenance Burden**: Complex session cookie management and debugging

#### Proposed Solution: Matrix Authentication Service Integration

**Matrix Authentication Service (MAS)** is Matrix.org's official next-generation authentication system that provides pure OIDC/OAuth2 compliance without legacy macaroon dependencies.

#### Architecture Comparison

**Current (Problematic)**:
```
Element Client → Matrix Synapse (OIDC+macaroons) → OpenMeet OIDC → User Auth
```

**With MAS (Target)**:
```
Element Client → Matrix Auth Service (pure OIDC) → OpenMeet OIDC → User Auth
```

#### Implementation Plan

**Phase 1: Research & Architecture Design** (Q1 2025)
- Study MAS documentation and deployment requirements
- Design MAS integration with existing OpenMeet OIDC infrastructure
- Plan database schema changes for MAS session management
- Evaluate MAS compatibility with current Matrix client integrations

**Phase 2: Parallel MAS Deployment** (Q2 2025)
- Deploy MAS alongside existing Matrix Synapse server
- Configure MAS to use OpenMeet as upstream OIDC provider
- Implement MAS client registration and session management
- Create MAS-aware authentication endpoints in OpenMeet API

**Phase 3: Frontend Integration** (Q3 2025)
- Update Matrix JS SDK integration to use MAS authentication
- Implement MAS token handling and refresh logic
- Add user-facing migration UI for existing Matrix users
- Test MAS compatibility with third-party Matrix clients

**Phase 4: Full Migration** (Q4 2025)
- Migrate existing Matrix users to MAS authentication
- Deprecate legacy Matrix OIDC configuration
- Remove macaroon-related code and dependencies
- Monitor performance and reliability improvements

#### Expected Benefits

**Technical Improvements**:
- ✅ **Eliminates macaroon issues** - Pure OIDC token-based authentication
- ✅ **Browser compatibility** - Standard OAuth2 flows work reliably
- ✅ **Future-proof architecture** - Aligns with Matrix.org roadmap
- ✅ **Simplified debugging** - Standard OIDC error handling
- ✅ **Better scalability** - Dedicated authentication service

**Security Enhancements**:
- ✅ **Standards compliance** - Full OAuth2/OIDC specification adherence
- ✅ **Token revocation** - Centralized session management
- ✅ **Audit capabilities** - Comprehensive authentication logging
- ✅ **Role-based access** - Fine-grained permission controls

**User Experience Gains**:
- ✅ **Reliable authentication** - No more macaroon deserialization failures
- ✅ **Faster connections** - Streamlined token exchange process
- ✅ **Multi-client support** - Better third-party Matrix client integration
- ✅ **Cross-device sync** - Improved session management across devices

#### Research Questions

**Deployment Complexity**:
- MAS infrastructure requirements and Docker integration
- Database migration needs and data persistence
- Kubernetes deployment and scaling considerations
- Development environment setup and testing strategies

**Integration Architecture**:
- MAS ↔ OpenMeet OIDC provider configuration
- Matrix Synapse ↔ MAS integration requirements  
- Frontend Matrix client authentication flow changes
- Backward compatibility with existing Matrix accounts

**Migration Strategy**:
- User data preservation during MAS migration
- Timeline for deprecating legacy Matrix OIDC
- Rollback plan if MAS integration encounters issues
- Communication plan for user-facing authentication changes

#### Success Criteria

**Technical Metrics**:
- Zero `MacaroonDeserializationException` errors in production
- Matrix authentication success rate >99.5%
- Authentication latency <2 seconds for existing sessions
- Third-party Matrix client compatibility maintained

**User Experience Metrics**:
- User-reported authentication issues reduced by >90%
- Chat connection reliability improved measurably
- Support tickets related to Matrix login reduced significantly
- User adoption of third-party Matrix clients increases

#### Risk Assessment

**Implementation Risks**:
- ⚠️ **MAS maturity** - Relatively new service with limited production deployments
- ⚠️ **Migration complexity** - Potential data loss or service interruption
- ⚠️ **Learning curve** - Team needs to understand MAS architecture and operations
- ⚠️ **Timeline pressure** - Current Matrix issues need resolution quickly

**Mitigation Strategies**:
- **Parallel deployment** - Run MAS alongside existing system for gradual migration
- **Comprehensive testing** - Extensive integration testing before production rollout
- **Staged rollout** - Migrate users in small batches with monitoring
- **Rollback planning** - Clear rollback procedures if issues arise
- **Documentation** - Thorough operational runbooks for MAS management

#### Alternative Solutions Considered

**Option 1: Matrix Version Downgrade**
- **Description**: Downgrade to Matrix Synapse version with working macaroons
- **Rejected**: Security vulnerabilities and missing features in older versions

**Option 2: Custom Macaroon Library**
- **Description**: Fork pymacaroons library and fix binary compatibility issues
- **Rejected**: Significant maintenance burden and expertise required

**Option 3: Hybrid Token System**
- **Description**: Continue Matrix OIDC but bypass macaroon validation
- **Rejected**: Compromises security and doesn't address root architectural issues

**Option 4: Alternative Matrix Server**
- **Description**: Switch to Dendrite or Conduit Matrix implementations
- **Rejected**: Feature gaps and migration complexity too high

#### Next Steps

1. **Research Phase** (2-3 weeks)
   - Deep dive into MAS documentation and architecture
   - Evaluate MAS deployment requirements and constraints
   - Design high-level integration architecture with OpenMeet

2. **Proof of Concept** (3-4 weeks)  
   - Deploy MAS in isolated development environment
   - Test basic OIDC integration with OpenMeet API
   - Validate Matrix client compatibility with MAS

3. **Implementation Planning** (1-2 weeks)
   - Detailed implementation timeline and resource requirements
   - Database schema changes and migration procedures
   - Risk assessment and mitigation strategies finalized

4. **Stakeholder Review**
   - Present research findings and implementation plan
   - Get approval for MAS migration project
   - Allocate development resources and timeline

**Current Status**: Initial research phase - gathering MAS documentation and deployment requirements

**Rationale**: MAS migration represents the most sustainable long-term solution for Matrix authentication issues while providing significant technical and user experience improvements. The investment in migration will eliminate ongoing maintenance burden of legacy macaroon systems and align OpenMeet with Matrix.org's strategic direction.