# ATProtocol/Bluesky Integration Design

This document serves as the authoritative source of truth for the design and implementation of ATProtocol/Bluesky integration in OpenMeet. It consolidates and references information from various other design documents to provide a comprehensive overview.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Introduction and Overview](#introduction-and-overview)
- [Key Design Principles](#key-design-principles)
- [Architecture Components](#architecture-components)
  - [1. Authentication Components](#1-authentication-components)
  - [2. Profile Management Components](#2-profile-management-components)
  - [3. Event Synchronization Components](#3-event-synchronization-components)
  - [4. Shadow User Components](#4-shadow-user-components)
  - [5. Group Synchronization Components](#5-group-synchronization-components)
- [User Authentication Flow](#user-authentication-flow)
- [Event Synchronization](#event-synchronization)
  - [1. OpenMeet → Bluesky](#1-openmeet--bluesky)
  - [2. Bluesky → OpenMeet](#2-bluesky--openmeet)
  - [3. RSVP Synchronization](#3-rsvp-synchronization)
- [Shadow Account Management](#shadow-account-management)
  - [1. Account Creation Process](#1-account-creation-process)
  - [2. Architectural Principles](#2-architectural-principles)
- [Data Models](#data-models)
  - [1. User Entity](#1-user-entity)
  - [2. Event Entity](#2-event-entity)
  - [3. BlueskyProfile DTOs](#3-blueskyprofile-dtos)
- [Implementation Status](#implementation-status)
  - [Completed](#completed)
  - [In Progress](#in-progress)
  - [Planned](#planned)
- [Minimum Viable Implementation](#minimum-viable-implementation)
  - [MVI Components](#mvi-components)
  - [MVI Benefits](#mvi-benefits)
- [Event Integration Interface Design](#event-integration-interface-design)
  - [Problem Statement](#problem-statement)
  - [Design Decision](#design-decision)
  - [Benefits](#benefits)
  - [Implementation Status](#implementation-status-1)
  - [Implementation Plan](#implementation-plan)
  - [References](#references)
- [Comprehensive Event Ingestion Flow Architecture](#comprehensive-event-ingestion-flow-architecture)
  - [Architecture Components](#architecture-components-1)
  - [Event Processing Flow](#event-processing-flow)
  - [Data Flow Diagram](#data-flow-diagram)
  - [Error Handling Strategy](#error-handling-strategy)
- [Group Integration (AT Protocol)](#group-integration-at-protocol)
  - [Overview](#overview)
  - [Group Identity Model](#group-identity-model)
  - [Membership Model](#membership-model)
  - [Group Events](#group-events)
  - [Leadership and Governance](#leadership-and-governance)
  - [Future: Threshold Signing](#future-threshold-signing)
- [Community Lexicon Adoption](#community-lexicon-adoption)
- [Data Flow Patterns](#data-flow-patterns)
- [OpenMeet Custodial PDS](#openmeet-custodial-pds)
- [References](#references-1)

## Introduction and Overview

OpenMeet integrates with the AT Protocol (specifically Bluesky) to enable decentralized identity and event management. This integration allows users to:

- Log in using their Bluesky accounts
- Publish events created in OpenMeet to their Bluesky PDS
- Discover events from the Bluesky network
- Maintain synchronized event attendance across platforms

The AT Protocol, being decentralized, presents unique challenges and opportunities that this design addresses.

## Key Design Principles

1. **Source of Truth Management**

   The source of truth depends on the user type and data ownership:

   | User Type | Data Type | Source of Truth | OpenMeet Role |
   |-----------|-----------|-----------------|---------------|
   | Bluesky user | User's own data (RSVPs, memberships, posts) | User's PDS | Cache/Index |
   | Bluesky user | Events they create | User's PDS | Cache/Index |
   | Email/OAuth user (with custodial PDS) | Public data | OpenMeet PDS | Authoritative + Custodial |
   | Email/OAuth user (with custodial PDS) | Private data | OpenMeet PostgreSQL | Authoritative |
   | ATProto-enabled Group | Group profile, events, governance | Group's PDS | Cache/Index |
   | Non-ATProto Group | All group data | OpenMeet PostgreSQL | Authoritative |

   **Key Principles:**
   - **For Bluesky users**: Write to PDS first, cache locally second
   - **For custodial users**: OpenMeet writes to PDS on their behalf (see [OpenMeet Custodial PDS](#openmeet-custodial-pds))
   - **On conflict**: PDS wins, update local cache
   - **Firehose subscription**: Keeps cache synchronized with external changes
   - **User data portability**: Users can verify their data exists in their PDS independent of OpenMeet
   - **Clear origin tracking**: `sourceType`, `sourceId`, `sourceCid` fields track data provenance
   - **Private content**: Stays in PostgreSQL only (AT Protocol repos are public)

2. **Decentralized Identity**
   - Support for multiple PDSes, not just bsky.social
   - Proper DID and handle resolution
   - Profile data syncing with respect for user privacy
   - Group DIDs for collective identity (planned)

3. **Shadow Account Architecture**
   - Lightweight provisional accounts for event creators discovered via Bluesky
   - Secure attribution with minimal information storage
   - Seamless account claiming when users join OpenMeet

4. **Robust Synchronization**
   - Bidirectional event and RSVP syncing
   - Deduplication to prevent duplicate event creation
   - Graceful degradation when Bluesky services are unavailable
   - Periodic reconciliation to ensure cache consistency

5. **Hybrid User Support**
   - Full functionality for non-Bluesky users (email, OAuth)
   - **All users get AT Protocol identities** via custodial PDS (see [OpenMeet Custodial PDS](#openmeet-custodial-pds))
   - Users can take ownership of their PDS account (password reset → self-custody)
   - Migration path: custodial account → self-custody when Tranquil supports social login

## Architecture Components

The integration consists of several key components:

### 1. Authentication Components

- **OAuth Flow**: Handles user authentication with Bluesky's PDS
- **Token Management**: Securely stores and refreshes authentication tokens
- **Session Handling**: Manages user sessions and handles reconnection

### 2. Profile Management Components

- **Profile Synchronization**: Keeps user profile data in sync between platforms
- **Public Profile Resolution**: Allows lookup of any ATProtocol handle or DID
- **Enhanced Profile**: Provides rich user profile data for OpenMeet users

### 3. Event Synchronization Components

- **Firehose Consumer**: Captures calendar events from the Bluesky network
- **Event Processor**: Maps Bluesky events to OpenMeet's format
- **Event Publisher**: Publishes OpenMeet events to Bluesky
- **Deduplication Service**: Prevents duplicate events
- **Event Sync Service**: Manages bidirectional event synchronization using a strategy pattern 
- **Sync Strategy Factory**: Creates appropriate sync strategies for different source types

### 4. Shadow User Components

- **Shadow Account Service**: Creates and manages lightweight accounts
- **Series Detection**: Identifies potential recurring patterns from individual events
- **Account Claiming**: Transfers ownership when shadow users register

### 5. Group Synchronization Components (Planned)

- **Group DID Management**: Creates and manages DIDs for AT Protocol-enabled groups
- **Group Profile Sync**: Synchronizes group profile data between Group PDS and OpenMeet
- **Membership Sync**: Tracks membership records from user PDSes via firehose
- **Group Event Sync**: Manages events owned by groups (stored in group's PDS)
- **Governance Sync**: Tracks leadership and governance records

## User Authentication Flow

The Bluesky login flow follows these steps:

1. **Authentication Initiation**
   - User clicks "Login with Bluesky" button
   - User enters their Bluesky handle
   - System redirects to the appropriate PDS OAuth endpoint

2. **PDS Authentication**
   - User authenticates with their PDS
   - OAuth requests `transition:email` scope for email access
   - PDS returns accessJwt, refreshJwt, DID, handle, and email (if granted)

3. **Email Handling and Verification from OAuth**
   - System retrieves email and `emailConfirmed` flag from OAuth session
   - OAuth provider (Bluesky) is the source of truth for email verification
   - **Account status is determined by email verification state**

   **For new users:**
   - **Verified email** (`emailConfirmed: true`): User created as **ACTIVE**
   - **Unverified email** (`emailConfirmed: false`): User created as **INACTIVE**
     - Must verify email to become ACTIVE
     - Follows Quick RSVP pattern for consistency
   - **No email provided**: User created as **INACTIVE**
     - Cannot send notifications without email
     - Must add and verify email to become ACTIVE

   **For existing users without email:**
   - OAuth provides **verified email** (`emailConfirmed: true`):
     - Email saved to database
     - If INACTIVE → set to ACTIVE
     - If ACTIVE → stays ACTIVE
   - OAuth provides **unverified email** (`emailConfirmed: false`):
     - Email saved to database
     - User set to INACTIVE (even if previously ACTIVE)
     - Must complete email verification to regain ACTIVE status

   **For existing users with email:**
   - OAuth provides **different verified email**:
     - Old email replaced with new verified email
     - OAuth provider is source of truth
     - Status unchanged
   - OAuth provides **different unverified email**:
     - Old email preserved (not replaced)
     - Unverified emails don't override existing verified emails
   - OAuth provides **same email**:
     - No update needed
     - Status unchanged

   **Email Verification Flow (for unverified emails):**
   - System sends 6-digit verification code via email
   - Code expires after 15 minutes
   - Upon successful verification:
     - User status: INACTIVE → ACTIVE
     - Full account access granted
   - Uses existing `EmailVerificationCodeService`
   - Follows Quick RSVP verification pattern

   **Account Status Rules:**
   - **INACTIVE**: No email OR unverified email
   - **ACTIVE**: Verified email (from OAuth or manual verification)

4. **Account Linking**
   - System checks if a user with the DID exists
   - If exists: Links the existing OpenMeet account (and updates email if needed)
   - If not: Creates a new OpenMeet account (with email if provided)
   - Checks for shadow accounts to claim

5. **Token Storage**
   - Tokens stored in Redis with proper expiration
   - Key pattern: `bluesky:session:${did}`
   - Automatic refresh mechanism for expired tokens

**Implementation Details:**
- Email and emailConfirmed retrieval: `auth-bluesky.service.ts:94-119`
- Email verification status handling: `user.service.ts:438-551`
- Account status determination: `user.service.ts:530-551`
- Unit tests for email handling: `user.service.spec.ts:604-1023`
- Unit tests for emailConfirmed: `user.service.spec.ts:1026-1500`
- SocialInterface with emailConfirmed: `social/interfaces/social.interface.ts`
- Related issue: #336 (Email retrieval and verification from Bluesky OAuth)

Reference: [Bluesky Login Flow Redesign](/design-notes/matrix/bluesky-login-flow.md)

## Event Synchronization

### 1. OpenMeet → Bluesky

When publishing events from OpenMeet to Bluesky:

1. **Event Preparation**
   - Map OpenMeet event data to AT Protocol format
   - Convert event type and status to Bluesky equivalents
   - Generate a unique record key (rkey)

2. **Publication Process**
   - Use the user's authenticated Agent to create the event record
   - Store the returned CID and URI in the OpenMeet event
   - Handle successful publication feedback to the user

3. **For Recurring Events**
   - Publish only the next upcoming occurrence
   - Include metadata indicating it's part of a series
   - Add links to the full series on OpenMeet
   - Update the published occurrence as time progresses

### 2. Bluesky → OpenMeet

When ingesting events from Bluesky:

1. **Firehose Monitoring**
   - Filter the firehose for calendar event operations
   - Extract event data and creator information
   - Send to RabbitMQ for processing

2. **Event Processing**
   - Map the Bluesky format to OpenMeet's model
   - Check for duplicates using CID/URI/checksum
   - Create or update the event in OpenMeet

3. **Series Detection**
   - Analyze ingested events for recurring patterns
   - Group potentially related events
   - Suggest series creation when patterns are detected

4. **Event Synchronization Strategy**
   - Implemented using a strategy pattern for different source types
   - Fast initial response from database with asynchronous background sync
   - Timestamp comparison to detect and apply remote changes
   - Prevention of circular updates using skipBlueskySync flag
   - Event slug-based synchronization to ensure proper identification

5. **User-Initiated Sync**
   - Trigger comprehensive event sync when Bluesky users log in
   - Perform bidirectional synchronization of user's events
   - Handle both historical and future events
   - Apply conflict resolution with ATProtocol as source of truth
   - Implement loop detection to prevent circular updates
   - Respect connection status (no updates to ATProtocol if disconnected)

### 3. RSVP Synchronization

RSVPs (event attendance records) are also synchronized between platforms:

1. **RSVP Ingestion (Bluesky → OpenMeet)**
   - Firehose consumer filters for RSVP operations
   - Processor extracts user and event references
   - Maps Bluesky status values to OpenMeet attendance statuses:
     - "interested" → Maybe
     - "going" → Confirmed
     - "notgoing" → Cancelled
   - Shadow accounts created for Bluesky users who haven't registered
   - Events located by their source attributes (sourceId, sourceType, cid, rkey, uri)
   - Attendee records created or updated using natural key (user + event)

2. **RSVP Processing Flow Implementation**
   - bsky-firehose-consumer detects RSVP operations from firehose
   - Filters for creates, updates, and deletes
   - Extracts user DID/handle, event reference, and status
   - Publishes structured message to RabbitMQ
   - bsky-event-processor consumes and maps to ExternalRsvpDto format
   - RsvpIntegrationService processes the RSVP:
     - Finds referenced event by source attributes
     - Creates or finds shadow account for the user
     - Maps RSVP status to OpenMeet status
     - Finds existing attendee record or creates a new one
     - Updates the status based on the RSVP
   - Metrics and detailed logging track processing performance

3. **User PDS RSVP Synchronization**
   - During user login, we can check the user's PDS for RSVPs
   - For each RSVP, find the corresponding event in OpenMeet
   - Create or update the attendance record accordingly
   - Handles both local and remote events

4. **RSVP Integration API**
   - Dedicated endpoint for RSVP ingestion (/integration/rsvps)
   - Uses same authentication mechanism as event integration
   - ExternalRsvpDto includes:
     - Event reference (eventSourceId, eventSourceType)
     - User reference (userDid, userHandle)
     - RSVP status and timestamp
     - Optional metadata for Bluesky-specific data

Reference: [ATProtocol Integration Guide](/design-notes/recurring-events/atprotocol-integration-guide.md)

## Shadow Account Management

For events discovered from users who haven't joined OpenMeet:

### 1. Account Creation Process

The shadow account process follows these steps:

1. **Discovery**
   - Event found via firehose from previously unknown creator
   - System extracts creator's DID and handle

2. **Lightweight Account Creation**
   - System creates minimal user record with:
     - DID stored as socialId
     - handle stored as firstName
     - provider set to 'bluesky'
     - isShadowAccount flag set to true
     - email set to null (shadow accounts don't have email)
   - Event is attributed to this new shadow account
   - Note: When shadow accounts are claimed, email is retrieved from OAuth (see User Authentication Flow)

3. **Account Claiming**
   - When a user logs in with Bluesky, system checks DIDs
   - If matching shadow account exists:
     - Transfer all event ownership
     - Merge profile data 
     - Delete the shadow account

4. **Identification**
   - Shadow accounts are identified by:
     - isShadowAccount flag
     - email is null
     - provider is 'bluesky'
   - UI clearly marks content from shadow accounts

### 2. Architectural Principles

The Shadow Account functionality follows a clear separation of concerns according to domain-driven design principles:

1. **Service Layer Responsibilities**
   - Contains all business logic and validation rules
   - Manages transaction boundaries for data consistency
   - Provides observability through logging and tracing
   - Coordinates with other domain services as needed
   - Works with repository abstractions for testability

2. **Controller Layer Responsibilities**
   - Handles HTTP request/response concerns only
   - Maps DTOs to domain models and back
   - Enforces access control via guards
   - Delegates all business logic to the service layer
   - Contains no business rules or complex logic

3. **DTO Layer Responsibilities**
   - Provides clear contract for API consumers
   - Handles validation and documentation
   - Separates internal domain model from external representation

This architectural approach provides several benefits:
- Improved testability through clear separation of concerns
- Ability to reuse shadow account logic from multiple entry points
- Consistent error handling and observability patterns
- Enhanced maintainability through single responsibility principle
- Clearer boundaries between infrastructure and domain logic

Reference: [Bluesky Integration Implementation Plan](/design-notes/recurring-events/bluesky-integration-implementation.md)

## Data Models

The existing data model is extended to support ATProtocol integration:

### 1. User Entity

Current implementation:
```typescript
// In UserEntity
email?: string;               // User's email address (may be null for users without email permission)
provider: string;             // 'bluesky', 'google', 'github', 'email'
socialId?: string;            // DID for Bluesky users

preferences: {
  bluesky?: {
    avatar?: string;
    did?: string;             // Bluesky DID (Decentralized Identifier)
    handle?: string;          // Bluesky handle (deprecated, resolved from DID)
    connected?: boolean;      // Whether Bluesky integration is active
    autoPost?: boolean;       // Auto-publish events to Bluesky
    disconnectedAt?: Date;
    connectedAt?: Date;
  };
}
```

**Email Handling:**
- Email may be `null`, empty string `''`, or literal string `'null'` for users created before email OAuth scope
- Email is automatically populated from OAuth when available during login
- Existing users without email get updated on subsequent logins (see User Authentication Flow)
- Email can be manually added via `/auth/collect-email` if OAuth doesn't provide it

Planned additions:
```typescript
// To be added to UserEntity
isShadowAccount: boolean; // Whether this is a provisional shadow account
```

### 4. UserAtprotoIdentity Entity (New)

Links users to their AT Protocol identity, supporting both custodial (OpenMeet-created) and self-custody (Bluesky) accounts:

```typescript
// userAtprotoIdentities table
interface UserAtprotoIdentity {
  id: number;
  userUlid: string;              // FK to users.ulid
  did: string;                   // AT Protocol DID (e.g., did:plc:xxx)
  handle: string | null;         // Cached handle (resolved from DID)
  pdsUrl: string;                // Which PDS hosts this identity
  pdsCredentials: EncryptedJson; // Encrypted {password} for custodial accounts
  isCustodial: boolean;          // true = OpenMeet created, false = user brought own
  createdAt: Date;
  updatedAt: Date;
}
```

**Data Examples:**

| User Type | did | isCustodial | pdsCredentials |
|-----------|-----|-------------|----------------|
| Google user | `did:plc:xxx` | `true` | `{encrypted}` |
| Bluesky user | `did:plc:yyy` | `false` | `null` |

See [OpenMeet Custodial PDS](#openmeet-custodial-pds) for implementation details.

### 2. Event Entity 

Already implemented:
```typescript
// In EventEntity
sourceType?: EventSourceType; // Includes 'bluesky'
sourceId?: string;            // Stores DID
sourceUrl?: string;           // Stores Bluesky event URL
sourceData?: any;             // JSONB field with Bluesky metadata
lastSyncedAt?: Date;          // Last synchronization timestamp
```

### 3. BlueskyProfile DTOs

For handling profile data:
```typescript
// For public profile lookups
interface BlueskyPublicProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  description?: string;
  pdsEndpoint: string;
  source: 'atprotocol-public';
}

// For enhanced profiles of OpenMeet users
interface BlueskyEnhancedProfile extends BlueskyPublicProfile {
  connected: boolean;
  connectedAt?: Date;
  userId: number;
}
```

## Implementation Status

### Completed

1. **Authentication Flow**
   - Bluesky OAuth login implementation
   - Token storage in Redis
   - Session management for API calls
   - Email retrieval from OAuth with `transition:email` scope
   - Email verification status handling (`emailConfirmed` flag)
   - Account status based on email verification (ACTIVE/INACTIVE)
   - Automatic email update for existing users
   - Email replacement when OAuth provides different verified email
   - Graceful handling when email permission not granted or unverified

2. **Event Publication**
   - Basic event publishing to Bluesky
   - Proper error handling and retries
   - Storage of external references

3. **Profile Management**
   - Public profile lookup via ATProtocol
   - Enhanced profiles for authenticated users
   - Profile data syncing from Bluesky

4. **Event Integration Flow**
   - Firehose consumer implementation for Bluesky event capture
   - Event processor service transforming and routing events
   - Enhanced server-side deduplication with multi-criteria matching
   - Comprehensive metrics and monitoring with Prometheus/Grafana
   - DELETE endpoint for integration events
   - Shadow account handling for Bluesky event creators

5. **RSVP Integration**
   - RSVP capture from Bluesky firehose
   - Integration/rsvps endpoint implementation
   - Shadow account creation for RSVP users
   - Mapping from Bluesky RSVP statuses to OpenMeet attendance statuses
   - Metrics for RSVP processing effectiveness

6. **Infrastructure Setup**
   - Kubernetes configurations for both bsky-firehose-consumer and bsky-event-processor
   - Enhanced monitoring with Grafana dashboards
   - Improved error handling with proper logging
   - Exponential backoff implementation for temporary errors

### In Progress

1. **Shadow Account Service Enhancements**
   - Account claiming process implementation
   - Profile synchronization improvements
   - Admin interface for shadow account management

2. **RSVP Handling Improvements**
   - RSVP deletion functionality
   - User PDS RSVP Synchronization development

3. **Recurrence Handling**
   - Strategy defined for publishing recurring events
   - Implementation of occurrence selection algorithm 
   - Next occurrence publishing logic

### Planned

1. **Improved Conflict Resolution**
   - Define field-specific conflict resolution policies
   - Implement reconciliation process for out-of-sync events
   - Add admin tools for manual conflict resolution

2. **Enhanced Series Detection**
   - Implement heuristics for identifying related events
   - Build similarity scoring for potential series members
   - Create UI for confirming series detection results

3. **Comprehensive Testing**
   - End-to-end tests for the event and RSVP ingestion pipeline
   - User profile navigation tests for shadow accounts
   - Integration tests for bidirectional event sync

4. **User-Initiated Event Sync**
   - Complete the `UserEventSyncService` for login-triggered syncs
   - Implement bidirectional sync with proper conflict resolution
   - Add user preferences for sync behavior
   - Create admin tools for monitoring and troubleshooting

5. **Event Sync Strategy Improvements**
   - Add unit tests for EventSyncService and BlueskyEventSyncStrategy
   - Add metrics for sync operations (success rate, time to sync)
   - Implement exponential backoff for sync failures
   - Implement sync status tracking in admin interface

6. **Group Integration (AT Protocol)**
   - Group DID creation and management
   - `community.lexicon.group.*` lexicon adoption
   - Membership sync (user PDS ↔ OpenMeet cache)
   - Group-owned events model (events in group's PDS)
   - Leadership and governance tracking
   - Firehose subscription for group-related collections
   - UI for enabling AT Protocol on existing groups

7. **Future: Threshold Signing for Groups**
   - FROST threshold signature integration for group key management
   - M-of-N leader approval for group operations
   - Signing ceremony coordination service
   - Leader rotation and key resharing
   - True decentralized group ownership

## Minimum Viable Implementation

To expedite delivery of the core integration features, we will focus initially on a Minimum Viable Implementation (MVI) approach. This allows us to quickly provide value while continuing to build out the complete architecture.

### MVI Components

1. **Basic Event Import from Bluesky**
   - Focused on reliable ingestion of events via the firehose
   - Core event data mapping for essential fields only
   - Simple deduplication based on source IDs

2. **Shadow Account Fundamentals**
   - Lightweight user records for Bluesky event creators
   - Essential identification via DIDs and handles
   - Visual indicators for shadow vs. regular accounts

3. **User Profile Navigation**
   - Basic API endpoints to fetch events by user
   - Fundamental user profile information from ATProtocol
   - Navigation between events and creator profiles

### MVI Benefits

- **Faster Time to Value**: Delivers core functionality quickly
- **User-Centric Approach**: Prioritizes features that directly enhance user experience
- **Incremental Complexity**: Builds a solid foundation before adding advanced features
- **Early Validation**: Allows testing of core architectural decisions
- **Focused Development**: Clearer short-term goals for the development team

After successfully implementing the MVI, we will incrementally add the more complex features like bidirectional sync, advanced conflict resolution, and series detection.

## Event Integration Interface Design

### Problem Statement

OpenMeet needs to ingest events from multiple external sources, including the Bluesky network and web scrapers. This requires a consistent approach to event ingestion that can handle different source formats, manage shadow accounts, and prevent duplicates.

### Design Decision

We will implement a dedicated Event Integration Interface with the following architecture:

1. **Independent Processor Services**
   - Separate processor services for different sources (e.g., `bsky-event-processor`, `web-scraper-processor`)
   - Each processor consumes from its own queue and handles source-specific transformations
   - Processors run independently from the main OpenMeet API for better scaling and fault isolation

2. **Unified Integration API Layer**
   - Create dedicated endpoints like `/api/integration/events` that accept events from any source
   - Implement service-to-service authentication for secure processor communication
   - Support batch processing for improved performance
   - Add source tracking and origin metadata

3. **Source-Specific Adaptations**
   - Handle Bluesky shadow accounts where needed
   - Implement source-specific validation rules
   - Maintain proper attribution and origin information

### Benefits

- **Consistency**: Single integration point for all external event sources
- **Efficiency**: Optimized for bulk operations and service-to-service communication
- **Separation of Concerns**: Clearly separates integration traffic from user-generated content
- **Extensibility**: Easy to add new source types without changing the core API

### Implementation Status

1. **Server-Side Deduplication (Completed)**
   - Enhanced `EventIntegrationService` with multi-criteria matching:
     - Primary method: Source ID and type
     - Secondary method: Source URL
     - Tertiary method: Metadata fields (CID and rkey specific to Bluesky)
   - Added detailed logging for matching logic
   - Comprehensive test suite for deduplication logic
   - Preserved legacy method for backward compatibility

2. **Integration API Endpoints (Completed)**
   - Created `/integration/events` endpoint for event ingestion
   - Added DELETE endpoint for integration events with sourceId and sourceType parameters
   - Implemented `/integration/rsvps` endpoint for RSVP processing
   - Enhanced security with ServiceKeyAuthGuard

3. **Processor Simplification (Completed)**
   - Removed client-side deduplication logic from processors
   - Standardized approach for creates, updates, and deletes
   - Improved error handling with exponential backoff

4. **Monitoring (Completed)**
   - Added comprehensive metrics for processing:
     - Counters for processed events by operation (create/update/delete)
     - Counters for deduplication matches by method
     - Histogram for processing duration
   - Created Grafana dashboard for event integration metrics

5. **Remaining Tasks**
   - Update `event-processor.service.ts` to use `/integration/events` endpoint
   - Complete RSVP deletion functionality
   - Implement end-to-end tests for the complete pipeline
   - Add admin tools for viewing and managing ingested events

### Implementation Plan

1. Define a common event ingestion format that supports all source types
2. Implement the integration API endpoints in OpenMeet API
3. Enhance the `ShadowAccountService` to support integration needs
4. Implement or adapt processor services for each source
5. Add monitoring and management tools specific to integrations

### References

1. [Bluesky Integration Implementation Plan](/design-notes/recurring-events/bluesky-integration-implementation.md)
2. [Event Series Implementation Guide](/design-notes/recurring-events/event-series-implementation-guide.md)

## Comprehensive Event Ingestion Flow Architecture

The event ingestion pipeline must handle various event sources with different data models and requirements. This section outlines the complete architecture for ingesting events from external sources like Bluesky and web scrapers.

### Architecture Components

1. **Event Processor Service**
   - Consumes events from RabbitMQ
   - Handles transformations from source formats
   - Routes to appropriate processing pipelines

2. **Integration API Layer in OpenMeet**
   - Provides authentication for service-to-service communication
   - Validates and normalizes incoming events
   - Coordinates the overall ingestion process

3. **Core Services Involved**:

   a. **ShadowAccountService**
   - Creates/manages shadow accounts for Bluesky users
   - Handles ownership attribution for ingested events

   b. **EventMappingService**
   - Maps source-specific formats to OpenMeet's event model
   - Handles field transformations and normalization
   - Extracts metadata for categorization

   c. **DeduplicationService**
   - Checks for duplicate events using CID/URI/fingerprinting
   - Implements conflict resolution strategies
   - Manages reconciliation for updated events

   d. **TenantRoutingService**
   - Determines which tenant(s) should receive the event
   - Applies tenant-specific processing rules
   - Handles cross-tenant visibility settings

   e. **EventValidationService**
   - Performs content validation and moderation
   - Ensures required fields are present and valid
   - Applies source-specific validation rules

   f. **CategoryMappingService**
   - Maps external categories to OpenMeet categories
   - Auto-assigns appropriate categories based on content
   - Creates temporary categories if needed

4. **Data Enrichment Layer**
   - Geocoding service for location normalization
   - Date/time normalization across timezones
   - Media processing for images/attachments
   - Metadata extraction for improved discovery

5. **Monitoring and Operations**
   - Detailed logging for ingestion steps
   - Metrics for throughput and processing time
   - Alert mechanisms for ingestion failures
   - Administrative interfaces for manual intervention

### Event Processing Flow

1. **Receive & Parse**: Event processor service consumes message from queue
2. **Source Identification**: Determine event source and processing rules
3. **Shadow Account Creation**: For Bluesky sources, create shadow accounts if needed
4. **Event Mapping**: Transform source-specific format to OpenMeet event model
5. **Deduplication**: Check if event already exists in the system
6. **Tenant Routing**: Determine target tenant(s) for the event
7. **Validation & Enrichment**: Validate and augment event data
8. **Persistence**: Store event in appropriate tenant database(s)
9. **Notification**: Trigger notifications or additional processing

### Data Flow Diagram

```
External Source → Firehose/Scraper → RabbitMQ → Event Processor
    → Integration API → Core Services → Data Storage
        → Post-Processing (indexing, notifications, etc.)
```

### Error Handling Strategy

1. **Retryable Errors**: Network issues, temporary unavailability
   - Implement exponential backoff retry logic
   - Return to queue after max retries with DLQ routing

2. **Data Errors**: Malformed data, validation failures
   - Log detailed error information
   - Store problematic event in error collection for manual review
   - Continue processing other events

3. **System Errors**: Database issues, service unavailability
   - Trigger alerts for operations team
   - Implement circuit breaker pattern to prevent cascading failures
   - Auto-recover when systems return to normal state

## Group Integration (AT Protocol)

This section describes the planned integration of AT Protocol groups into OpenMeet, enabling decentralized group ownership and interoperability with other AT Protocol applications.

### Overview

Groups on AT Protocol have their own DID (Decentralized Identifier), similar to users. This enables:
- Groups to own their identity independent of any single platform
- Group data (profile, events) to be stored in a group-controlled PDS
- Interoperability with other AT Protocol apps (e.g., Smoke Signal)
- Portability if a group decides to leave OpenMeet

### Group Identity Model

```
┌─────────────────────────────────────────────────────────────────┐
│ ATProto-Enabled Group                                           │
│                                                                 │
│ Group DID: did:plc:abc123...                                    │
│ Handle: @seattle-hikers.openmeet.net                            │
│                                                                 │
│ Group's PDS contains:                                           │
│ ├── community.lexicon.group.profile/self                        │
│ ├── community.lexicon.group.governance/self                     │
│ └── community.lexicon.calendar.event/* (group-owned events)     │
└─────────────────────────────────────────────────────────────────┘
```

**Two types of groups in OpenMeet:**

| Type | Source of Truth | AT Protocol Integration |
|------|-----------------|------------------------|
| Non-ATProto Group | OpenMeet PostgreSQL | None |
| ATProto-Enabled Group | Group's PDS | Full sync via firehose |

Groups can be upgraded from Non-ATProto to ATProto-enabled, creating a DID and migrating data to the group's PDS.

### Membership Model

Membership follows the "user-owned data" principle:

```
┌─────────────────────────────────────────────────────────────────┐
│ USER'S PDS (source of truth for their membership)               │
│                                                                 │
│ at://did:plc:carol/community.lexicon.group.membership/tid123    │
│ {                                                               │
│   group: {                                                      │
│     uri: "at://did:plc:group/...profile/self",                 │
│     cid: "bafy..."                                              │
│   },                                                            │
│   role: "member",                                               │
│   joinedAt: "2025-01-15T..."                                    │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ OPENMEET POSTGRESQL (cache/index)                               │
│                                                                 │
│ group_members:                                                  │
│   userId: 123                                                   │
│   groupId: 456                                                  │
│   role: 'member'                                                │
│   sourceType: 'bluesky'                                         │
│   sourceId: 'at://did:plc:carol/.../tid123'                    │
│   sourceCid: 'bafy...'                                          │
│   lastSyncedAt: timestamp                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Membership by user type:**

| User Type | Membership Source of Truth | Sync Behavior |
|-----------|---------------------------|---------------|
| Bluesky user | User's PDS | Write to PDS first, cache locally |
| Email/OAuth user | OpenMeet PostgreSQL | Local only (no PDS) |
| External Bluesky user | Their PDS | Discovered via firehose, cached |

### Group Events

Groups can own events directly (stored in group's PDS) or members can create events linked to the group:

**Group-Owned Events:**
```
at://did:plc:group/community.lexicon.calendar.event/tid
{
  name: "Monthly Meetup",
  startsAt: "...",
  createdBy: "did:plc:alice",  // which leader created it
  ...
}
```
- Stored in GROUP's PDS
- Requires leader permission to create
- Group controls editing/deletion

**Member-Created Events (linked to group):**
```
at://did:plc:alice/community.lexicon.calendar.event/tid
{
  name: "Casual Hike",
  startsAt: "...",
  hostGroup: { uri: "at://did:plc:group/...", cid: "..." },
  ...
}
```
- Stored in MEMBER's PDS
- Member controls their own event
- Group can moderate via labels

### Leadership and Governance

Groups have a governance record tracking leadership:

```
community.lexicon.group.governance/self
{
  leaders: ["did:plc:alice", "did:plc:bob", "did:plc:carol"],
  threshold: 2,  // for future threshold signing
  votingPeriodHours: 48,
  createdAt: "...",
  updatedAt: "..."
}
```

**Phase 1 (OpenMeet-managed):**
- OpenMeet holds the group's signing key
- Leaders are tracked in governance record
- OpenMeet enforces leader permissions

**Phase 2 (Threshold signing):**
- Group's signing key is split among leaders
- M-of-N leaders required to sign group operations
- True decentralized control

### Future: Threshold Signing

Using FROST (Flexible Round-Optimized Schnorr Threshold) signatures for decentralized group control:

```
┌─────────────────────────────────────────────────────────────────┐
│ THRESHOLD SIGNING (2-of-3 example)                              │
│                                                                 │
│ Group signing key split into 3 shares:                          │
│                                                                 │
│ ┌─────────┐    ┌─────────┐    ┌─────────┐                      │
│ │ Alice   │    │  Bob    │    │ Carol   │                      │
│ │ Share 1 │    │ Share 2 │    │ Share 3 │                      │
│ └─────────┘    └─────────┘    └─────────┘                      │
│                                                                 │
│ To sign a group operation (e.g., create event):                │
│ 1. Alice initiates signing request                             │
│ 2. Bob reviews and approves                                    │
│ 3. Alice + Bob participate in FROST protocol                   │
│ 4. Valid signature produced (key never reconstructed)          │
│ 5. Record published to group's PDS                             │
└─────────────────────────────────────────────────────────────────┘
```

**Library:** [@substrate-system/frost](https://github.com/substrate-system/frost) - TypeScript, RFC 9591 compliant

**Benefits:**
- No single point of control
- Group can migrate away from OpenMeet
- True collective ownership
- Cryptographic enforcement of governance

## Community Lexicon Adoption

OpenMeet uses community-standard lexicons from [lexicon-community](https://github.com/lexicon-community/lexicon) for interoperability:

### Currently Used

| Lexicon | Purpose | Status |
|---------|---------|--------|
| `community.lexicon.calendar.event` | Event records | Implemented |
| `community.lexicon.calendar.rsvp` | RSVP/attendance records | Implemented |

### Proposed for Groups

| Lexicon | Purpose | Status |
|---------|---------|--------|
| `community.lexicon.group.profile` | Group name, description, settings | Proposed |
| `community.lexicon.group.governance` | Leadership, threshold, voting rules | Proposed |
| `community.lexicon.group.membership` | User's membership in a group | Proposed |
| `community.lexicon.group.post` | Discussion posts within a group | Proposed |
| `community.lexicon.group.invite` | Invitations for private groups | Proposed |

These lexicons should be proposed to the lexicon-community for standardization to ensure interoperability with other AT Protocol applications.

## Data Flow Patterns

### Pattern 1: Bluesky User Joins Group

```
User clicks "Join Group" in OpenMeet
    │
    ├─► Is user a Bluesky user?
    │       │
    │       ├─► YES: Write to User's PDS first
    │       │       │
    │       │       ▼
    │       │   POST community.lexicon.group.membership
    │       │       │
    │       │       ▼
    │       │   PDS returns URI + CID
    │       │       │
    │       │       ▼
    │       │   Cache in PostgreSQL (sourceType: 'bluesky')
    │       │
    │       └─► NO: Write directly to PostgreSQL (sourceType: 'openmeet')
    │
    ▼
Success response to user
```

### Pattern 2: External User Joins via Another App

```
User joins group via Smoke Signal (not OpenMeet)
    │
    ▼
Smoke Signal writes membership to User's PDS
    │
    ▼
OpenMeet firehose consumer detects membership record
    │
    ▼
Check: Does this reference one of our groups?
    │
    ├─► YES:
    │       │
    │       ▼
    │   Create shadow account for user (if needed)
    │       │
    │       ▼
    │   Cache membership in PostgreSQL
    │       │
    │       ▼
    │   User appears as member in OpenMeet
    │
    └─► NO: Ignore (not our group)
```

### Pattern 3: Membership Deletion/Conflict

```
User deletes membership via another app
    │
    ▼
Firehose detects DELETE operation
    │
    ▼
Find cached record by sourceId
    │
    ▼
Delete from PostgreSQL cache
    │
    ▼
User no longer appears as member

─────────────────────────────────────────

Cache disagrees with PDS (conflict detected)
    │
    ▼
Fetch current state from PDS
    │
    ▼
PDS WINS - update cache to match
    │
    ▼
Log conflict for monitoring
```

### Pattern 4: Email User Later Connects Bluesky

```
Email user (local-only membership) connects Bluesky
    │
    ▼
User now has a PDS
    │
    ▼
Migrate local memberships to PDS:
    │
    ├─► For each membership with sourceType: 'openmeet':
    │       │
    │       ▼
    │   Create membership record in user's PDS
    │       │
    │       ▼
    │   Update PostgreSQL record:
    │       sourceType: 'bluesky'
    │       sourceId: at://...
    │       sourceCid: bafy...
    │
    ▼
User's data is now portable
```

## OpenMeet Custodial PDS

OpenMeet runs its own PDS to provide AT Protocol identities for users who sign up via Google, GitHub, or email. This makes OpenMeet a fully AT Protocol-native application.

### Decision Summary

| Aspect | Decision |
|--------|----------|
| **PDS Software** | Bluesky PDS initially, evaluate Tranquil later |
| **Handle Domain** | `*.opnmt.me` |
| **PDS Endpoint** | `pds.openmeet.net` |
| **Custody Model** | Custodial (OpenMeet holds password) → Self-custody (user takes ownership) |

### Why Run Our Own PDS?

**The Problem:** Half of OpenMeet's users authenticate via Google/GitHub OAuth. These users have no AT Protocol identity, so their events/RSVPs can't publish to the decentralized network.

**The Solution:** Create PDS accounts for non-Bluesky users transparently during login.

**Benefits:**
- **For users**: Data portability, cross-app visibility, self-sovereign identity
- **For OpenMeet**: Fully native ATProto application, competitive advantage

**Pattern established by:** Roomy, Tangled, Cosmik Network, Flashes (EuroSky)

### Account Creation Flow

```
User logs in with Google
    │
    ├─► Check: user has atproto identity?
    │
    ├─► YES: Continue normally
    │
    └─► NO: Create custodial PDS account
              │
              ├── Generate handle: {slug}.opnmt.me
              ├── Generate secure password
              ├── POST /xrpc/com.atproto.server.createAccount
              ├── Store in userAtprotoIdentities (encrypted)
              └── User now has DID, can publish to AT network
```

### Database Schema

```sql
CREATE TABLE "userAtprotoIdentities" (
  "id" SERIAL PRIMARY KEY,
  "userUlid" CHAR(26) NOT NULL,
  "did" VARCHAR(255) NOT NULL UNIQUE,
  "handle" VARCHAR(255) NULL,
  "pdsUrl" VARCHAR(255) NOT NULL,
  "pdsCredentials" JSONB NULL,        -- Encrypted {password}
  "isCustodial" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT "FK_userAtprotoIdentities_userUlid"
    FOREIGN KEY ("userUlid") REFERENCES "users"("ulid") ON DELETE CASCADE,
  CONSTRAINT "UQ_userAtprotoIdentities_userUlid" UNIQUE ("userUlid")
);

CREATE INDEX "IDX_userAtprotoIdentities_did" ON "userAtprotoIdentities"("did");
```

### Key Services

| Service | Purpose |
|---------|---------|
| `PdsAccountService` | Create accounts, sessions, check handle availability |
| `PdsCredentialService` | Encrypt/decrypt PDS passwords (AES-256-GCM) |
| `UserAtprotoIdentityService` | CRUD for identity records |

### Custody Transition

**Short term (Custodial):**
- OpenMeet holds the PDS password
- User can't directly access their PDS
- Escape hatch: Profile → "Request PDS Access" → Password reset → User takes ownership

**Long term (Self-Custody via Tranquil #5):**
- When Tranquil supports social login, user links Google/GitHub to PDS directly
- OpenMeet uses AT Protocol OAuth (like Bluesky users today)
- `pdsCredentials` cleared, `isCustodial=false`
- User has full ownership

### Private Content Handling

AT Protocol repos are public. Private content cannot go to PDS.

| Visibility | Storage |
|------------|---------|
| Public events | PDS + PostgreSQL |
| Unlisted/Private events | PostgreSQL only |
| Private groups | PostgreSQL only |

## References

### Internal Documents
1. [ATProtocol Integration Guide](/design-notes/recurring-events/atprotocol-integration-guide.md)
2. [Bluesky Integration Implementation Plan](/design-notes/recurring-events/bluesky-integration-implementation.md)
3. [Bluesky Login Flow Redesign](/design-notes/matrix/bluesky-login-flow.md)
4. [Bluesky Event Sync](/design-notes/bsky-event-sync.md)
5. [Event Series Implementation Guide](/design-notes/recurring-events/event-series-implementation-guide.md)
6. [Main Design Document](/design-notes/recurring-events/main-design-document.md)

### External Resources - Groups on AT Protocol
7. [Representing Groups and Shared Resources in ATProto](https://discourse.atprotocol.community/t/representing-groups-and-other-shared-resources-in-atproto/296) - Community discussion on group design patterns
8. [AT Namespaces for Community Spaces](https://bnewbold.leaflet.pub/3m2x7bilyrc23) - Bryan Newbold's analysis of group identity options
9. [lexicon-community/lexicon](https://github.com/lexicon-community/lexicon) - Community lexicon repository (events, RSVPs, locations)
10. [SmokeSignal-Events](https://smokesignal.events/) - Another AT Protocol events app for interoperability testing

### External Resources - Threshold Signatures
11. [@substrate-system/frost](https://github.com/substrate-system/frost) - TypeScript FROST implementation (RFC 9591)
12. [RFC 9591 - FROST Protocol](https://www.rfc-editor.org/rfc/rfc9591.html) - FROST threshold signature specification