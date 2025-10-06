# Matrix Integration for OpenMeet

This directory contains streamlined documentation for the Matrix chat integration in OpenMeet.

## Documentation Overview

1. [Matrix Architecture](./matrix-architecture.md)
   - High-level architecture overview
   - Key components and their responsibilities
   - System data flow
   - User experience improvements
   - Implementation status

2. [Matrix Implementation](./matrix-implementation.md)
   - Detailed service architecture
   - Credential management strategies
   - Performance optimizations
   - Permission management
   - Key design decisions
   - Future enhancements

## Quick Start

For developers new to the Matrix integration:

1. Read [Matrix Architecture](./matrix-architecture.md) first to understand the overall design
2. Review [Matrix Implementation](./matrix-implementation.md) for technical details

## Key Reference

### Important Methods

- `MatrixUserService.provisionMatrixUser()`: User provisioning with credential management
- `MatrixCoreService.regenerateAdminAccessToken()`: Admin token regeneration when expired
- `MatrixRoomService.ensureAdminInRoom()`: Ensures admin is in room before operations
- `MatrixBotService.authenticateBotWithAppService()`: Bot authentication for room operations

### Important Platform Components

- `MatrixChatGateway.vue`: UI component that renders chat interface for events, groups, and direct messages
- `MatrixClientManager.ts`: Manages Matrix JS SDK client lifecycle and authentication
- `MatrixEncryptionManager.ts`: Handles E2E encryption setup and verification

### Error Handling Patterns

1. **User Operation Error Handling**
   - Attempt Matrix operation
   - If token is invalid (M_UNKNOWN_TOKEN), refresh credentials or reprovision user
   - Retry the original operation
   - For rate limiting (M_LIMIT_EXCEEDED), log as warning and backoff gracefully

2. **Admin Operation Error Handling**
   - Ensure admin is in room before attempting operations
   - If admin token is invalid, regenerate using stored password
   - Retry the original operation with new token
   - Handle rate limiting with appropriate warning logs

### Local Development Quick Setup

```bash
# Start Matrix server
docker-compose -f docker-compose-dev.yml up -d

# Get admin token
docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"

# Update .env file with token and password
# MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
# MATRIX_ADMIN_PASSWORD=your_admin_password  # Required for token regeneration
```

## Implementation Status

- ✅ Core infrastructure and services
- ✅ Direct Matrix protocol real-time communication
- ✅ MAS (Matrix Authentication Service) integration
- ✅ User provisioning and authentication
- ✅ Room creation and management
- ✅ Service architecture optimization
- ✅ Admin token regeneration
- ✅ Robust room operation error handling
- ✅ E2E encryption support