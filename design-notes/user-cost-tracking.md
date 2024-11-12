# System Design Document: OpenMeet Usage & Resource Management

## Overview
This is a design for Usage Tracking for the purpose of Usage Based Pricing.
Usage tracking will help us identify users that should upgrade past the free plan.

## Business Context
- Need to identify power users for plan upgrades
- Support sustainable free tier through usage-based pricing
- Enable data-driven decisions for resource allocation
- Provide transparency in usage tracking

## Goals & Success Metrics
We know we have a good system when:
1. We can query user app usage and map it to a cost per user
2. We can query group usage and costs per group
3. Community managers compliment us on available analytics and controls
4. Users can understand why we're asking them to upgrade
5. Users are upgrading

## System Requirements
### Functional Requirements
1. Storage Monitoring
   - Per-user quotas, MB used this month, Monthly charge for storage
   - Group needs to track total storage used (Question, does a file upload count against the user or groups?)
   - Also needs to track storage over time. Maybe they added 500MB today, but that 500MB has a per unit of time cost.What does tracking that cost look like?

2. Activity Tracking
   - API usage, duration and count
   - Database operations usage (if not on actual DB queries, then on API call duration and count)
   - User interactions (messages, events, files, groups, users)
   - Group activities (Does this make sense? Do we bill customers base on their owned groups?)

3. Performance Monitoring
   - request and response times
   - Resource utilization
   - System capacity

### Non-Functional Requirements
We need a system that allows reliable and speedy tracking of usage per user and group. It should be flexible enough to handle changes in requirements and should be able to scale as we grow.

## Technical Design
### Architecture
We have available Postgres, and Prometheus.
- We could use **prometheus** for realtime metrics, triggering alerts for high usage, dashboards, and capacity planning.
- We should use **Postgres** for logging and recording billing data, enforcing user limits, and tracking group usage.

### Implementation Details


### Monitoring & Maintenance


## Testing Strategy


## Deployment Strategy


## Future Considerations


