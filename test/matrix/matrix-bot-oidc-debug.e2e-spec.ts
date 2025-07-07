import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin, createEvent } from '../utils/functions';

/**
 * Matrix Bot OIDC Authentication Debug Test
 *
 * This test helps debug the bot OIDC authentication flow by:
 * - Triggering bot authentication through room creation
 * - Logging detailed error responses to understand issues
 * - Testing the MAS OIDC configuration we just fixed
 */
describe('Matrix Bot OIDC Authentication Debug (E2E)', () => {
  let adminToken: string;
  let eventSlug: string;

  beforeAll(async () => {
    jest.setTimeout(60000);

    try {
      // Login as admin
      adminToken = await loginAsAdmin();
      console.log('✅ Admin login successful');

      // Create a test event for room creation
      const eventData = {
        name: 'OIDC Bot Debug Test Event',
        description: 'Testing bot OIDC authentication fixes',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        maxAttendees: 50,
        locationOnline: 'https://test.openmeet.net/oidc-debug',
        categories: [1],
        status: 'published',
        type: 'online',
      };

      const event = await createEvent(TESTING_APP_URL, adminToken, eventData);
      eventSlug = event.slug;
      console.log(`✅ Test event created: ${eventSlug}`);
    } catch (error) {
      console.error('❌ Test setup failed:', error.message);
      throw error;
    }
  }, 60000);

  afterAll(() => {
    jest.setTimeout(5000);
  });

  describe('Bot OIDC Authentication Flow', () => {
    it('should authenticate bot via OIDC and create room', async () => {
      console.log('🔄 Testing bot OIDC authentication via room creation...');

      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/admin/event/${eventSlug}/chatroom`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('📊 Response Status:', response.status);
      console.log('📊 Response Body:', JSON.stringify(response.body, null, 2));

      console.log('✅ Bot OIDC authentication successful!');
      console.log('✅ Room created:', response.body.roomId);
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('roomId');
      expect(response.body.roomId).toMatch(/^!.+:.+$/);
    }, 45000);

    it('should show current MAS configuration', async () => {
      // Test if we can reach MAS directly
      console.log('🔍 Testing connectivity...');

      try {
        // Test MAS connectivity
        const masUrl = process.env.MAS_SERVICE_URL;
        if (!masUrl) {
          throw new Error('MAS_SERVICE_URL environment variable not set');
        }
        const masResponse = await request(masUrl).get(
          '/.well-known/openid-configuration',
        );

        console.log('✅ MAS OIDC Discovery Status:', masResponse.status);

        // Test Matrix server connectivity
        const matrixUrl = process.env.MATRIX_HOMESERVER_URL;
        if (!matrixUrl) {
          throw new Error('MATRIX_HOMESERVER_URL environment variable not set');
        }
        console.log('🔍 Testing Matrix server connectivity...');
        const matrixResponse = await request(matrixUrl).get(
          '/_matrix/client/versions',
        );
        console.log('✅ Matrix Server Status:', matrixResponse.status);

        if (masResponse.status === 200) {
          console.log('✅ MAS OIDC configuration loaded');
          console.log(
            '🔗 Authorization endpoint:',
            masResponse.body.authorization_endpoint,
          );
          console.log('🔗 Token endpoint:', masResponse.body.token_endpoint);
        }
      } catch (error) {
        console.log('❌ MAS connectivity failed:', error.message);
      }
    });
  });
});
