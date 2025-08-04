import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
} from './constants';

/**
 * Clean up test entities using API calls to prevent test interference
 */
export async function cleanupTestEntities(patterns: string[]): Promise<void> {
  try {
    // Get admin token for cleanup operations
    const adminResponse = await request(TESTING_APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

    if (adminResponse.status !== 200) {
      console.warn('⚠️ Could not get admin token for cleanup');
      return;
    }

    const adminToken = adminResponse.body.token;

    // Get all groups and delete test groups
    const groupsResponse = await request(TESTING_APP_URL)
      .get('/api/groups')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('Authorization', `Bearer ${adminToken}`);

    if (groupsResponse.status === 200 && groupsResponse.body.data) {
      for (const group of groupsResponse.body.data) {
        const shouldDelete = patterns.some(
          (pattern) => group.slug && group.slug.includes(pattern),
        );

        if (shouldDelete) {
          await request(TESTING_APP_URL)
            .delete(`/api/groups/${group.slug}`)
            .set('x-tenant-id', TESTING_TENANT_ID)
            .set('Authorization', `Bearer ${adminToken}`);
        }
      }
    }

    // Get all events and delete test events
    const eventsResponse = await request(TESTING_APP_URL)
      .get('/api/events')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('Authorization', `Bearer ${adminToken}`);

    if (eventsResponse.status === 200 && eventsResponse.body.data) {
      for (const event of eventsResponse.body.data) {
        const shouldDelete = patterns.some(
          (pattern) => event.slug && event.slug.includes(pattern),
        );

        if (shouldDelete) {
          await request(TESTING_APP_URL)
            .delete(`/api/events/${event.slug}`)
            .set('x-tenant-id', TESTING_TENANT_ID)
            .set('Authorization', `Bearer ${adminToken}`);
        }
      }
    }

    console.log(
      `✅ Cleaned up entities matching patterns: ${patterns.join(', ')}`,
    );
  } catch (error) {
    console.warn('⚠️ API cleanup failed:', error.message);
    // Don't throw - cleanup failures shouldn't break tests
  }
}
