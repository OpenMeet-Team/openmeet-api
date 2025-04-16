
# Bluesky User and External Events

> **NOTE**: This document contains early design notes. For the authoritative and comprehensive design documentation, please refer to [ATProtocol Design](/design-notes/atprotocol-design.md).

When a bluesky user logs in, we authenticate with the provider PDS and get a token.
That token is usable to look up and create records in the PDS.
We want the PDS to be the source of truth, and we're caching a copy in the local db.

When we create an event, we want to create it in the PDS first, and then update the local db.

## External events:

Most events will be created internal to the system, but some will come from external sources.
We want to be able to track the source of the event, and update the local db with the event data from the external source.


## Key Principles

- Source of Truth: Bluesky first, local DB second for Bluesky users
- Secure Storage: Credentials in Redis with expiration
- Graceful Degradation: Continue with local operations if Bluesky fails. When creating an event, if we can't create it in bluesky, don't save it locally until we can.
- Token Management: Automatic refresh and cleanup of expired tokens

## Bluesky login flow

- user logs in with bsky using login component
- calls backend auth/login-bsky looks oauth endpoint up
- redirects to bsky oauth endpoint
- user logs in or is refreshed
- PDS provider returns tokens, did, handle
- Redirects to Bluesky Callback in frontend
- frontend uses auth service and user service to store the token in redis with an expiration
- frontend redirects to the / page

## Bluesky Credential Storage

Credentials expire in 1 hour, and are refreshable while we have an active session.
We need to store credentials to access bsky accounts.
Use Redis/ElastiCache for better security and token management.


```
// Key pattern for storing credentials
`bluesky:credentials:${user.id}`

// Credential structure
interface BlueskyCredentials {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}
```

## BskyClient Service

Core service for interacting with Bluesky's API, allows operating on the event records in the PDS for CRUD operations using user's bsky token

```
@Injectable()
export class BskyClient {
  constructor(
    private readonly elasticacheService: ElastiCacheService,
  ) {}

  async createEvent(user: User, eventData: any): Promise<{ uri: string }> {
    const agent = await this.getAgentForUser(user);
    
    const event: BskyEventRecord = {
      $type: 'community.lexicon.calendar.event',
      name: eventData.title,
      text: eventData.description,
      createdAt: new Date().toISOString(),
      startsAt: eventData.startDate,
      endsAt: eventData.endDate,
      mode: eventData.isVirtual ? 'virtual' : 'inperson',
      status: 'scheduled'
    };

    const response = await agent.api.com.atproto.repo.createRecord({
      repo: agent.session?.did!,
      collection: 'community.lexicon.calendar.event',
      record: event
    });

    return { uri: response.data.uri };
  }

  // get event
  // update event
  // delete event
}
```

## bluesky user page

- only works for users with a provider of bluesky
- shows events from the PDS
- let users create, update, delete events from their records
- creates/updates/deletes happen in PDS and are seen from the firehose and applied to the db

## Event Creation Flow

Source of truth strategy:

1. Check for Bluesky credentials in Redis
2. If found, create event in Bluesky first
3. Handle failures gracefully
4. if successful, create event locally? or wait until we read it from the firehose?
5. Store Bluesky URI with local event

## Open Questions

- Should the bsky event be created in the frontend code, or by the api?
- do we want to keep track of the tokens in the API layer?
- having all the creds in elasticach makes it easier to hack?
- should we have a credentials store on the API?
- @lexicon is the format we need to adapt to when sending an event to bluesky or populating the local db.
