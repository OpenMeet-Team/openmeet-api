# Matrix Authentication Service (MAS) Integration Design

## Overview

This document outlines the research and design for integrating Matrix Authentication Service (MAS) with OpenMeet to replace the current problematic Matrix Synapse OIDC implementation. This addresses the documented authentication issues in Matrix v1.132.0 with macaroon deserialization failures and environment-specific session handling problems.

## Background

### Current Issues
- **MacaroonDeserializationException**: Matrix v1.132.0 fails to deserialize session cookies in Kubernetes+ALB environments
- **Environment-Specific Failures**: Local Docker works, production Kubernetes fails with identical configuration
- **Session Cookie Complexity**: Complex macaroon binary format causes browser security and ALB compatibility issues
- **Technical Debt**: Custom session validation logic with fallback authentication methods

### Matrix Authentication Service (MAS)
- **MSC3861 Implementation**: Official Matrix Spec Change for delegated authentication
- **Production Ready**: Used by Element in commercial deployments
- **Pure OIDC/OAuth2**: Eliminates legacy Matrix authentication methods
- **Written in Rust**: High-performance, secure, maintained by Element team

## Architecture Analysis

### Current Architecture (Problematic)
```
Element Client → Matrix Synapse → Custom OIDC Provider (OpenMeet API)
                ↓ (session cookies)
             Binary Macaroons (fails in K8s)
```

**Issues:**
- Matrix generates binary macaroon session cookies
- ALB/browser environment causes macaroon deserialization failures
- Complex fallback authentication logic masks underlying problems
- Environment-specific configuration differences

### Proposed MAS Architecture (Recommended)
```
Element Client → Matrix Synapse → MAS → OpenMeet OIDC Provider
                ↓ (MSC3861)      ↓ (upstream OIDC)
            OAuth2 Tokens    Standard OIDC Flow
```

**Benefits:**
- Standard OAuth2/OIDC tokens replace binary macaroons
- Environment-agnostic authentication flows
- Future-proof alignment with Matrix specification
- Eliminates custom session handling complexity

## ✅ IMPLEMENTATION COMPLETE (July 2025)

### **Final Architecture Implemented**
```
Element Client → Matrix Synapse → MAS → OpenMeet OIDC Provider
Frontend App  ↗     ↓ (MSC3861)      ↓ (upstream OIDC)
             OAuth2 Tokens    Standard OIDC Flow
             
Bot Operations ← Application Service ← Matrix Synapse
```

**Key Components Deployed:**
- **Matrix Synapse 1.132.0** with MSC3861 experimental features enabled
- **Matrix Authentication Service (MAS) v0.17.1** as OIDC provider
- **OpenMeet OIDC** configured as upstream provider for MAS
- **Matrix Application Service** bot for room management operations
- **Frontend Matrix SDK** with direct MAS OAuth2 authentication

### **User Experience Changes**

**Authentication Flow:**
1. User clicks "Connect to Matrix" in OpenMeet chat interface
2. Frontend redirects to MAS OAuth2 authorization endpoint
3. User authenticates through MAS web interface using OpenMeet credentials
4. MAS redirects back with authorization code
5. Frontend exchanges code for Matrix credentials
6. Matrix client initializes and user can send/receive messages

**Behavior Changes:**
- Users now authenticate via MAS web interface instead of Matrix SSO redirect
- Matrix user IDs format: `@username_tenantid:matrix.openmeet.net` 
- Room creation/management handled transparently by backend bot
- Message sending/receiving through frontend Matrix client

### **Configuration Requirements**

**Matrix Homeserver (`homeserver-mas-local.yaml`):**
```yaml
experimental_features:
  msc3861:
    enabled: true
    issuer: "${MAS_ISSUER}"
    client_id: "0000000000000000000SYNAPSE"
    client_auth_method: "client_secret_basic"
    client_secret: "${MAS_CLIENT_SECRET}"
    admin_token: "local-mas-admin-token"
    introspection_endpoint: "http://matrix-auth-service:8080/oauth2/introspect"
  msc3970_enabled: true  # Transaction ID scoping to devices
```

**MAS Configuration (`mas-config-local.yaml`):**
```yaml
clients:
  # Matrix Synapse Client for MSC3861
  - client_id: "0000000000000000000SYNAPSE"
    client_auth_method: "client_secret_basic"
    client_secret: "local-dev-shared-secret-with-synapse"
    
  # OpenMeet Frontend Client  
  - client_id: "01JAYS74TCG3BTWKADN5Q4518D"
    client_auth_method: "none"
    redirect_uris:
      - "http://localhost:9005/auth/matrix/callback"

upstream_oauth2:
  providers:
    - id: "01JAYS74TCG3BTWKADN5Q4518C"
      human_name: "OpenMeet Local"
      issuer: "https://localdev.openmeet.net/oidc"
      client_id: "mas_client"
      client_secret: "local-dev-shared-secret-with-synapse"
      scope: "openid email"
```

