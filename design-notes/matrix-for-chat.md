# Matrix Integration for OpenMeet Chat

> **NOTE:** This document has been split into multiple files for better organization.
> Please see the `/design-notes/matrix/` directory for detailed documentation.

## Matrix Documentation Directory

The Matrix integration documentation has been reorganized into multiple files:

- [**overview.md**](./matrix/overview.md) - General overview of the Matrix integration
- [**user-experience.md**](./matrix/user-experience.md) - User-facing changes and improvements
- [**technical-implementation.md**](./matrix/technical-implementation.md) - Technical architecture and implementation details
- [**client-implementation.md**](./matrix/client-implementation.md) - Client-side implementation specifics
- [**phases.md**](./matrix/phases.md) - Implementation phases and progress
- [**fixes.md**](./matrix/fixes.md) - Important fixes and improvements including:
  - Room creation with slug instead of name
  - Power level assignment for event attendees
  - WebSocket tenant ID handling
  - Matrix SDK ESM compatibility

## Recent Updates (March 2025)

The most recent update to the Matrix integration includes a critical fix for power level assignment. Previously, the first user to attend an event was automatically being granted moderator privileges (power level 50) even if they were just a regular member.

The fix modifies the permission logic to ensure that only users with appropriate roles (Host or Moderator) AND the necessary permissions (ManageEvent) receive moderator privileges in Matrix rooms. This prevents regular attendees from getting elevated permissions unintentionally.

See [fixes.md](./matrix/fixes.md) for detailed information about this and other important fixes.

## Quick Reference

- Matrix rooms are created automatically when events or groups are created
- Each event and group has a dedicated Matrix room with appropriate permissions
- Matrix user accounts are automatically provisioned for platform users
- Real-time messages are delivered through WebSockets
- Room identifiers use slugs to ensure uniqueness

For detailed information, please refer to the documents in the `./matrix/` directory.