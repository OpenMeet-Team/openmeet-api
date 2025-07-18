# Matrix Bot Architecture: Creation, Usage, and Configuration

## Overview

The OpenMeet Matrix integration uses a dual-bot architecture that combines a main Application Service bot with tenant-specific bot users. This design ensures proper namespace isolation while maintaining centralized authentication privileges.

## Architecture Components

### 1. Main Application Service Bot (`@openmeet-bot`)

**Purpose**: Provides Matrix Application Service authentication and serves as the default sender for the appservice.

**Configuration**:
- Defined in `matrix-config/openmeet-appservice.gomplate.yaml`
- Uses `MATRIX_APPSERVICE_ID` environment variable
- Serves as `sender_localpart` in appservice configuration
- Has global namespace control over `@openmeet-bot-.*:.*` and `@openmeet-.*:.*`

**Characteristics**:
- Not a "real" user account in our database
- Exists only in Matrix homeserver configuration
- Uses Application Service token authentication
- Has elevated privileges across the entire Matrix system

### 2. Tenant-Specific Bot Users (`@openmeet-bot-{tenantId}`)

**Purpose**: Provides isolated bot identities for each tenant while maintaining namespace compliance.

**Creation Process**:
- Created via `TenantBotSetupService.initializeBotForTenant()`
- Stored as real user records in the database
- Uses tenant-specific credentials and configuration
- Follows format: `openmeet-bot-{tenantId}`

**Characteristics**:
- Real user accounts in OpenMeet database
- Have passwords (with rotation capabilities)
- Use AppService authentication for Matrix operations
- Maintain tenant isolation

## Bot Creation Flow

```mermaid
sequenceDiagram
    participant API as OpenMeet API
    participant TBS as TenantBotSetupService
    participant MBUS as MatrixBotUserService
    participant DB as Database
    participant MHS as Matrix Homeserver

    Note over API,MHS: Tenant Bot Creation Process
    
    API->>TBS: initializeBotForTenant(tenantId)
    TBS->>MBUS: createBotUser(tenantId)
    
    MBUS->>MBUS: Generate bot email: bot-{tenantId}@domain
    MBUS->>MBUS: Generate bot slug: openmeet-bot-{tenantId}
    MBUS->>DB: Create user record with credentials
    
    DB-->>MBUS: User created successfully
    MBUS-->>TBS: Bot user created
    TBS-->>API: Bot initialized for tenant
    
    Note over API,MHS: Bot Authentication for Operations
    
    API->>TBS: authenticateBotWithAppService(tenantId)
    TBS->>MBUS: getOrCreateBotUser(tenantId)
    MBUS-->>TBS: Return bot user details
    
    TBS->>MHS: Create Matrix client with AppService token
    Note over TBS,MHS: Uses @openmeet-bot-{tenantId}:domain as userId
    MHS-->>TBS: Authenticated Matrix client
    TBS-->>API: Bot ready for operations
```

## Why Two Types of Bots?

### Matrix Application Service Requirements

Matrix Application Services require a `sender_localpart` - this becomes the primary bot identity that Matrix associates with the appservice. This bot:

- **Must exist** for the appservice to function
- **Cannot be deleted** without breaking the appservice
- **Has global privileges** within the defined namespaces
- **Serves as fallback** for operations when no specific user is provided

### Tenant Isolation Requirements

OpenMeet's multi-tenant architecture requires:

- **Separate bot identities** for each tenant
- **Isolated permissions** per tenant
- **Auditable actions** tied to specific tenants
- **Scalable management** of bot credentials

### The Solution: Dual Bot Architecture

```mermaid
graph TB
    subgraph "Matrix Application Service"
        AS[Application Service]
        ASBOT[@openmeet-bot<br/>sender_localpart]
        TOKEN[AppService Token]
    end
    
    subgraph "Tenant A"
        TBOT1[@openmeet-bot-tenantA<br/>Real User Account]
        TCREDS1[Tenant A Credentials]
    end
    
    subgraph "Tenant B"
        TBOT2[@openmeet-bot-tenantB<br/>Real User Account]
        TCREDS2[Tenant B Credentials]
    end
    
    subgraph "Matrix Operations"
        ROOM[Room Creation]
        INVITE[User Invitations]
        POWER[Power Level Management]
    end
    
    AS --> ASBOT
    AS --> TOKEN
    
    TOKEN --> TBOT1
    TOKEN --> TBOT2
    
    TBOT1 --> ROOM
    TBOT1 --> INVITE
    TBOT1 --> POWER
    
    TBOT2 --> ROOM
    TBOT2 --> INVITE
    TBOT2 --> POWER
    
    TCREDS1 --> TBOT1
    TCREDS2 --> TBOT2
```

## Configuration Details

### Application Service Configuration

**File**: `matrix-config/openmeet-appservice.gomplate.yaml`

