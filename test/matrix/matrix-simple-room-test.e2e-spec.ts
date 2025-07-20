import request from 'supertest';
import { createClient } from 'matrix-js-sdk';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser, createEvent } from '../utils/functions';
import { getTenantConfig } from '../../src/utils/tenant-config';

describe('Simple Matrix Room Test (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  it('should debug why Matrix client cannot find room alias', async () => {
    // 1. Create test event
    const testUser = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `test-simple-${Date.now()}@openmeet.net`,
      'Simple',
      'Test',
    );

    const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
      slug: `simple-test-${Date.now()}`,
      name: 'Simple Test Event',
      type: 'in-person',
      status: 'published',
      visibility: 'public',
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 90000000).toISOString(),
      timeZone: 'UTC',
      description: 'Simple test for Matrix room creation',
      maxAttendees: 10,
      categories: [],
    });

    console.log(`✅ Created test event: ${testEvent.slug}`);

    // 2. Generate room alias
    const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
    console.log(`🔍 Testing room alias: ${roomAlias}`);

    // 3. Test AppService directly
    console.log(`📋 Step 1: Testing AppService directly...`);
    const appServiceResponse = await server
      .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
      .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
      .expect(200);

    console.log(`✅ AppService response:`, appServiceResponse.body);

    // 4. Test Matrix homeserver directly
    console.log(`📋 Step 2: Testing Matrix homeserver directly...`);
    const tenantConfig = getTenantConfig(TESTING_TENANT_ID);
    const homeserverUrl = tenantConfig?.matrixConfig?.homeserverUrl || 'http://localhost:8448';
    
    try {
      const directHomeserverResponse = await fetch(
        `${homeserverUrl}/_matrix/client/v3/directory/room/${encodeURIComponent(roomAlias)}`,
        {
          headers: {
            'Authorization': `Bearer ${HOMESERVER_TOKEN}`,
          },
        }
      );
      
      console.log(`📊 Direct homeserver response status: ${directHomeserverResponse.status}`);
      
      if (directHomeserverResponse.ok) {
        const data = await directHomeserverResponse.json();
        console.log(`✅ Direct homeserver response:`, data);
      } else {
        const errorText = await directHomeserverResponse.text();
        console.log(`❌ Direct homeserver error:`, errorText);
      }
    } catch (error) {
      console.log(`❌ Direct homeserver fetch failed:`, error.message);
    }

    // 5. Test with Matrix client
    console.log(`📋 Step 3: Testing with Matrix client...`);
    try {
      const matrixClient = createClient({
        baseUrl: homeserverUrl,
        accessToken: HOMESERVER_TOKEN,
        userId: `@openmeet-bot-${TESTING_TENANT_ID}:matrix.openmeet.net`,
      });

      console.log(`🔄 Matrix client querying: ${roomAlias}`);
      const roomAliasResult = await matrixClient.getRoomIdForAlias(roomAlias);
      console.log(`✅ Matrix client success:`, roomAliasResult);
      
    } catch (matrixError) {
      console.log(`❌ Matrix client error:`, matrixError.message);
      console.log(`📊 Error details:`, {
        errcode: matrixError.errcode,
        httpStatus: matrixError.httpStatus,
      });
    }

    // 6. Check logs for AppService calls
    console.log(`📋 Check running.log to see if AppService received any calls during Matrix client query`);
    
  }, 30000);
});