**Matrix Application Service (`openmeet-appservice-local.yaml`):**
```yaml
id: openmeet-bot
url: http://host.docker.internal:3000/api/matrix/appservice
as_token: your-app-service-token
hs_token: your-homeserver-token
sender_localpart: openmeet-bot
namespaces:
  users:
    - exclusive: true
      regex: "@openmeet-bot-.*:.*"
    - exclusive: true  
      regex: "@openmeet-.*:.*"
```

### **⚠️ Known Issues**

**MSC3861/MSC3970 Transaction ID Problem:**
- **Issue**: Frontend Matrix SDK `client.sendEvent()` fails with `AssertionError: Requester must have an access_token_id`
- **Root Cause**: OAuth2 tokens from MAS lack `access_token_id` field required by Synapse transaction system
- **Workaround**: Element clients work (different auth path), custom clients need compatibility tokens
- **Status**: Blocks custom Matrix client integration, under investigation with Matrix community

**Impact:**
- ✅ Element Desktop/Web clients work perfectly
- ❌ OpenMeet frontend Matrix integration fails on message sending
- ✅ Backend bot operations work for room management
- ❌ Any custom Matrix SDK client with transaction IDs fails

## Integration Options

### Option 1: MAS with Upstream OIDC Integration (Recommended)

**Architecture:**
- Deploy MAS as dedicated service
- Configure OpenMeet API as upstream OIDC provider
- Synapse delegates all authentication to MAS (MSC3861 mode)
- Maintains existing OpenMeet user management

**Configuration:**
```yaml
# MAS config.yaml
upstream_oauth2:
  providers:
    - id: "01JAYS74TCG3BTWKADN5Q4518C"
      issuer: "https://api-dev.openmeet.net/oidc"
      human_name: "OpenMeet"
      client_id: "mas_client"
      client_secret: "${OPENMEET_CLIENT_SECRET}"
      scope: "openid profile email"
      claims_imports:
        localpart:
          action: require
          template: "{{ user.preferred_username }}"
        displayname:
          action: suggest
          template: "{{ user.name }}"
        email:
          action: suggest
          template: "{{ user.email }}"

# Synapse homeserver.yaml (MSC3861 mode)
experimental_features:
  msc3861:
    enabled: true
    issuer: "https://mas-dev.openmeet.net/"
    client_id: "0000000000000000000SYNAPSE"
    client_secret: "${SYNAPSE_CLIENT_SECRET}"
    admin_token: "${MAS_ADMIN_TOKEN}"
```

**Pros:**
- ✅ Eliminates macaroon session issues completely
- ✅ Leverages existing OpenMeet OIDC infrastructure
- ✅ Standards-compliant OAuth2/OIDC flows
- ✅ Future-proof alignment with Matrix roadmap
- ✅ Production-tested by Element

**Cons:**
- ❌ Additional service to deploy and maintain
- ❌ Requires PostgreSQL database for MAS
- ❌ User migration complexity
- ❌ Team learning curve for MAS administration

### Option 2: MAS with Local User Management

**Architecture:**
- Deploy MAS with built-in user database
- Migrate OpenMeet users to MAS
- Use MAS as primary identity provider

**Pros:**
- ✅ Complete authentication control
- ✅ Advanced features (TOTP, WebAuthn)
- ✅ Policy engine for authorization

**Cons:**
- ❌ Duplicate user management systems
- ❌ Complex data migration requirements
- ❌ Higher maintenance overhead

### Option 3: Hybrid Migration Approach

**Architecture:**
- Fix current OIDC issues as interim solution
- Deploy MAS alongside existing system
- Gradual migration with compatibility layer

**Pros:**
- ✅ Minimal disruption during transition
- ✅ Risk mitigation with fallback capability
- ✅ Gradual user migration

**Cons:**
- ❌ Higher complexity maintaining both systems
- ❌ Increased infrastructure costs
- ❌ Delayed resolution of current issues

## Security Analysis

### Current Security Issues
1. **Token Exposure**: User tokens visible in query parameters (documented security concern)
2. **Environment-Specific Failures**: Create authentication gaps in production
3. **Complex Fallback Logic**: Multiple authentication methods increase attack surface
4. **Macaroon Vulnerabilities**: Binary cookie handling issues in browser/ALB environment

