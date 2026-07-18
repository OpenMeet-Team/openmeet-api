import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import request from 'supertest';
import sharp from 'sharp';
import { Client } from 'pg';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_PDS_URL,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';
import { createFile, createEvent } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

/**
 * Event Image Blob Publishing E2E Tests
 *
 * Verifies the full image-blob publish path against the devnet PDS: an event
 * with an attached image publishes its image as a real PDS blob (a real
 * agent.uploadBlob + putRecord, not mocks) referenced from the record via the
 * ecosystem media[] convention, with no URL baked into the record. The blob is
 * then fetched back from the PDS via com.atproto.sync.getBlob.
 *
 * Fixture arrangement: the e2e harness has no S3, so the image bytes are
 * seeded where the local file driver reads them (./files/<name> on the shared
 * container filesystem -- tests run in the same container as the API) and the
 * file record's stored path is pointed at that key. Everything downstream of
 * the fixture (fetch, WebP normalization, uploadBlob, putRecord, getBlob) is
 * the real production path.
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-event-image-blob
 */

jest.setTimeout(120000);

describe('AT Protocol Event Image Blob Publishing (e2e)', () => {
  const app = TESTING_APP_URL;
  const testRunId = Date.now();
  const newUserEmail = `atproto-image-blob-${testRunId}@openmeet.net`;
  const newUserPassword = 'testpassword123';
  const eventName = `Image Blob Test Event ${testRunId}`;
  const seededImageKey = `e2e-image-blob/${testRunId}.png`;
  const seededImageFile = `./files/${testRunId}.png`;

  let serverApp: ReturnType<typeof request.agent>;
  let userToken: string;
  let userDid: string;
  let imageFileId: number;
  let imageBytes: Buffer;
  let eventSlug: string;
  let eventRkey: string;
  let pgClient: Client | null = null;

  const waitForBackend = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.end().catch(() => undefined);
    }
    await fs.unlink(seededImageFile).catch(() => undefined);
  });

  describe('1. User with AT Protocol identity', () => {
    it('should register, verify, and log in a new email user', async () => {
      const registerResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: 'ImageBlob',
          lastName: `Test${testRunId}`,
        });
      expect(registerResponse.status).toBe(201);

      await waitForBackend(2000);

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

      const verifyResponse = await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({ email: newUserEmail, code: verificationCode });
      expect(verifyResponse.status).toBe(200);

      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();
      userToken = loginResponse.body.token;
    });

    it('should have an AT Protocol identity (custodial PDS account)', async () => {
      // PDS account creation is async; poll until the identity appears.
      let did: string | undefined;
      for (let attempt = 0; attempt < 15 && !did; attempt++) {
        await waitForBackend(2000);
        const identityResponse = await serverApp
          .get('/api/atproto/identity')
          .set('Authorization', `Bearer ${userToken}`);
        if (identityResponse.status === 200 && identityResponse.body?.did) {
          did = identityResponse.body.did;
        }
      }

      expect(did).toBeDefined();
      expect(did).toMatch(/^did:(plc|web):/);
      userDid = did as string;
      console.log(`User AT Protocol identity: ${userDid}`);
    });
  });

  describe('2. Seed an image fixture the publish path can read', () => {
    it('should create a file record and stage the image bytes for the local driver', async () => {
      // A random-noise PNG well over the 900KB normalization threshold (so the
      // publish path must re-encode to WebP) but under the 5MB upload cap.
      const width = 1400;
      const height = 1050;
      const raw = randomBytes(width * height * 3);
      imageBytes = await sharp(raw, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer();
      expect(imageBytes.length).toBeGreaterThan(900 * 1024);
      expect(imageBytes.length).toBeLessThan(5 * 1024 * 1024);

      const file = await createFile(app, userToken, {
        fileName: `image-blob-${testRunId}.png`,
        fileSize: imageBytes.length,
        mimeType: 'image/png',
      });
      imageFileId = file.id;
      expect(imageFileId).toBeDefined();

      // The e2e harness has no object storage, so stage the bytes where the
      // local file driver reads them (tests share the API container's
      // filesystem) and point the record's stored path at that key.
      await fs.mkdir('./files', { recursive: true });
      await fs.writeFile(seededImageFile, imageBytes);

      pgClient = new Client({
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        user: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
      });
      await pgClient.connect();
      const updateResult = await pgClient.query(
        `UPDATE "tenant_${TESTING_TENANT_ID}"."files" SET "path" = $1 WHERE "id" = $2`,
        [seededImageKey, imageFileId],
      );
      expect(updateResult.rowCount).toBe(1);
    });
  });

  describe('3. Publish an event with the image and verify the PDS record', () => {
    it('should create a public event with the image and publish it to the PDS', async () => {
      const event = await createEvent(app, userToken, {
        name: eventName,
        description: 'Event to verify image blob publishing',
        type: EventType.InPerson,
        location: 'Blob Test Location',
        maxAttendees: 50,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ).toISOString(),
        categories: [],
        timeZone: 'America/New_York',
        image: { id: imageFileId },
      });
      expect(event.slug).toBeDefined();
      eventSlug = event.slug;

      // Publishing runs during creation but poll to absorb any async lag.
      let rkey: string | undefined;
      for (let attempt = 0; attempt < 15 && !rkey; attempt++) {
        await waitForBackend(2000);
        const eventResponse = await serverApp
          .get(`/api/events/${eventSlug}`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(eventResponse.status).toBe(200);
        if (eventResponse.body.atprotoRkey) {
          rkey = eventResponse.body.atprotoRkey;
        }
      }

      expect(rkey).toBeDefined();
      eventRkey = rkey as string;
      console.log(`Event published to PDS with rkey: ${eventRkey}`);
    });

    it('should reference the image via a media[] thumbnail blob with no URL baked in', async () => {
      const pdsResponse = await request(TESTING_PDS_URL)
        .get(
          `/xrpc/com.atproto.repo.getRecord?repo=${userDid}&collection=community.lexicon.calendar.event&rkey=${eventRkey}`,
        )
        .set('Accept', 'application/json');
      expect(pdsResponse.status).toBe(200);

      const record = pdsResponse.body.value;
      expect(record.name).toBe(eventName);

      // media[]: exactly one thumbnail entry in the ecosystem shape.
      expect(Array.isArray(record.media)).toBe(true);
      const thumbnails = record.media.filter(
        (m: any) => m.role === 'thumbnail',
      );
      expect(thumbnails).toHaveLength(1);
      const thumbnail = thumbnails[0];

      // content is a real blob ref, re-encoded to WebP (source was >900KB) and
      // under the size ceiling.
      expect(thumbnail.content?.$type).toBe('blob');
      expect(thumbnail.content?.ref?.$link).toBeTruthy();
      expect(thumbnail.content?.mimeType).toBe('image/webp');
      expect(thumbnail.content?.size).toBeGreaterThan(0);
      expect(thumbnail.content?.size).toBeLessThanOrEqual(900 * 1024);

      // alt defaults to the event name; aspect_ratio is the final dimensions
      // (1400x1050 is under the 2048 edge cap, so unchanged).
      expect(thumbnail.alt).toBe(eventName);
      expect(thumbnail.aspect_ratio).toEqual({ width: 1400, height: 1050 });

      // The source key lives in the openMeetMeta extension, not the media
      // entry; the legacy bespoke field is gone.
      expect(record.openMeetMeta?.imageSourceKey).toBe(seededImageKey);
      expect(record.openMeetMedia).toBeUndefined();

      // No URL is baked into the record for the image.
      const imageUri = (record.uris ?? []).find(
        (u: any) => u.name === 'Event Image',
      );
      expect(imageUri).toBeUndefined();
    });

    it('should serve the blob bytes back via com.atproto.sync.getBlob', async () => {
      const pdsResponse = await request(TESTING_PDS_URL)
        .get(
          `/xrpc/com.atproto.repo.getRecord?repo=${userDid}&collection=community.lexicon.calendar.event&rkey=${eventRkey}`,
        )
        .set('Accept', 'application/json');
      expect(pdsResponse.status).toBe(200);
      const thumbnail = pdsResponse.body.value.media.find(
        (m: any) => m.role === 'thumbnail',
      );
      const cid = thumbnail.content.ref.$link;

      const blobResponse = await fetch(
        `${TESTING_PDS_URL}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
          userDid,
        )}&cid=${encodeURIComponent(cid)}`,
      );
      expect(blobResponse.status).toBe(200);

      const blobBytes = Buffer.from(await blobResponse.arrayBuffer());
      expect(blobBytes.length).toBeGreaterThan(0);
      expect(blobBytes.length).toBe(thumbnail.content.size);

      // WebP magic bytes: RIFF....WEBP -- the blob really is the re-encoded
      // WebP image, independent of whatever content-type header the PDS sets.
      expect(blobBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(blobBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      console.log(
        `getBlob served ${blobBytes.length}B webp (content-type: ${blobResponse.headers.get(
          'content-type',
        )})`,
      );
    });
  });
});
