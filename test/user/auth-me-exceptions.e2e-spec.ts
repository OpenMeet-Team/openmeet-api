import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('Auth /me endpoint exception handling', () => {
  const app = TESTING_APP_URL;
  let authToken: string;

  beforeAll(async () => {
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
  });

  it('should handle expired token gracefully', async () => {
    // Use a token that might be expired or malformed
    const expiredToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OSwidXNlciI6eyJpZCI6OTk5OX0sImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNTE2MjM5MDIyfQ.invalid';

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Expired token response status:', response.status);
    console.log(
      'Expired token response body:',
      JSON.stringify(response.body, null, 2),
    );

    // Should return 401, not 500 (unhandled exception)
    expect(response.status).toBe(401);
    expect(response.body.statusCode).toBe(401);
  });

  it('should handle token with non-existent user ID', async () => {
    // Create a valid JWT but with a user ID that doesn't exist
    const secret = process.env.APP_JWT_SECRET || 'jwt_secret_key';

    const fakeToken = jwt.sign(
      {
        id: 99999, // User ID that doesn't exist
        role: { id: 1 },
        slug: 'fake-user',
        sessionId: 99999,
      },
      secret,
    );

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${fakeToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Non-existent user response status:', response.status);
    console.log(
      'Non-existent user response body:',
      JSON.stringify(response.body, null, 2),
    );

    // Should handle gracefully, not throw unhandled exception
    expect([200, 401, 404]).toContain(response.status);
  });

  it('should handle missing tenant ID gracefully', async () => {
    // Test missing tenant ID which should cause a graceful failure
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    // Intentionally omit tenant ID

    console.log('Missing tenant response status:', response.status);
    console.log(
      'Missing tenant response body:',
      JSON.stringify(response.body, null, 2),
    );

    // Should return 401, not 500 (unhandled exception)
    expect(response.status).toBe(401);
    expect(response.body.statusCode).toBe(401);
  });

  it('should handle normal case gracefully', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Normal case response status:', response.status);

    expect(response.status).toBe(200);
    expect(response.body.id).toBeDefined();
  });

  it('should handle malformed JWT gracefully', async () => {
    const malformedToken = 'not.a.valid.jwt.token';

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${malformedToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Malformed JWT response status:', response.status);
    console.log(
      'Malformed JWT response body:',
      JSON.stringify(response.body, null, 2),
    );

    // Should return 401, not 500
    expect(response.status).toBe(401);
  });
});
