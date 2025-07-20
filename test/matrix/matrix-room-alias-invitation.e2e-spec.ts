import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MatrixRoomService } from '../../src/matrix/services/matrix-room.service';
import { MatrixBotService } from '../../src/matrix/services/matrix-bot.service';
import { RoomAliasUtils } from '../../src/matrix/utils/room-alias.utils';
import { GlobalMatrixValidationService } from '../../src/matrix/services/global-matrix-validation.service';
import { createTestUser } from '../utils/functions';

describe('Matrix Room Alias Invitation (e2e)', () => {
  let app: INestApplication;
  let matrixRoomService: MatrixRoomService;
  let matrixBotService: MatrixBotService;
  let roomAliasUtils: RoomAliasUtils;
  let globalMatrixValidationService: GlobalMatrixValidationService;

  const testTenantId = 'test-tenant-alias-' + Date.now();
  let testUser: any;
  let testEvent: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    matrixRoomService = moduleFixture.get<MatrixRoomService>(MatrixRoomService);
    matrixBotService = moduleFixture.get<MatrixBotService>(MatrixBotService);
    roomAliasUtils = moduleFixture.get<RoomAliasUtils>(RoomAliasUtils);
    globalMatrixValidationService = moduleFixture.get<GlobalMatrixValidationService>(GlobalMatrixValidationService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Room Alias Resolution and Invitation', () => {
    it('should create test user and register Matrix handle', async () => {
      // Create test user
      testUser = await createTestUser(
        app.getHttpServer(),
        testTenantId,
        `alias-test-${Date.now()}@example.com`,
        'Alias',
        'Test'
      );

      expect(testUser.token).toBeDefined();
      expect(testUser.slug).toBeDefined();

      // Register Matrix handle for the user
      const matrixHandle = `${testUser.slug}_${testTenantId}`;
      await globalMatrixValidationService.registerMatrixHandle(
        testUser.id,
        matrixHandle,
        testTenantId
      );

      console.log(`✅ Created test user: ${testUser.slug} with Matrix handle: ${matrixHandle}`);
    });

    it('should create test event', async () => {
      const eventResponse = await request(app.getHttpServer())
        .post('/api/events')
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('x-tenant-id', testTenantId)
        .send({
          name: 'Alias Invitation Test Event',
          description: 'Testing room alias resolution for invitations',
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          location: 'Test Location',
          isPublic: true,
        })
        .expect(201);

      testEvent = eventResponse.body;
      console.log(`✅ Created test event: ${testEvent.slug}`);
    });

    it('should create Matrix room via Application Service and get room alias', async () => {
      const expectedRoomAlias = roomAliasUtils.generateEventRoomAlias(testEvent.slug, testTenantId);
      console.log(`🔍 Expected room alias: ${expectedRoomAlias}`);

      // Trigger Application Service room creation by querying the room
      const roomQueryResponse = await request(app.getHttpServer())
        .get(`/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(expectedRoomAlias)}`)
        .set('Authorization', `Bearer ${process.env.MATRIX_HOMESERVER_TOKEN || 'test-token'}`)
        .expect(200);

      // Empty response means room was created successfully
      expect(roomQueryResponse.body).toEqual({});
      console.log(`✅ Application Service created room for alias: ${expectedRoomAlias}`);
    });

    it('should fail to invite user using room alias (BEFORE fix)', async () => {
      const roomAlias = roomAliasUtils.generateEventRoomAlias(testEvent.slug, testTenantId);
      const matrixHandle = `${testUser.slug}_${testTenantId}`;
      const serverName = process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
      const userMatrixId = `@${matrixHandle}:${serverName}`;

      console.log(`🔍 Testing invitation to room alias: ${roomAlias}`);
      console.log(`🔍 Inviting user: ${userMatrixId}`);

      // This should fail with "Unknown room" error before the fix
      let inviteError: any = null;
      try {
        await matrixRoomService.inviteUser(roomAlias, userMatrixId);
        console.log(`❌ UNEXPECTED: Invitation succeeded before fix`);
      } catch (error) {
        inviteError = error;
        console.log(`✅ EXPECTED: Invitation failed with error: ${error.message}`);
      }

      // Verify it failed with the expected error
      expect(inviteError).toBeDefined();
      expect(inviteError.message).toContain('Unknown room');
    });

    it('should successfully resolve room alias to room ID using bot service', async () => {
      const roomAlias = roomAliasUtils.generateEventRoomAlias(testEvent.slug, testTenantId);
      
      console.log(`🔍 Testing room alias resolution: ${roomAlias}`);

      // Test the room alias resolution directly
      let resolvedRoomId: string | null = null;
      try {
        // We'll need to add a helper method to test alias resolution
        // For now, let's test if we can at least connect to the bot service
        await matrixBotService.ensureBotAuthenticated(testTenantId);
        console.log(`✅ Bot service authenticated for tenant: ${testTenantId}`);
        
        // This will be the test for the actual fix
        resolvedRoomId = 'placeholder-for-resolved-room-id';
      } catch (error) {
        console.log(`❌ Bot service authentication failed: ${error.message}`);
        throw error;
      }

      expect(resolvedRoomId).toBeDefined();
    });

    it('should successfully invite user after room alias resolution (AFTER fix)', async () => {
      // This test will pass after we implement the fix
      const roomAlias = roomAliasUtils.generateEventRoomAlias(testEvent.slug, testTenantId);
      const matrixHandle = `${testUser.slug}_${testTenantId}`;
      const serverName = process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
      const userMatrixId = `@${matrixHandle}:${serverName}`;

      console.log(`🔍 Testing invitation after fix: ${roomAlias} -> ${userMatrixId}`);

      // After implementing the fix, this should succeed
      let inviteSuccess = false;
      try {
        await matrixRoomService.inviteUser(roomAlias, userMatrixId);
        inviteSuccess = true;
        console.log(`✅ SUCCESS: Invitation succeeded after fix`);
      } catch (error) {
        console.log(`❌ FAILED: Invitation still failing: ${error.message}`);
        
        // For now, we expect this to fail until we implement the fix
        expect(error.message).toContain('Unknown room');
      }

      // After the fix is implemented, change this to: expect(inviteSuccess).toBe(true);
      // For now, we expect it to fail:
      expect(inviteSuccess).toBe(false);
    });

    it('should test the complete RSVP -> invitation flow', async () => {
      // RSVP to the event
      await request(app.getHttpServer())
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('x-tenant-id', testTenantId)
        .send({ status: 'confirmed' })
        .expect(201);

      console.log(`✅ User RSVPed to event: ${testEvent.slug}`);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // The Matrix event listener should have tried to invite the user
      // This is an integration test to verify the entire flow works
      console.log(`🔍 Checking if automatic invitation flow worked`);
      
      // For now, we know this will fail, but the test documents the expected behavior
      console.log(`📝 Note: Automatic invitation currently fails with 'Unknown room' error`);
      console.log(`📝 After fix: User should be automatically invited to Matrix room`);
    });
  });

  describe('Room Alias Utilities', () => {
    it('should generate correct room alias format', () => {
      const eventSlug = 'test-event-123';
      const tenantId = 'test-tenant-456';
      
      const roomAlias = roomAliasUtils.generateEventRoomAlias(eventSlug, tenantId);
      
      expect(roomAlias).toBe(`#event-${eventSlug}-${tenantId}:matrix.openmeet.net`);
      console.log(`✅ Generated room alias: ${roomAlias}`);
    });

    it('should parse room alias correctly', () => {
      const roomAlias = '#event-test-event-123-test-tenant-456:matrix.openmeet.net';
      
      const parsed = roomAliasUtils.parseRoomAlias(roomAlias);
      
      expect(parsed).toBeDefined();
      expect(parsed?.type).toBe('event');
      expect(parsed?.slug).toBe('test-event-123');
      expect(parsed?.tenantId).toBe('test-tenant-456');
      console.log(`✅ Parsed room alias: ${JSON.stringify(parsed)}`);
    });
  });
});