import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Group Private Access (e2e)', () => {
  let token;
  let privateGroup;

  // Helper function to create a group with specified visibility
  async function createGroup(token, groupData) {
    const response = await request(TESTING_APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        visibility: 'private', // Default to private
        ...groupData, // Allow override of visibility and other fields
      });

    expect(response.status).toBe(201);
    return response.body;
  }

  // Before each test, log in as the test user and create a private group
  beforeEach(async () => {
    token = await loginAsTester();
    privateGroup = await createGroup(token, {
      name: 'Private Test Group',
      description:
        'A private test group that should show minimal info to unauthenticated users',
    });
  });

  // After each test, clean up by deleting the private group
  afterEach(async () => {
    if (privateGroup && privateGroup.slug) {
      try {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${privateGroup.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } catch (error) {
        // Ignore errors during cleanup
        console.log(`Cleanup error: ${error.message}`);
      }
    }
  });

  it('should block unauthenticated users from viewing private group details', async () => {
    // Try to access the private group without authentication
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${privateGroup.slug}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', privateGroup.slug); // This header is needed for the VisibilityGuard

    // Should return 403 - private groups are not accessible without membership
    expect(response.status).toBe(403);
  });

  it('should show full group details for authenticated users who are members of private groups', async () => {
    // Access the private group with authentication (as the creator/member)
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${privateGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', privateGroup.slug);

    expect(response.status).toBe(200);

    // Should get full details since the user is authenticated and is a member (creator)
    expect(response.body).toHaveProperty('name', 'Private Test Group');
    expect(response.body).toHaveProperty(
      'description',
      'A private test group that should show minimal info to unauthenticated users',
    );
    expect(response.body).toHaveProperty('slug', privateGroup.slug);
    expect(response.body).toHaveProperty('visibility', 'private');
  });

  it('should return 403 Forbidden for unauthenticated users trying to access private group endpoints like /about', async () => {
    // Try to access private group about page without authentication
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${privateGroup.slug}/about`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', privateGroup.slug);

    // This should properly return 403 since it's a private group functionality
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      'This is a private group. Please log in and request to join to view the group details.',
    );
  });

  it('should allow authenticated users to join private groups', async () => {
    // Create another user to test joining functionality
    const testUser2Token = await loginAsTester(); // This will create a different user or return same user for testing

    // Try to join the private group as an authenticated user
    const joinResponse = await request(TESTING_APP_URL)
      .post(`/api/groups/${privateGroup.slug}/join`)
      .set('Authorization', `Bearer ${testUser2Token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', privateGroup.slug);

    // Should allow joining (the API should return success, even if requires approval)
    expect(joinResponse.status).toBe(201);

    // The response should contain the group member information
    expect(joinResponse.body).toHaveProperty('id');
  });

  it('should allow unauthenticated users to see basic unlisted group info for discovery', async () => {
    // First clean up the previous private group
    await request(TESTING_APP_URL)
      .delete(`/api/groups/${privateGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Create an unlisted group instead
    const unlistedGroup = await createGroup(token, {
      name: 'Unlisted Test Group',
      description: 'A group that is unlisted but accessible via link',
      visibility: 'unlisted', // This should require login but not membership
    });

    // Try to access the unlisted group without authentication
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${unlistedGroup.slug}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', unlistedGroup.slug);

    // Should return 200 with basic group info for discovery
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('name', 'Unlisted Test Group');
    expect(response.body).toHaveProperty('visibility', 'unlisted');

    // Clean up
    await request(TESTING_APP_URL)
      .delete(`/api/groups/${unlistedGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });
});
