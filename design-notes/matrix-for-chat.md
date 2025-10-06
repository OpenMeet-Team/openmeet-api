# Matrix Integration for OpenMeet Chat

> **NOTE:** This document has been split into multiple files for better organization.
> Please see the `/design-notes/matrix/` directory for detailed documentation.

## Matrix Documentation Directory

The Matrix integration documentation has been organized into the following files:

- [**README.md**](./matrix/README.md) - Quick start guide and key reference
- [**matrix-architecture.md**](./matrix/matrix-architecture.md) - High-level architecture overview with MAS + Application Service bot model
- [**matrix-implementation.md**](./matrix/matrix-implementation.md) - Detailed service architecture and implementation patterns
- [**matrix-operations.md**](./matrix/matrix-operations.md) - Local development setup, testing, monitoring, and troubleshooting
- [**matrix-bot-architecture.md**](./matrix/matrix-bot-architecture.md) - Bot creation and configuration details
- [**client-side-matrix-integration.md**](./matrix/client-side-matrix-integration.md) - Client-side architecture and integration design
- [**mas-deployment-integration.md**](./matrix/mas-deployment-integration.md) - MAS deployment configurations for Docker Compose and CI
- [**mas-authentication-flows.md**](./matrix/mas-authentication-flows.md) - MAS authentication flow details
- [**matrix-bot-invitation-flows.md**](./matrix/matrix-bot-invitation-flows.md) - Bot invitation flow documentation
- [**matrix-authentication-service-integration.md**](./matrix/matrix-authentication-service-integration.md) - MAS integration overview

## Implementation Status (September 2025)

The Matrix integration is fully implemented and deployed in production:

- ✅ Matrix Authentication Service (MAS) with OIDC delegation to OpenMeet
- ✅ Client-side Matrix SDK integration (no WebSocket proxy)
- ✅ Application Service bot for room management
- ✅ Real-time messaging via direct Matrix protocol
- ✅ E2E encryption support
- ✅ Automatic room creation for events and groups

## Quick Reference

- Matrix rooms are created automatically when events or groups are created
- Each event and group has a dedicated Matrix room with appropriate permissions
- Matrix user accounts are authenticated via MAS (Matrix Authentication Service)
- Real-time messages are delivered directly via Matrix protocol (client to Matrix server)
- Room identifiers use slugs to ensure uniqueness
- Application Service bot manages room creation and permissions

For detailed information, please refer to the documents in the `./matrix/` directory.