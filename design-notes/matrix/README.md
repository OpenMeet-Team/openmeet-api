# Matrix Integration for OpenMeet

This directory contains streamlined documentation for the Matrix chat integration in OpenMeet. The documentation is organized into three core documents:

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

3. [Matrix Operations](./matrix-operations.md)
   - Local development setup
   - Testing strategies and checklists
   - Monitoring approaches
   - Troubleshooting common issues
   - Reset procedures
   - Migration strategy

## Quick Start

For developers new to the Matrix integration:

1. Read [Matrix Architecture](./matrix-architecture.md) first to understand the overall design
2. Review [Matrix Implementation](./matrix-implementation.md) for technical details
3. Use [Matrix Operations](./matrix-operations.md) for practical setup and testing guidance

## Key Reference

### Important Methods

- `MatrixUserService.provisionMatrixUser()`: User provisioning with credential management
- `ChatRoomService.ensureUserHasMatrixCredentials()`: Credential validation and provisioning
- `MatrixGateway.broadcastRoomEvent()`: Real-time event broadcasting

### Credential Error Handling Pattern

```typescript
try {
  // Attempt Matrix operation
} catch (error) {
  if (error.errcode === 'M_UNKNOWN_TOKEN') {
    // Refresh credentials or reprovision user
    await this.handleCredentialRefresh(userId);
    // Retry original operation
  } else {
    // Handle other errors
  }
}
```

### Local Development Quick Setup

```bash
# Start Matrix server
docker-compose -f docker-compose-dev.yml up -d

# Get admin token
docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"

# Update .env file with token
# MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
```

## Implementation Status

- ✅ Core infrastructure and services
- ✅ WebSocket real-time communication
- ✅ User provisioning and authentication
- ✅ Room creation and management
- ✅ Service architecture optimization
- ✅ Credential management improvements
- 🚧 Comprehensive testing in progress