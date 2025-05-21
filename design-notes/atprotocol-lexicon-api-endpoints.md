# System Design Document: AT Protocol Lexicon API Endpoints

## Overview
This document outlines a design for implementing OpenMeet's event API endpoints as AT Protocol lexicons, enabling better interoperability with the broader AT Protocol ecosystem and allowing applications to directly query OpenMeet event data using standardized formats.

## Business Context
- **Problem statement**: Currently, OpenMeet integrates with AT Protocol by consuming and producing lexicons for Bluesky integration, but doesn't expose its own API as lexicons. This limits the ability of AT Protocol clients to discover and query OpenMeet events.
- **User request**: "Could it be possible for you to implement end points such as /api/events as lexicons in order to ease the use of your API? It could be community.lexicon.calendar.getEvents if we consider this should be implemented by apps to give access to their resolvers."
- **Integration opportunity**: By exposing our API endpoints as lexicons, we can make OpenMeet events directly accessible via XRPC and position the platform as a resolver within the federated AT Protocol data ecosystem.

## Goals & Success Metrics
- Implement key event-related APIs as AT Protocol lexicons with XRPC endpoints
- Maintain compatibility with existing OpenMeet API clients
- Enable AT Protocol clients to discover and query OpenMeet events
- Measure adoption through tracking of XRPC endpoint usage

## System Requirements

### Functional Requirements
- Create lexicon definitions for core event operations (query, create, update)
- Implement XRPC endpoints that map to these lexicons
- Support pagination, filtering, and sorting in query operations
- Enable authentication via both AT Protocol and existing OpenMeet methods
- Maintain bidirectional synchronization between internal models and lexicon formats

### Non-Functional Requirements
- Performance must be comparable to the existing REST API
- Must handle the same scale and load as current endpoints
- Security must be maintained with proper authorization checks
- Documentation should clearly explain the lexicon-based approach

## Technical Design

### Architecture
The implementation will add a new AT Protocol lexicon layer to the existing architecture:

1. **New XRPC Endpoint Layer**
   - Implements the AT Protocol XRPC protocol for queries and procedures
   - Routes requests to existing OpenMeet services
   - Handles AT Protocol-specific authentication

2. **Lexicon Definition Files**
   - Define the schemas for event-related operations
   - Follow AT Protocol standards for NSIDs, revisions, etc.
   - Support all core event operations

3. **Integration with Existing Architecture**
   - Reuse existing service layer logic
   - Maintain data consistency with current APIs
   - Support both traditional REST and new XRPC endpoints

### Implementation Details

#### Lexicon Definitions

We will create the following key lexicons:

1. **community.lexicon.calendar.getEvents (Query)**
```json
{
  "lexicon": 1,
  "id": "community.lexicon.calendar.getEvents",
  "revision": 1,
  "description": "Get events matching specified criteria",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "properties": {
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          },
          "startAfter": {
            "type": "string",
            "format": "datetime"
          },
          "startBefore": {
            "type": "string",
            "format": "datetime"
          },
          "categoryId": {
            "type": "string"
          },
          "creatorDid": {
            "type": "string",
            "format": "did"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["events"],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "events": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "community.lexicon.calendar.event#main"
              }
            }
          }
        }
      }
    }
  }
}
```

2. **community.lexicon.calendar.createEvent (Procedure)**
```json
{
  "lexicon": 1,
  "id": "community.lexicon.calendar.createEvent",
  "revision": 1,
  "description": "Create a new calendar event",
  "defs": {
    "main": {
      "type": "procedure",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["name", "startsAt"],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 500
            },
            "description": {
              "type": "string",
              "maxLength": 5000
            },
            "startsAt": {
              "type": "string",
              "format": "datetime"
            },
            "endsAt": {
              "type": "string",
              "format": "datetime"
            },
            "location": {
              "type": "union",
              "refs": [
                "community.lexicon.calendar.physicalLocation",
                "community.lexicon.calendar.virtualLocation"
              ]
            },
            "tags": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "isRecurring": {
              "type": "boolean"
            },
            "rrule": {
              "type": "string",
              "description": "RFC 5545 recurrence rule"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["uri", "cid"],
          "properties": {
            "uri": {
              "type": "string",
              "format": "at-uri"
            },
            "cid": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```