```yaml
id: {{ .Env.MATRIX_APPSERVICE_ID }}
url: {{ .Env.MATRIX_APPSERVICE_URL }}
as_token: {{ .Env.MATRIX_APPSERVICE_TOKEN }}
hs_token: {{ .Env.MATRIX_APPSERVICE_HS_TOKEN }}
sender_localpart: {{ .Env.MATRIX_APPSERVICE_ID }}  # Main bot identity
rate_limited: false

namespaces:
  users:
    - exclusive: true
      regex: "@openmeet-bot-.*:.*"    # Tenant-specific bots
    - exclusive: true
      regex: "@openmeet-.*:.*"        # General openmeet users
```

### Tenant Configuration

**File**: `tenant-service/tenants-{env}.yaml`

```yaml
tenants:
  - id: "tenantId"
    matrixConfig:
      homeserverUrl: "http://localhost:8448"
      serverName: "matrix.openmeet.net"
      botUser:
        email: "bot-tenantId@openmeet.net"
        slug: "openmeet-bot-tenantId"
        password: "secure-password"
      appservice:
        id: "openmeet-appservice-tenantId"
        token: "as_token_tenantId"
        hsToken: "hs_token_tenantId"
```

## Matrix Operations Flow

```mermaid
sequenceDiagram
    participant API as OpenMeet API
    participant MBS as MatrixBotService
    participant MC as Matrix Client
    participant MHS as Matrix Homeserver
    participant ROOM as Matrix Room

    Note over API,ROOM: Room Creation with Power Levels
    
    API->>MBS: createRoom(tenantId, roomConfig)
    MBS->>MBS: authenticateBot(tenantId)
    Note over MBS: Uses @openmeet-bot-{tenantId} identity<br/>with AppService token
    
    MBS->>MC: createClient(appServiceToken, tenantBotUserId)
    MC->>MHS: Create room with power levels
    
    Note over MHS: Power levels set for both:
    Note over MHS: @openmeet-bot: 100 (main bot)
    Note over MHS: @openmeet-bot-{tenantId}: 100 (tenant bot)
    
    MHS->>ROOM: Room created with dual admin privileges
    ROOM-->>MHS: Room ID returned
    MHS-->>MC: Room creation confirmed
    MC-->>MBS: Room details
    MBS-->>API: Room created successfully
```

## Why Not Just Use the Main Bot?

### The Problem with Single Bot Approach

If we only used `@openmeet-bot` for all operations:

1. **No Tenant Isolation**: All actions would appear to come from the same bot
2. **Audit Trail Issues**: Cannot distinguish which tenant performed actions
3. **Permission Complexity**: Difficult to manage tenant-specific permissions
4. **Scaling Problems**: Single bot becomes bottleneck for all tenants
5. **Security Concerns**: One compromised bot affects all tenants

### The Benefits of Dual Bot Architecture

1. **Clear Separation**: AppService authentication vs. operational identity
2. **Tenant Isolation**: Each tenant has its own bot identity
3. **Scalable Management**: Bot credentials can be rotated per tenant
4. **Audit Trail**: Actions clearly attributed to specific tenants
5. **Namespace Compliance**: Maintains Matrix's expected patterns

## Service Responsibilities

### TenantBotSetupService (`src/matrix/services/tenant-bot-setup.service.ts`)
- Initializes bots for new tenants
- Manages bot lifecycle (creation, verification, cleanup)
- Handles bot health monitoring
- Coordinates with other services

### MatrixBotUserService (`src/matrix/services/matrix-bot-user.service.ts`)
- Creates bot user records in database
- Generates tenant-specific credentials
- Manages password rotation
- Handles bot user queries

### MatrixBotService (`src/matrix/services/matrix-bot.service.ts`)
- Performs actual Matrix operations
- Authenticates bots with AppService
- Manages Matrix client instances
- Handles room operations (create, invite, power levels)

## Security Considerations

### Authentication Flow
1. **AppService Token**: Provides Matrix authentication privileges
2. **Tenant Bot Identity**: Provides user context for operations
3. **Database Credentials**: Secure tenant-specific bot passwords
4. **Rotation Policy**: Regular password rotation (default 30 days)

### Permission Model
- **Main Bot**: Global namespace control, no operational use
- **Tenant Bots**: Operational identity with tenant-scoped permissions
- **Room Power Levels**: Both bots get admin (100) for redundancy

## Conclusion

The dual-bot architecture solves the fundamental tension between Matrix's Application Service requirements and OpenMeet's multi-tenant isolation needs. While it may seem complex, it provides:

- **Compliance** with Matrix Application Service patterns
- **Isolation** between tenants
- **Scalability** for operational management
- **Security** through proper credential separation
- **Auditability** of tenant-specific actions

This architecture ensures that OpenMeet can operate as a proper Matrix Application Service while maintaining the security and isolation requirements of a multi-tenant platform.