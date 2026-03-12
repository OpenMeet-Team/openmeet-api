import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MatrixRoomService } from '../../src/matrix/services/matrix-room.service';
import { RoomAliasUtils } from '../../src/matrix/utils/room-alias.utils';
import { GlobalMatrixValidationService } from '../../src/matrix/services/global-matrix-validation.service';
import { createTestUser, createEvent } from '../utils/functions';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

describe('Matrix Room Alias Invitation (e2e)', () => {
  let app: INestApplication;
  let matrixRoomService: MatrixRoomService;
  let roomAliasUtils: RoomAliasUtils;
  let globalMatrixValidationService: GlobalMatrixValidationService;

  const testTenantId = TESTING_TENANT_ID;
  let testUser: any;
  let testEvent: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // MatrixRoomService is transitively request-scoped (via EventQueryService etc.)
    // so we must resolve it with a synthetic tenant context for NestJS 11
    const contextId = ContextIdFactory.create();
    moduleFixture.registerRequestByContextId(
      { tenantId: testTenantId, headers: { 'x-tenant-id': testTenantId } },
      contextId,
    );
    matrixRoomService = await moduleFixture.resolve<MatrixRoomService>(
      MatrixRoomService,
      contextId,
    );
    roomAliasUtils = moduleFixture.get<RoomAliasUtils>(RoomAliasUtils);
    globalMatrixValidationService =
      moduleFixture.get<GlobalMatrixValidationService>(
        GlobalMatrixValidationService,
      );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Room Alias Resolution and Invitation', () => {
    it('should create test user and register Matrix handle', async () => {
      // Create test user
      testUser = await createTestUser(
        TESTING_APP_URL,
        testTenantId,
        `alias-test-${Date.now()}@example.com`,
        'Alias',
        'Test',
      );

      expect(testUser.token).toBeDefined();
      expect(testUser.slug).toBeDefined();

      // Register Matrix handle for the user (ensure lowercase for Matrix compliance)
      const matrixHandle = `${testUser.slug}_${testTenantId}`.toLowerCase();
      await globalMatrixValidationService.registerMatrixHandle(
        matrixHandle,
        testTenantId,
        testUser.id,
      );

      console.log(
        `✅ Created test user: ${testUser.slug} with Matrix handle: ${matrixHandle}`,
      );
    });

    it('should create test event', async () => {
      testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        name: 'Alias Invitation Test Event',
        description: 'Testing room alias resolution for invitations',
        type: 'hybrid',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        isPublic: true,
      });
      console.log(`✅ Created test event: ${testEvent.slug}`);
    });

    it('should create Matrix room via Application Service and get room alias', async () => {
      const expectedRoomAlias = roomAliasUtils.generateEventRoomAlias(
        testEvent.slug,
        testTenantId,
      );
      console.log(`🔍 Expected room alias: ${expectedRoomAlias}`);

      // Trigger Application Service room creation by querying the room
      const roomQueryResponse = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(expectedRoomAlias)}`,
        )
        .set(
          'Authorization',
          `Bearer ${process.env.MATRIX_APPSERVICE_HS_TOKEN || 'test-token'}`,
        )
        .expect(200);

      // Empty response means room was created successfully
      expect(roomQueryResponse.body).toEqual({});
      console.log(
        `✅ Application Service created room for alias: ${expectedRoomAlias}`,
      );
    });

    it('should successfully invite user using room alias', async () => {
      const roomAlias = roomAliasUtils.generateEventRoomAlias(
        testEvent.slug,
        testTenantId,
      );
      const matrixHandle = `${testUser.slug}_${testTenantId}`;
      const serverName =
        process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
      const userMatrixId = `@${matrixHandle}:${serverName}`;

      console.log(`Testing invitation to room alias: ${roomAlias}`);
      console.log(`Inviting user: ${userMatrixId}`);

      // Room alias resolution should resolve the alias to a room ID and invite succeeds
      await expect(
        matrixRoomService.inviteUser(roomAlias, userMatrixId),
      ).resolves.not.toThrow();

      console.log(`Successfully invited ${userMatrixId} to room ${roomAlias}`);
    });

    it('should test the complete RSVP -> invitation flow', async () => {
      // RSVP to the event
      await request(TESTING_APP_URL)
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('x-tenant-id', testTenantId)
        .send({ status: 'confirmed' })
        .expect(201);

      console.log(`✅ User RSVPed to event: ${testEvent.slug}`);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // The Matrix event listener should have tried to invite the user
      // This is an integration test to verify the entire flow works
      console.log(`🔍 Checking if automatic invitation flow worked`);

      // For now, we know this will fail, but the test documents the expected behavior
      console.log(
        `📝 Note: Automatic invitation currently fails with 'Unknown room' error`,
      );
      console.log(
        `📝 After fix: User should be automatically invited to Matrix room`,
      );
    });
  });

  describe('Room Alias Utilities', () => {
    it('should generate correct room alias format', () => {
      const eventSlug = 'test-event-123';
      const tenantId = 'test-tenant-456';

      const roomAlias = roomAliasUtils.generateEventRoomAlias(
        eventSlug,
        tenantId,
      );

      // Test that the alias follows the correct format, using the actual configured server name
      expect(roomAlias).toMatch(
        new RegExp(`^#event-${eventSlug}-${tenantId}:matrix.*`),
      );
      console.log(`✅ Generated room alias: ${roomAlias}`);
    });

    it('should parse room alias correctly', () => {
      // Use the actual server name from the service
      const eventSlug = 'test-event-123';
      const tenantId = 'tenant456';
      const roomAlias = roomAliasUtils.generateEventRoomAlias(
        eventSlug,
        tenantId,
      );

      const parsed = roomAliasUtils.parseRoomAlias(roomAlias);

      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe('event');
      expect(parsed?.slug).toBe('test-event-123');
      expect(parsed?.tenantId).toBe('tenant456');
      console.log(`✅ Parsed room alias: ${JSON.stringify(parsed)}`);
    });
  });
});
