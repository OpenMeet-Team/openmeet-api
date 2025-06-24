import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

/**
 * Matrix Core API Tests
 *
 * These tests validate the basic Matrix integration functionality.
 */
// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('Matrix Core API Tests', () => {
  let token: string;

  // Increase the timeout for the entire test suite
  beforeAll(async () => {
    // Set a longer timeout for the entire test suite
    jest.setTimeout(120000);

    try {
      // Login as the main test user
      token = await loginAsTester();
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
    }
  });

  afterAll(() => {
    // Reset the Jest timeout
    jest.setTimeout(5000);
  });

  describe('Matrix User Management', () => {
    it('should provision a Matrix user for the current user', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/matrix/provision-user')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('matrixUserId');
      expect(response.body).toHaveProperty('success', true);
      // The matrix user ID should be in the format @username:domain
      expect(response.body.matrixUserId).toMatch(/^@.+:.+$/);
    });

    it('should enforce authentication for Matrix API endpoints', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/matrix/provision-user')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });
  });
});
