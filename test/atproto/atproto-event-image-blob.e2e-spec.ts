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

jest.setTimeout(180000);

describe('AT Protocol Event Image Blob Publishing (e2e)', () => {
  const app = TESTING_APP_URL;
  const testRunId = Date.now();
  const newUserEmail = `atproto-image-blob-${testRunId}@openmeet.net`;
  const newUserPassword = 'testpassword123';
  const eventName = `Image Blob Test Event ${testRunId}`;
  const seededImageKey = `e2e-image-blob/${testRunId}.png`;
  const seededImageFile = `./files/${testRunId}.png`;
  // Source image: 1400x1050 (under the 2048 edge cap, so dimensions survive)
  // and >900KB (so the publish path must re-encode to WebP).
  const sourceWidth = 1400;
  const sourceHeight = 1050;

  let userDid: string;
  let eventRkey: string;
  let pgClient: Client | null = null;
  // The published record + its thumbnail entry, fetched once in beforeAll and
  // asserted on by the contract tests below.
  let publishedRecord: any;
  let thumbnail: any;

  const waitForBackend = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const getEventRecord = async () => {
    const pdsResponse = await request(TESTING_PDS_URL)
      .get(
        `/xrpc/com.atproto.repo.getRecord?repo=${userDid}&collection=community.lexicon.calendar.event&rkey=${eventRkey}`,
      )
      .set('Accept', 'application/json');
    expect(pdsResponse.status).toBe(200);
    return pdsResponse.body.value;
  };

  // Full scenario setup: register a user, wait for the custodial PDS identity,
  // seed an image fixture the local file driver can read, create+publish a
  // public event with that image, then fetch the published record once. Kept in
  // beforeAll so a setup failure surfaces as a setup failure (not a cascade of
  // misleading assertion failures) and the tests below assert only the contract.
  beforeAll(async () => {
    const serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);

    // --- register, verify, and log in a new email user ---
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
        (email.subject?.includes('Code') || email.subject?.includes('Verify')),
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
    const userToken = loginResponse.body.token;

    // --- wait for the async custodial PDS account to appear ---
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

    // --- seed the image fixture the publish path can read ---
    // A random-noise PNG over the 900KB normalization threshold (forces WebP
    // re-encode) but under the 5MB upload cap.
    const raw = randomBytes(sourceWidth * sourceHeight * 3);
    const imageBytes = await sharp(raw, {
      raw: { width: sourceWidth, height: sourceHeight, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(imageBytes.length).toBeGreaterThan(900 * 1024);
    expect(imageBytes.length).toBeLessThan(5 * 1024 * 1024);

    const file = await createFile(app, userToken, {
      fileName: `image-blob-${testRunId}.png`,
      fileSize: imageBytes.length,
      mimeType: 'image/png',
    });
    const imageFileId = file.id;
    expect(imageFileId).toBeDefined();

    // The e2e harness has no object storage, so stage the bytes where the local
    // file driver reads them (tests share the API container's filesystem) and
    // point the record's stored path at that key.
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

    // --- create a public event with the image and wait for it to publish ---
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

    let rkey: string | undefined;
    for (let attempt = 0; attempt < 15 && !rkey; attempt++) {
      await waitForBackend(2000);
      const eventResponse = await serverApp
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(eventResponse.status).toBe(200);
      if (eventResponse.body.atprotoRkey) {
        rkey = eventResponse.body.atprotoRkey;
      }
    }
    expect(rkey).toBeDefined();
    eventRkey = rkey as string;

    // --- fetch the published record once for the assertions below ---
    publishedRecord = await getEventRecord();
    thumbnail = (publishedRecord.media ?? []).find(
      (m: any) => m.role === 'thumbnail',
    );
  }, 180000);

  afterAll(async () => {
    if (pgClient) {
      await pgClient.end().catch(() => undefined);
    }
    await fs.unlink(seededImageFile).catch(() => undefined);
  });

  it('should reference the image via a single media[] thumbnail blob with no URL baked into the record', () => {
    expect(publishedRecord.name).toBe(eventName);

    // Exactly one thumbnail entry, in the ecosystem media[] shape.
    const thumbnails = (publishedRecord.media ?? []).filter(
      (m: any) => m.role === 'thumbnail',
    );
    expect(thumbnails).toHaveLength(1);

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
    expect(thumbnail.aspect_ratio).toEqual({
      width: sourceWidth,
      height: sourceHeight,
    });

    // The source key lives in the openMeetMeta extension, not the media entry;
    // the legacy bespoke field is gone.
    expect(publishedRecord.openMeetMeta?.imageSourceKey).toBe(seededImageKey);
    expect(publishedRecord.openMeetMedia).toBeUndefined();

    // No URL is baked into the record for the image.
    const imageUri = (publishedRecord.uris ?? []).find(
      (u: any) => u.name === 'Event Image',
    );
    expect(imageUri).toBeUndefined();
  });

  it('should serve the bounded, decodable WebP blob back via com.atproto.sync.getBlob', async () => {
    const cid = thumbnail.content.ref.$link;

    const blobResponse = await fetch(
      `${TESTING_PDS_URL}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
        userDid,
      )}&cid=${encodeURIComponent(cid)}`,
    );
    expect(blobResponse.status).toBe(200);

    const blobBytes = Buffer.from(await blobResponse.arrayBuffer());
    // Bounded: exactly the size the record advertises, and under the ceiling.
    expect(blobBytes.length).toBe(thumbnail.content.size);
    expect(blobBytes.length).toBeLessThanOrEqual(900 * 1024);

    // Decodable WebP: RIFF....WEBP magic bytes, and sharp can read its
    // dimensions back (independent of the PDS content-type header).
    expect(blobBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(blobBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    const meta = await sharp(blobBytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(sourceWidth);
    expect(meta.height).toBe(sourceHeight);
  });
});
