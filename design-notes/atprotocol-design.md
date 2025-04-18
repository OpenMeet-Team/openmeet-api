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
- [User Authentication Flow](#user-authentication-flow)
- [Event Synchronization](#event-synchronization)
  - [1. OpenMeet → Bluesky](#1-openmeet--bluesky)
  - [2. Bluesky → OpenMeet](#2-bluesky--openmeet)
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
- [Event Integration Interface Design](#event-integration-interface-design)
  - [Problem Statement](#problem-statement)
  - [Design Decision](#design-decision)
  - [Benefits](#benefits)
  - [Implementation Plan](#implementation-plan)
  - [References](#references)
- [Comprehensive Event Ingestion Flow Architecture](#comprehensive-event-ingestion-flow-architecture)
  - [Architecture Components](#architecture-components-1)
  - [Event Processing Flow](#event-processing-flow)
  - [Data Flow Diagram](#data-flow-diagram)
  - [Error Handling Strategy](#error-handling-strategy)
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
   - Bluesky PDS is the source of truth for Bluesky-created events
   - OpenMeet is the source of truth for locally-created events
   - Clear origin tracking for conflict resolution

2. **Decentralized Identity**
   - Support for multiple PDSes, not just bsky.social
   - Proper DID and handle resolution
   - Profile data syncing with respect for user privacy

3. **Shadow Account Architecture**
   - Lightweight provisional accounts for event creators discovered via Bluesky
   - Secure attribution with minimal information storage
   - Seamless account claiming when users join OpenMeet

4. **Robust Synchronization**
   - Bidirectional event and RSVP syncing
   - Deduplication to prevent duplicate event creation
   - Graceful degradation when Bluesky services are unavailable

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

### 4. Shadow User Components

- **Shadow Account Service**: Creates and manages lightweight accounts
- **Series Detection**: Identifies potential recurring patterns from individual events
- **Account Claiming**: Transfers ownership when shadow users register

## User Authentication Flow

The Bluesky login flow follows these steps:

1. **Authentication Initiation**
   - User clicks "Login with Bluesky" button
   - User enters their Bluesky handle
   - System redirects to the appropriate PDS OAuth endpoint

2. **PDS Authentication**
   - User authenticates with their PDS
   - PDS returns accessJwt, refreshJwt, DID, and handle

3. **Account Linking**
   - System checks if a user with the DID exists
   - If exists: Links the existing OpenMeet account
   - If not: Creates a new OpenMeet account
   - Checks for shadow accounts to claim

4. **Token Storage**
   - Tokens stored in Redis with proper expiration
   - Key pattern: `bluesky:session:${did}`
   - Automatic refresh mechanism for expired tokens

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
     - email set to null
   - Event is attributed to this new shadow account

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
preferences: {
  bluesky?: {
    avatar?: string;
    did?: string;
    handle?: string;
    connected?: boolean;
    autoPost?: boolean;
    disconnectedAt?: Date;
    connectedAt?: Date;
  };
}
```

Planned additions:
```typescript
// To be added to UserEntity
isShadowAccount: boolean; // Whether this is a provisional shadow account
```

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

2. **Event Publication**
   - Basic event publishing to Bluesky
   - Proper error handling and retries
   - Storage of external references

3. **Profile Management**
   - Public profile lookup via ATProtocol
   - Enhanced profiles for authenticated users
   - Profile data syncing from Bluesky

### In Progress

1. **Shadow Account Service**
   - Design complete, implementation in progress
   - Need to add `isShadowAccount` flag to UserEntity
   - Need to implement account claiming process

2. **Event Ingestion**
   - Firehose consumer architecture defined
   - Need to improve event mapping and deduplication
   - Series detection algorithm to be implemented

3. **Recurrence Handling**
   - Strategy defined for publishing recurring events
   - Implementation of occurrence selection algorithm needed
   - Next occurrence publishing logic to be added

### Planned

1. **Improved Conflict Resolution**
   - Define field-specific conflict resolution policies
   - Implement reconciliation process for out-of-sync events
   - Add admin tools for manual conflict resolution

2. **Enhanced Series Detection**
   - Implement heuristics for identifying related events
   - Build similarity scoring for potential series members
   - Create UI for confirming series detection results

3. **Comprehensive Monitoring**
   - Add metrics for sync quality and performance
   - Create dashboards for monitoring sync status
   - Implement alerting for sync failures

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

## References

1. [ATProtocol Integration Guide](/design-notes/recurring-events/atprotocol-integration-guide.md)
2. [Bluesky Integration Implementation Plan](/design-notes/recurring-events/bluesky-integration-implementation.md)
3. [Bluesky Login Flow Redesign](/design-notes/matrix/bluesky-login-flow.md)
4. [Bluesky Event Sync](/design-notes/bsky-event-sync.md)
5. [Event Series Implementation Guide](/design-notes/recurring-events/event-series-implementation-guide.md)
6. [Main Design Document](/design-notes/recurring-events/main-design-document.md)