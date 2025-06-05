import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('Auth /me endpoint debug', () => {
  const app = TESTING_APP_URL;
  let authToken: string;

  beforeAll(async () => {
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
  });

  it('should handle GET /api/v1/auth/me correctly', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(response.body.email).toBeDefined();
  });

  it('should handle GET /api/v1/auth/me with invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer invalid-token`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Invalid token response status:', response.status);
    console.log(
      'Invalid token response body:',
      JSON.stringify(response.body, null, 2),
    );

    expect(response.status).toBe(401);
  });

  it('should handle GET /api/v1/auth/me without tenant ID', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    console.log('No tenant response status:', response.status);
    console.log(
      'No tenant response body:',
      JSON.stringify(response.body, null, 2),
    );

    // This might fail with 400 or 500 depending on tenant guard implementation
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
