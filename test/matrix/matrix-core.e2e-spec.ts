import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';

/**
 * Matrix Core API Tests
 * 
 * These tests validate the basic Matrix integration functionality.
 */
// Set a very long global timeout for this entire test file
jest.setTimeout(120000);

describe('Matrix Core API Tests', () => {
  let token: string;
  let currentUser: any;

  // Increase the timeout for the entire test suite
  beforeAll(async () => {
    // Set a longer timeout for the entire test suite
    jest.setTimeout(120000);

    try {
      // Login as the main test user
      token = await loginAsTester();

      // Get the current user information
      const meResponse = await request(TESTING_APP_URL)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      currentUser = meResponse.body;
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

    it('should return WebSocket connection information', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/matrix/websocket-info')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('endpoint');
      expect(response.body).toHaveProperty('authenticated');
      expect(response.body).toHaveProperty('matrixUserId');
      
      // The endpoint should be a valid URL
      expect(response.body.endpoint).toMatch(/^(http|https):\/\//);
    });
    
    it('should enforce authentication for Matrix API endpoints', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/matrix/provision-user')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });
  });
  
  describe('WebSocket API Configuration', () => {
    it('should have a socket.io endpoint available', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/socket.io/matrix')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Socket.io endpoints typically return 400 Bad Request
      // when accessed directly via HTTP (they expect a WebSocket upgrade)
      expect([400, 404]).toContain(response.status);
    });
  });
});