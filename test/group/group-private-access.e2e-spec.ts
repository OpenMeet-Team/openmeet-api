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

  it('should show helpful error message instead of "Group Not Found" for unauthenticated users accessing private groups', async () => {
    // Try to access the private group without authentication
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${privateGroup.slug}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', privateGroup.slug); // This header is needed for the VisibilityGuard

    // Should return 403 but with a helpful message, not "Group Not Found"
    expect(response.status).toBe(403);

    // The error message should be helpful and informative
    expect(response.body.message).toBe(
      'This is a private group. Please log in and request to join to view the group details.',
    );
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

  it('should handle authenticated groups with helpful message for unauthenticated users', async () => {
    // First clean up the previous private group
    await request(TESTING_APP_URL)
      .delete(`/api/groups/${privateGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Create an authenticated group instead
    const authenticatedGroup = await createGroup(token, {
      name: 'Authenticated Test Group',
      description: 'A group that requires authentication to view',
      visibility: 'authenticated', // This should require login but not membership
    });

    // Try to access the authenticated group without authentication
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${authenticatedGroup.slug}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('x-group-slug', authenticatedGroup.slug);

    // Should return 403 with helpful message for authenticated groups
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      'This group requires authentication. Please log in to view the group details.',
    );

    // Clean up
    await request(TESTING_APP_URL)
      .delete(`/api/groups/${authenticatedGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });
});