### MAS Security Benefits
1. **Standards Compliance**: Full OAuth2/OIDC specification adherence
2. **Battle-Tested**: Production use by Element and Matrix.org
3. **Security Hardening**: Built-in CSRF, PKCE, session management protections
4. **Audit Trail**: Comprehensive authentication logging
5. **Policy Engine**: Fine-grained authorization with Open Policy Agent (OPA)

### Security Boundaries
- **MAS ↔ OpenMeet**: Standard OAuth2 client credentials and authorization flows
- **Client ↔ MAS**: Standard OIDC authorization code flow with PKCE
- **Synapse ↔ MAS**: OAuth2 token introspection (RFC 7662)

## Implementation Strategy

### Phase 1: Development Environment Setup (2-3 weeks)
1. **Fix Current OIDC Issues** (immediate priority)
   - Remove macaroon parsing logic from `oidc.controller.ts`
   - Clean up session cookie handling
   - Ensure graceful fallback behavior

2. **Deploy MAS in Development**
   - Set up PostgreSQL database for MAS
   - Configure MAS with OpenMeet as upstream OIDC provider
   - Basic authentication flow testing

3. **OpenMeet API Preparation**
   - Register MAS as OIDC client
   - Enhance claims mapping for Matrix requirements
   - Implement tenant-aware authentication

### Phase 2: Integration and Testing (3-4 weeks)
1. **Synapse MSC3861 Configuration**
   - Enable experimental MSC3861 features
   - Configure Synapse to delegate to MAS
   - Remove legacy OIDC configuration

2. **User Migration Strategy**
   - Design user migration scripts
   - Implement Matrix ID ↔ OpenMeet user mapping
   - Plan session invalidation strategy

3. **End-to-End Testing**
   - Element Desktop authentication flows
   - Element Web browser testing
   - Third-party Matrix client compatibility

### Phase 3: Production Deployment (2-3 weeks)
1. **Production MAS Deployment**
   - Kubernetes deployment with high availability
   - Database backup and recovery procedures
   - Monitoring and alerting setup

2. **Gradual Migration**
   - Blue-green deployment strategy
   - User migration with rollback capability
   - Performance monitoring and optimization

3. **Legacy System Removal**
   - Remove custom macaroon handling code
   - Clean up fallback authentication methods
   - Documentation updates

## Infrastructure Requirements

### MAS Service Requirements
- **CPU**: 200m-500m (scales with concurrent users)
- **Memory**: 256Mi-1Gi
- **Storage**: PostgreSQL database (~10GB+ for user sessions)
- **Network**: Dedicated ingress endpoint
- **TLS**: Valid certificates for MAS endpoints

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: matrix-auth-service
  namespace: dev
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: mas
        image: ghcr.io/element-hq/matrix-authentication-service:latest
        env:
        - name: MAS_CONFIG
          value: /config/config.yaml
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: mas-secrets
              key: database-url
        ports:
        - containerPort: 8080
          name: http
        volumeMounts:
        - name: config
          mountPath: /config
          readOnly: true
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 1Gi
```

### Database Schema
- **MAS Database**: Dedicated PostgreSQL schema for sessions, clients, tokens
- **Migration Scripts**: Export OpenMeet users → Import to MAS with proper claims mapping
- **Backup Strategy**: Regular database backups with point-in-time recovery

## Configuration Details

### MAS Configuration (`config.yaml`)
```yaml
listeners:
  - name: web
    resources:
      - name: discovery
      - name: human
      - name: oauth2
      - name: compat
    binds:
      - address: "[::]:8080"

database:
  uri: "${DATABASE_URL}"

clients:
  - client_id: "0000000000000000000SYNAPSE"
    client_secret: "${SYNAPSE_CLIENT_SECRET}"
    client_auth_method: client_secret_post

upstream_oauth2:
  providers:
    - id: "01JAYS74TCG3BTWKADN5Q4518C"
      issuer: "https://api-dev.openmeet.net/oidc"
      human_name: "OpenMeet"
      brand_name: "openmeet"
      client_id: "mas_client"
      client_secret: "${OPENMEET_CLIENT_SECRET}"
      scope: "openid profile email"
      claims_imports:
        localpart:
          action: require
          template: "{{ user.preferred_username }}"
        displayname:
          action: suggest
          template: "{{ user.name }}"
        email:
          action: suggest
          template: "{{ user.email }}"
        tenant_id:
          action: suggest
          template: "{{ user.tenant_id }}"