3. **community.lexicon.calendar.getEventAttendees (Query)**
```json
{
  "lexicon": 1,
  "id": "community.lexicon.calendar.getEventAttendees",
  "revision": 1,
  "description": "Get attendees for an event",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": ["eventUri"],
        "properties": {
          "eventUri": {
            "type": "string",
            "format": "at-uri"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50
          },
          "cursor": {
            "type": "string"
          },
          "attendanceStatus": {
            "type": "string",
            "enum": ["going", "interested", "notgoing"]
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["attendees"],
          "properties": {
            "cursor": {
              "type": "string"
            },
            "attendees": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "community.lexicon.calendar.rsvp#main"
              }
            }
          }
        }
      }
    }
  }
}
```

#### Implementation Approach

1. **XRPC API Layer**:
   - Create a new module `AtProtocolXrpcModule` to handle XRPC requests
   - Implement the `/xrpc/:lexiconId` route pattern
   - Route requests to the appropriate controller methods
   - Handle lexicon-specific validation and error responses

2. **Adapter Services**:
   - Create `LexiconAdapterService` to map between OpenMeet models and lexicon formats
   - Reuse existing business logic in current services like `EventService`
   - Handle pagination cursors in the AT Protocol format

3. **Authentication Integration**:
   - Support AT Protocol DID-based authentication
   - Map DIDs to OpenMeet user accounts
   - Maintain shadow account logic for unknown DIDs

### Security & Compliance

1. **Authorization**:
   - Maintain existing permission checks for events
   - Add AT Protocol-specific permission checks as needed
   - Ensure proper tenant isolation in multi-tenant scenarios

2. **Data Protection**:
   - Apply the same privacy rules as the current API
   - Respect event visibility settings (public, private, etc.)
   - Ensure that sensitive user data is not exposed

## Testing Strategy

1. **Unit Testing**:
   - Test lexicon adapter services for correct mapping
   - Test XRPC route handlers for correct behavior
   - Validate lexicon schema compliance

2. **Integration Testing**:
   - Test end-to-end flows using AT Protocol clients
   - Verify bidirectional data consistency
   - Test authentication and authorization scenarios

3. **Performance Testing**:
   - Compare performance with existing REST API
   - Ensure scalability under load
   - Test pagination with large datasets

## Deployment Strategy

1. **Phased Approach**:
   - Initially deploy as beta endpoints alongside existing API
   - Gather feedback from early adopters
   - Gradually expand lexicon coverage

2. **Documentation**:
   - Create dedicated documentation for AT Protocol integration
   - Provide examples for common usage scenarios
   - Document the complete lexicon schemas

3. **Monitoring**:
   - Add metrics for XRPC endpoint usage
   - Monitor performance and error rates
   - Track adoption by AT Protocol clients

## Future Considerations

1. **Extended Lexicon Coverage**:
   - Expand to cover additional API functionality
   - Consider user profiles, comments, and other resources
   - Support more advanced filtering and search capabilities

2. **Federation Possibilities**:
   - Explore federated event discovery across instances
   - Consider PDS hosting for event data
   - Investigate advanced AT Protocol features like relay protocols

3. **Custom Extensions**:
   - Develop extensions for recurring events
   - Create OpenMeet-specific lexicons for unique features
   - Contribute improvements to community lexicons

## Appendix

### Related Documents
- [ATProtocol Design](/design-notes/atprotocol-design.md)
- [ATProtocol RSVP Integration](/design-notes/atprotocol-rsvp-integration.md)
- [Event Series Implementation Guide](/design-notes/recurring-events/event-series-implementation-guide.md)

### Reference Materials
- [AT Protocol Lexicon Specification](https://atproto.com/specs/lexicon)
- [XRPC Specification](https://atproto.com/specs/xrpc)
- [Community Calendar Lexicons](https://github.com/bluesky-social/atproto/tree/main/lexicons/community/lexicon/calendar)