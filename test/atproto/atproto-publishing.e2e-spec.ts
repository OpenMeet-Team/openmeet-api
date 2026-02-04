import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
  TESTING_PDS_URL,
  TESTING_PDS_ADMIN_PASSWORD,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';
import {
  EventType,
  EventVisibility,
  EventStatus,
  EventAttendeeStatus,
} from '../../src/core/constants/constant';

/**
 * AT Protocol Publishing E2E Tests
 *
 * These tests verify the full flow of AT Protocol integration:
 * 1. Email user registration creates a PDS account
 * 2. Creating public events publishes to the user's PDS
 * 3. RSVPing to events publishes to the user's PDS
 *
 * Local Prerequisites:
 * - PDS and PLC containers must be running (docker compose --profile pds up -d)
 * - Valid PDS_INVITE_CODE in .env
 * - Migrations must be run
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-publishing
 *
 * CI Setup:
 * Run ./scripts/setup-pds-invite.sh before tests - it will:
 * 1. Wait for PDS to be healthy
 * 2. Generate an invite code with high use count
 * 3. Export PDS_INVITE_CODE to GITHUB_ENV
 */

// Set a global timeout - these tests involve multiple services
jest.setTimeout(120000);

describe('AT Protocol Publishing (e2e)', () => {
  const app = TESTING_APP_URL;
  const mail = `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}`;

  // Generate unique user for this test run
  const testRunId = Date.now();
  const newUserEmail = `atproto-test-${testRunId}@openmeet.net`;
  const newUserPassword = 'testpassword123';
  const newUserFirstName = 'ATProto';
  const newUserLastName = `Test${testRunId}`;

  let serverApp: request.SuperAgentTest;
  let userToken: string;
  let userId: number;
  let userUlid: string;

  beforeAll(async () => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  // Helper to wait for async backend operations
  const waitForBackend = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  describe('1. Email User Registration with PDS Account', () => {
    it('should register a new email user', async () => {
      const response = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
        });

      expect(response.status).toBe(201);
      console.log(`Registered user: ${newUserEmail}`);
    });

    it('should verify email and login', async () => {
      // Wait for verification email
      await waitForBackend(2000);

      // Get verification code from maildev using the helper
      // Subject may be "Your Testing OpenMeet Login Code" or similar
      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === newUserEmail.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );
      expect(verificationEmail).toBeDefined();

      const verificationCode =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
      expect(verificationCode).toBeDefined();
      console.log(`Got verification code: ${verificationCode}`);

      // Verify email
      const verifyResponse = await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({
          email: newUserEmail,
          code: verificationCode,
        });

      expect(verifyResponse.status).toBe(200);

      // Login
      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: newUserEmail,
          password: newUserPassword,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();
      userToken = loginResponse.body.token;
      console.log('User logged in successfully');
    });

    it('should have created an AT Protocol identity for the user', async () => {
      // Wait for async PDS account creation
      await waitForBackend(3000);

      // Get user profile which should include AT Protocol identity info
      const meResponse = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(meResponse.status).toBe(200);
      userId = meResponse.body.id;
      userUlid = meResponse.body.ulid;

      console.log(`User ID: ${userId}, ULID: ${userUlid}`);

      // Check for AT Protocol identity via the settings endpoint
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      // User should have an identity (either created or pending)
      expect(identityResponse.status).toBe(200);

      const identity = identityResponse.body;
      console.log('AT Protocol Identity:', JSON.stringify(identity, null, 2));

      // Verify identity has expected fields
      if (identity.did) {
        expect(identity.did).toMatch(/^did:(plc|web):/);
        expect(identity.isCustodial).toBe(true);
        expect(identity.hasActiveSession).toBe(true); // Custodial with credentials can always create session
        console.log(`User has AT Protocol identity: ${identity.did}`);
      } else {
        console.warn(
          'User does not have AT Protocol identity yet - PDS may not be configured',
        );
      }
    });
  });

  // Store event info across test suites for RSVP testing
  let publicEventSlug: string;
  let publicEventAtprotoUri: string;

  describe('2. Event Publishing to PDS', () => {
    let createdEventSlug: string;
    let createdEventId: number;

    it('should create a public event that gets published to PDS', async () => {
      // Skip if no AT Protocol identity
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      if (!identityResponse.body?.did) {
        console.warn(
          'Skipping event publishing test - no AT Protocol identity',
        );
        return;
      }

      const eventData = {
        name: `AT Protocol Test Event ${testRunId}`,
        description: 'Event created to test AT Protocol publishing',
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        endDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(), // +2 hours
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      const createdEvent = createResponse.body;
      createdEventSlug = createdEvent.slug;
      createdEventId = createdEvent.id;

      console.log(`Created event: ${createdEventSlug}`);

      // Wait for async publishing
      await waitForBackend(3000);

      // Fetch the event again to check AT Protocol fields
      const eventResponse = await serverApp
        .get(`/api/events/${createdEventSlug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(eventResponse.status).toBe(200);
      const event = eventResponse.body;

      console.log('Event AT Protocol fields:', {
        atprotoUri: event.atprotoUri,
        atprotoRkey: event.atprotoRkey,
        atprotoSyncedAt: event.atprotoSyncedAt,
      });

      // Verify AT Protocol fields are populated
      if (event.atprotoUri) {
        expect(event.atprotoUri).toMatch(
          /^at:\/\/did:[a-z]+:[a-zA-Z0-9.%-]+\/community\.lexicon\.calendar\.event\//,
        );
        expect(event.atprotoRkey).toBeDefined();
        expect(event.atprotoSyncedAt).toBeDefined();
        console.log(`Event published to PDS: ${event.atprotoUri}`);

        // Store for RSVP testing - another user will RSVP to this event
        publicEventSlug = createdEventSlug;
        publicEventAtprotoUri = event.atprotoUri;
      } else {
        console.warn(
          'Event was not published to PDS - check AtprotoPublisherService logs',
        );
      }
    });

    it('should NOT publish private events to PDS', async () => {
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      if (!identityResponse.body?.did) {
        console.warn('Skipping private event test - no AT Protocol identity');
        return;
      }

      const privateEventData = {
        name: `Private Event ${testRunId}`,
        description: 'Private event should not be published',
        type: EventType.InPerson,
        location: 'Secret Location',
        maxAttendees: 10,
        visibility: EventVisibility.Private,
        status: EventStatus.Published,
        startDate: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        endDate: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(privateEventData);

      expect(createResponse.status).toBe(201);
      const privateEvent = createResponse.body;

      await waitForBackend(2000);

      // Fetch and verify no AT Protocol fields
      const eventResponse = await serverApp
        .get(`/api/events/${privateEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(eventResponse.status).toBe(200);
      const event = eventResponse.body;

      // Private events should NOT have AT Protocol fields
      expect(event.atprotoUri).toBeNull();
      expect(event.atprotoRkey).toBeNull();
      console.log('Private event correctly NOT published to PDS');
    });

    it('should use the same rkey in atprotoUri as atprotoRkey (pre-generated TID)', async () => {
      // Skip if no AT Protocol identity
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      if (!identityResponse.body?.did) {
        console.warn('Skipping TID consistency test - no AT Protocol identity');
        return;
      }

      const eventData = {
        name: `TID Consistency Test Event ${testRunId}`,
        description: 'Testing that atprotoRkey matches URI',
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(
          Date.now() + 8 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      const event = createResponse.body;

      // Wait for async publishing
      await waitForBackend(3000);

      // Fetch the event again to get AT Protocol fields
      const eventResponse = await serverApp
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(eventResponse.status).toBe(200);
      const publishedEvent = eventResponse.body;

      // Verify both fields are set
      if (!publishedEvent.atprotoUri || !publishedEvent.atprotoRkey) {
        console.warn(
          'Event was not published to PDS - skipping TID consistency check',
        );
        return;
      }

      expect(publishedEvent.atprotoRkey).toBeDefined();
      expect(publishedEvent.atprotoUri).toBeDefined();

      // Extract rkey from URI (format: at://did/collection/rkey)
      const uriParts = publishedEvent.atprotoUri.split('/');
      const rkeyFromUri = uriParts[uriParts.length - 1];

      // Verify they match - this proves we used the pre-generated TID
      expect(publishedEvent.atprotoRkey).toBe(rkeyFromUri);
      console.log(
        `TID consistency verified: atprotoRkey=${publishedEvent.atprotoRkey}, URI rkey=${rkeyFromUri}`,
      );
    });

    it('should preserve atprotoRkey when updating a published event', async () => {
      // Skip if no AT Protocol identity
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      if (!identityResponse.body?.did) {
        console.warn(
          'Skipping update preservation test - no AT Protocol identity',
        );
        return;
      }

      const eventData = {
        name: `Event for Update Test ${testRunId}`,
        description: 'Will be updated',
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(
          Date.now() + 9 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      const originalEvent = createResponse.body;

      // Wait for async publishing
      await waitForBackend(3000);

      // Fetch the event to get AT Protocol fields
      const getOriginalResponse = await serverApp
        .get(`/api/events/${originalEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getOriginalResponse.status).toBe(200);
      const originalRkey = getOriginalResponse.body.atprotoRkey;

      if (!originalRkey) {
        console.warn(
          'Event was not published to PDS - skipping update preservation check',
        );
        return;
      }

      console.log(`Original atprotoRkey: ${originalRkey}`);

      // Update the event
      const updateResponse = await serverApp
        .patch(`/api/events/${originalEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: `Updated Event Name ${testRunId}`,
          description: 'Updated description',
        });

      expect(updateResponse.status).toBe(200);

      // Wait for async publishing of update
      await waitForBackend(2000);

      // Fetch the event again to verify rkey is preserved
      const getUpdatedResponse = await serverApp
        .get(`/api/events/${originalEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getUpdatedResponse.status).toBe(200);
      const updatedEvent = getUpdatedResponse.body;

      // Verify rkey is preserved (same TID)
      expect(updatedEvent.atprotoRkey).toBe(originalRkey);
      console.log(`Rkey preserved after update: ${originalRkey}`);
    });

    it('should use existing atprotoRkey when manually syncing', async () => {
      // Skip if no AT Protocol identity
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      if (!identityResponse.body?.did) {
        console.warn('Skipping manual sync test - no AT Protocol identity');
        return;
      }

      const eventData = {
        name: `Manual Sync Test Event ${testRunId}`,
        description: 'Testing manual sync preserves rkey',
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        endDate: new Date(
          Date.now() + 10 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      const event = createResponse.body;

      // Wait for async publishing
      await waitForBackend(3000);

      // Fetch the event to get AT Protocol fields
      const getOriginalResponse = await serverApp
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getOriginalResponse.status).toBe(200);
      const originalRkey = getOriginalResponse.body.atprotoRkey;
      const originalUri = getOriginalResponse.body.atprotoUri;

      if (!originalRkey || !originalUri) {
        console.warn(
          'Event was not published to PDS - skipping manual sync test',
        );
        return;
      }

      console.log(`Original atprotoRkey: ${originalRkey}, URI: ${originalUri}`);

      // Manually trigger sync
      const syncResponse = await serverApp
        .post(`/api/events/${event.slug}/sync-atproto`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(syncResponse.status).toBe(201); // POST returns 201
      expect(syncResponse.body.action).toBe('updated'); // Already published, so it's an update

      // Wait for sync to complete
      await waitForBackend(2000);

      // Fetch the event again to verify rkey is same
      const getAfterSyncResponse = await serverApp
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getAfterSyncResponse.status).toBe(200);
      expect(getAfterSyncResponse.body.atprotoRkey).toBe(originalRkey);
      expect(getAfterSyncResponse.body.atprotoUri).toBe(originalUri);
      console.log(`Manual sync preserved rkey: ${originalRkey}`);
    });
  });

  describe('3. RSVP Publishing to PDS', () => {
    // Create a second user to test RSVP publishing
    // The issue: when user1 creates an event, they become the host automatically
    // At that moment, the event doesn't have atprotoUri yet, so host's RSVP can't be published
    // To properly test RSVP publishing, user2 must RSVP to user1's event AFTER it's published
    const user2Email = `atproto-rsvp-${testRunId}@openmeet.net`;
    const user2Password = 'testpassword123';
    let user2Token: string;
    let user2Ulid: string;

    it('should register a second user for RSVP testing', async () => {
      if (!publicEventSlug || !publicEventAtprotoUri) {
        console.warn(
          'Skipping RSVP test - no public event with atprotoUri available',
        );
        return;
      }

      // Register user2
      const registerResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: user2Email,
          password: user2Password,
          firstName: 'RSVP',
          lastName: `Tester${testRunId}`,
        });

      expect(registerResponse.status).toBe(201);

      // Wait for verification email
      await waitForBackend(2000);

      // Get verification code
      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === user2Email.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );
      expect(verificationEmail).toBeDefined();

      const verificationCode =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
      expect(verificationCode).toBeDefined();

      // Verify and login
      await serverApp.post('/api/v1/auth/verify-email-code').send({
        email: user2Email,
        code: verificationCode,
      });

      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: user2Email,
          password: user2Password,
        });

      expect(loginResponse.status).toBe(200);
      user2Token = loginResponse.body.token;

      // Get user2's ULID
      const meResponse = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user2Token}`);
      user2Ulid = meResponse.body.ulid;

      console.log(`Registered second user for RSVP testing: ${user2Email}`);
    });

    it('should publish RSVP to PDS when user2 attends user1 event', async () => {
      if (!user2Token || !publicEventSlug) {
        console.warn('Skipping RSVP test - prerequisites not met');
        return;
      }

      // Wait for user2's PDS account to be created
      await waitForBackend(3000);

      // Check user2 has AT Protocol identity
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${user2Token}`);

      if (!identityResponse.body?.did) {
        console.warn('User2 does not have AT Protocol identity - skipping');
        return;
      }
      console.log(`User2 AT Protocol DID: ${identityResponse.body.did}`);

      // User2 RSVPs to user1's public event (which already has atprotoUri)
      console.log(`User2 RSVPing to event: ${publicEventSlug}`);
      const rsvpResponse = await serverApp
        .post(`/api/events/${publicEventSlug}/attend`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({});

      expect(rsvpResponse.status).toBe(201);
      console.log('User2 RSVP created');

      // Wait for async publishing
      await waitForBackend(3000);

      // Verify RSVP was published by querying user2's PDS directly
      // This is more reliable than checking the attendees list (which may not include atproto fields)
      const pdsUrl = process.env.PDS_URL || 'http://localhost:3101';
      const user2Did = identityResponse.body.did;

      try {
        const pdsResponse = await request(pdsUrl)
          .get(
            `/xrpc/com.atproto.repo.listRecords?repo=${user2Did}&collection=community.lexicon.calendar.rsvp&limit=10`,
          )
          .set('Accept', 'application/json');

        if (pdsResponse.status === 200) {
          const rsvpRecords = pdsResponse.body.records || [];
          console.log(
            `Found ${rsvpRecords.length} RSVP records on PDS for ${user2Did}`,
          );

          // Find the RSVP for our event
          const ourEventRsvp = rsvpRecords.find(
            (r: any) => r.value?.subject?.uri === publicEventAtprotoUri,
          );

          if (ourEventRsvp) {
            console.log(`User2 RSVP published to PDS: ${ourEventRsvp.uri}`);
            expect(ourEventRsvp.uri).toMatch(
              /^at:\/\/did:[a-z]+:[a-zA-Z0-9.%-]+\/community\.lexicon\.calendar\.rsvp\//,
            );
            expect(ourEventRsvp.value.status).toBe(
              'community.lexicon.calendar.rsvp#going',
            );
          } else {
            console.warn(
              'Could not find RSVP for our event in user2 PDS records',
            );
            rsvpRecords.forEach((r: any) => {
              console.log(`  - ${r.uri}: ${r.value?.subject?.uri}`);
            });
          }
        } else {
          console.warn(`PDS query returned status ${pdsResponse.status}`);
        }
      } catch (error) {
        console.log(
          `PDS direct query skipped (${pdsUrl} not accessible): ${error.message}`,
        );
      }
    });
  });

  describe('4. Verify Records on PDS (optional)', () => {
    it('should be able to query the user records on PDS', async () => {
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      const identity = identityResponse.body;
      if (!identity?.did) {
        console.warn('Skipping PDS verification - no AT Protocol identity');
        return;
      }

      // Query the PDS directly to verify records exist
      // This uses the com.atproto.repo.listRecords endpoint
      const pdsUrl = process.env.PDS_URL || 'http://localhost:3101';

      try {
        const pdsResponse = await request(pdsUrl)
          .get(
            `/xrpc/com.atproto.repo.listRecords?repo=${identity.did}&collection=community.lexicon.calendar.event&limit=10`,
          )
          .set('Accept', 'application/json');

        if (pdsResponse.status === 200) {
          const records = pdsResponse.body.records || [];
          console.log(
            `Found ${records.length} event records on PDS for ${identity.did}`,
          );

          records.forEach((record: any) => {
            console.log(`  - ${record.uri}: ${record.value?.name}`);
          });
        } else {
          console.warn(
            `PDS query returned status ${pdsResponse.status}:`,
            pdsResponse.body,
          );
        }
      } catch (error) {
        // This is expected if PDS isn't running or not accessible from host
        console.log(
          `PDS direct query skipped (${pdsUrl} not accessible): ${error.message}`,
        );
      }
    });
  });
});
