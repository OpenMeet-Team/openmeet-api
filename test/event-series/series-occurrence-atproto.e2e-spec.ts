import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
  TESTING_PDS_URL,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

/**
 * Series Occurrence AT Protocol Publishing E2E Tests
 *
 * Verifies that materialized occurrences from event series templates
 * publish to AT Protocol via the modern AtprotoPublisherService path.
 *
 * Background: Materialized occurrences are new OpenMeet-generated events.
 * They must go through the save-first publish path, getting their own
 * custodial PDS identity and AT Protocol record.
 *
 * Run with: npm run test:e2e -- --testPathPattern=series-occurrence-atproto
 *
 * Prerequisites:
 * - PDS and PLC containers running (./scripts/devnet-up.sh)
 * - Migrations run
 * - MailDev accessible
 */

jest.setTimeout(120000);

describe('Series Occurrence AT Protocol Publishing (e2e)', () => {
  const app = TESTING_APP_URL;

  const testRunId = Date.now();
  const userEmail = `series-atproto-test-${testRunId}@openmeet.net`;
  const userPassword = 'testpassword123';

  let serverApp: request.SuperAgentTest;
  let userToken: string;
  let userDid: string;

  const waitForBackend = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  describe('Setup: Register user with AT Protocol identity', () => {
    it('should register, verify, and login', async () => {
      const registerResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: userEmail,
          password: userPassword,
          firstName: 'SeriesAT',
          lastName: `Test${testRunId}`,
        });
      expect(registerResponse.status).toBe(201);

      await waitForBackend(2000);

      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === userEmail.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );
      expect(verificationEmail).toBeDefined();

      const verificationCode =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
      expect(verificationCode).toBeDefined();

      const verifyResponse = await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({ email: userEmail, code: verificationCode });
      expect(verifyResponse.status).toBe(200);

      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: userEmail, password: userPassword });
      expect(loginResponse.status).toBe(200);
      userToken = loginResponse.body.token;
    });

    it('should have AT Protocol identity', async () => {
      await waitForBackend(3000);

      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(identityResponse.status).toBe(200);
      expect(identityResponse.body.did).toMatch(/^did:(plc|web):/);
      userDid = identityResponse.body.did;
      console.log(`User has AT Protocol identity: ${userDid}`);
    });
  });

  describe('Materialized occurrence publishes via modern AT Protocol path', () => {
    let templateEventSlug: string;
    let seriesSlug: string;
    let materializedOccurrenceSlug: string;

    it('should create a public event as series template', async () => {
      const eventData = {
        name: `Series Template Event ${testRunId}`,
        description: 'Template event for series materialization test',
        type: EventType.InPerson,
        location: 'Louisville, KY',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
      };

      const createResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData);

      expect(createResponse.status).toBe(201);
      templateEventSlug = createResponse.body.slug;
      expect(createResponse.body.sourceType).toBeNull();
      console.log(`Created template event: ${templateEventSlug}`);
    });

    it('should create an event series from the template', async () => {
      const seriesResponse = await serverApp
        .post(`/api/event-series/create-from-event/${templateEventSlug}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          recurrenceRule: {
            frequency: 'WEEKLY',
            interval: 1,
            count: 5,
            byweekday: ['MO'],
          },
          timeZone: 'America/New_York',
        });

      expect(seriesResponse.status).toBe(201);
      seriesSlug = seriesResponse.body.slug;
      console.log(`Created series: ${seriesSlug}`);
    });

    it('should materialize a new occurrence with sourceType=null', async () => {
      const materializeResponse = await serverApp
        .post(`/api/event-series/${seriesSlug}/next-occurrence`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(materializeResponse.status).toBe(201);
      const occurrence = materializeResponse.body;
      expect(occurrence.slug).toBeDefined();
      materializedOccurrenceSlug = occurrence.slug;

      const eventResponse = await serverApp
        .get(`/api/events/${materializedOccurrenceSlug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(eventResponse.status).toBe(200);
      const materializedEvent = eventResponse.body;

      // Materialized occurrences are new OpenMeet events — no external source
      expect(materializedEvent.sourceType).toBeNull();
      console.log(
        `Materialized occurrence ${materializedOccurrenceSlug}: sourceType=${materializedEvent.sourceType}`,
      );
    });

    it('should publish the materialized occurrence to PDS', async () => {
      await waitForBackend(5000);

      const eventResponse = await serverApp
        .get(`/api/events/${materializedOccurrenceSlug}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(eventResponse.status).toBe(200);
      const event = eventResponse.body;

      expect(event.atprotoUri).toMatch(
        /^at:\/\/did:[a-z]+:[a-zA-Z0-9.%-]+\/community\.lexicon\.calendar\.event\//,
      );
      expect(event.atprotoRkey).toBeDefined();
      expect(event.atprotoSyncedAt).toBeDefined();
      expect(event.atprotoUri).toContain(userDid);
      console.log(
        `Materialized occurrence published to PDS: ${event.atprotoUri}`,
      );
    });

    it('should have the PDS record with valid createdAt', async () => {
      const eventResponse = await serverApp
        .get(`/api/events/${materializedOccurrenceSlug}`)
        .set('Authorization', `Bearer ${userToken}`);

      const event = eventResponse.body;
      expect(event.atprotoRkey).toBeDefined();
      expect(event.atprotoUri).toBeDefined();

      const pdsUrl = TESTING_PDS_URL || 'http://localhost:4000';
      const collection = 'community.lexicon.calendar.event';
      const rkey = event.atprotoRkey;

      const pdsResponse = await request(pdsUrl)
        .get(
          `/xrpc/com.atproto.repo.getRecord?repo=${userDid}&collection=${collection}&rkey=${rkey}`,
        )
        .set('Accept', 'application/json');

      expect(pdsResponse.status).toBe(200);
      expect(pdsResponse.body.value.name).toContain('Series Template');
      expect(pdsResponse.body.value.createdAt).toBeDefined();
      console.log(
        `PDS record verified: ${pdsResponse.body.uri} (createdAt: ${pdsResponse.body.value.createdAt})`,
      );
    });
  });
});
