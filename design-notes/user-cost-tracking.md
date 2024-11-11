# OpenMeet Usage & Resource Management, Draft

This is a design for Usage Tracking for the purpose of Usage Based Pricing.

Usage tracking will help us identify users that should upgrade past the free plan.

Draft, not ready for implementation.

## Developer Documentation

We need a system that allows reliable and speedy tracking of usage per user and group.  It should be flexible enough to handle changes in requirements and should be able to scale as we grow.

### DB considerations

We have available Postgres, and Prometheus.

- We could use **prometheus** for realtime metrics, triggering alerts for high usage, dashboards, and capacity planning.
- We should use **Postgres** for logging and recording billing data, enforcing user limits, and tracking group usage.

### System Requirements

#### Resource Tracking Needs

1. Storage Monitoring
   - Per-user quotas, MB used this month, Monthly charge for storage
   - Group needs to track total storage used (Question, does a file upload count against the user or groups?)
   - Also needs to track storage over time.  Maybe they added 500MB today, but that 500MB has a per unit of time cost.What does tracking that cost look like?

2. Activity Tracking
   - API usage, duration and count
   - Database operations usage (if not on actual DB queries, then on API call duration and count)
   - User interactions (messages, events, files)
   - Group activities (messages, events, files)

3. Performance Monitoring
   - request and response times
   - Resource utilization
   - System capacity

#### Implementation Goals

1. Monitoring Requirements
   - Real-time tracking into Prometheus
   - Implement usage limits on users and maybe groups.
   - Usage analytics
   - Alert systems
   - Reporting tools

2. Community Tools
   - Group leadership dashboards
   - User usage dashboards
   - Usage controls
   - Analytics interfaces
   - Resource allocation

#### Success Metrics

We know we have a good system when 

1. We can query user app usage and map it to a cost per user
2. We can query group usage and costs per group
3. Community managers compliment us on available analytics and controls
4. Users can understand why we're asking them to upgrade
5. Users are upgrading

## User-Facing Documentation

OpenMeet is a free service, with a focus on local community building.  We have a few usage limits in place to ensure the service remains available for all users. To go beyond the free plan limitations, you can upgrade to a paid plan.  

### Understanding Your Resources

Running OpenMeet in not free, and supporting free users is part of our plan.  To achieve that, we need to bill users that are getting the most value out of the service, and we need to know the amount of resources each user is using so that they can cover the cost of the extra utilization and support the free tier.

#### What We Track

1. Storage
   - Files you upload
   - Total space used

2. Activity
   - Messages sent
   - Groups created/joined
   - Events created/attended
   - Files shared
   - API calls, duration and count per time period

3. Group Resources
   - Combined member activity
   - Shared resources
   - Group-specific limits

#### Why We Track Usage

- Ensure fair access for everyone
- Maintain system performance
- Prevent abuse
- Help you optimize your usage
- Support community growth

#### Privacy Commitment

- Usage data is for billing and planning only
- Your data remains private
- No sharing between users or external parties
- Transparent access to your own metrics

### For Community Managers

#### Available Metrics

1. Community Health
   - Member engagement rates
   - Response times
   - Retention rates
   - Growth trends

2. Resource Usage
   - Storage distribution
   - Feature adoption
   - Peak usage patterns
   - Member activity levels

#### Management Tools

- Usage dashboards
- Activity monitoring
- Resource allocation
- Performance tracking
- Growth metrics

#### Success Indicators

- Growing member engagement
- Efficient resource usage
- High member satisfaction
- Sustainable growth patterns