policy:
  data:
    admin_users:
      - "@admin:matrix.openmeet.net"
```

### OpenMeet API Updates
1. **OAuth2 Client Registration**
   ```typescript
   // Register MAS as OIDC client
   const masClient = {
     client_id: 'mas_client',
     client_secret: process.env.MAS_CLIENT_SECRET,
     redirect_uris: ['https://mas-dev.openmeet.net/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C'],
     scope: 'openid profile email',
     grant_types: ['authorization_code', 'refresh_token']
   };
   ```

2. **Enhanced Claims Mapping**
   ```typescript
   // Add Matrix-specific claims
   const claims = {
     sub: user.id.toString(),
     preferred_username: user.slug,
     name: user.name,
     email: user.email,
     tenant_id: tenantId,
     matrix_localpart: user.slug,
     // Additional OpenMeet-specific claims
   };
   ```

## Migration Strategy

### User Migration Process
1. **Export OpenMeet Users**
   ```sql
   SELECT id, email, slug, name, created_at, tenant_id 
   FROM users 
   WHERE active = true;
   ```

2. **Create MAS User Mappings**
   ```typescript
   const userMapping = {
     matrix_id: `@${user.slug}:matrix.openmeet.net`,
     openmeet_user_id: user.id,
     tenant_id: user.tenant_id,
     upstream_subject: user.id.toString()
   };
   ```

3. **Session Migration**
   - Invalidate all existing Matrix sessions
   - Force re-authentication through MAS
   - Maintain Matrix room memberships

### Rollback Strategy
1. **Immediate Rollback**: Switch ingress traffic back to current Synapse
2. **Configuration Rollback**: Restore previous homeserver.yaml configuration  
3. **User Session Recovery**: Re-enable legacy authentication methods temporarily
4. **Data Consistency**: Ensure no data loss during rollback process

## Success Metrics

### Technical Metrics
- **Zero Authentication Errors**: Eliminate MacaroonDeserializationException
- **Environment Consistency**: Identical behavior across local/dev/prod
- **Performance**: < 500ms authentication flows
- **Uptime**: 99.9% authentication service availability

### User Experience Metrics
- **Seamless Authentication**: No manual "Connect" button clicking
- **Cross-Client Compatibility**: Works with Element Desktop, Web, mobile
- **Session Persistence**: Maintain authentication across browser sessions
- **Error Recovery**: Graceful handling of authentication failures

### Operational Metrics
- **Code Reduction**: Remove custom macaroon handling code
- **Maintenance Overhead**: Simplified authentication troubleshooting
- **Documentation**: Clear operational procedures for MAS management
- **Team Knowledge**: Reduced expertise required for Matrix authentication issues

## Risk Assessment

### High Risks
1. **User Migration Complexity**: Risk of user lockout during migration
   - **Mitigation**: Gradual migration with rollback capability
   - **Testing**: Extensive testing in development environment

2. **Service Dependencies**: MAS becomes critical path for Matrix authentication
   - **Mitigation**: High availability deployment with monitoring
   - **Backup**: Temporary fallback to current system during outages

### Medium Risks
1. **Learning Curve**: Team needs to learn MAS administration
   - **Mitigation**: Training and documentation
   - **Support**: Element provides commercial support options

2. **Database Requirements**: Additional PostgreSQL instance
   - **Mitigation**: Use existing database infrastructure
   - **Backup**: Standard database backup procedures

### Low Risks
1. **Configuration Complexity**: MAS configuration is well-documented
2. **Performance Impact**: MAS is designed for production scale
3. **Security Changes**: MAS improves security posture overall

## Decision Record

**Recommendation**: Proceed with **Option 1 (MAS with Upstream OIDC Integration)**

**Rationale**:
1. **Solves Current Problems**: Eliminates documented macaroon and session issues
2. **Future-Proof**: Aligns with Matrix specification roadmap (MSC3861)
3. **Leverages Existing Investment**: Uses current OpenMeet OIDC provider
4. **Production Ready**: Battle-tested by Element in commercial deployments
5. **Clear Architecture**: Clean separation between authentication and homeserver

**Next Steps**:
1. Begin Phase 1 implementation in development environment
2. Set up MAS PostgreSQL database
3. Configure MAS with OpenMeet as upstream OIDC provider
4. Test basic authentication flows with Element clients
5. Document configuration and operational procedures

**Timeline**: 8-10 weeks total implementation
**Resources**: 1-2 engineers, DevOps support for infrastructure
**Budget**: Additional PostgreSQL database, MAS infrastructure costs

---

*This design document will be updated as implementation progresses and additional requirements are discovered.*