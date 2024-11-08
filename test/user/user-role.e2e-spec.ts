import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { RoleEnum } from '../../src/role/role.enum';

describe('User role', () => {
  const app = TESTING_APP_URL;
  let serverApp;

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should refresh tokens for users with and without roles', async () => {
    // Create a user with a role
    const userWithRole = {
      email: `user.with.role.${Date.now()}@openmeet.net`,
      password: 'password123',
      firstName: 'User',
      lastName: 'WithRole',
      role: 'user', // Assuming 'user' is a valid role
    };

    // Create a user without a role
    const userWithoutRole = {
      email: `user.without.role.${Date.now()}@openmeet.net`,
      password: 'password123',
      firstName: 'User',
      lastName: 'WithoutRole',
    };

    // Register users
    await serverApp
      .post('/api/v1/auth/email/register')
      .send(userWithRole)
      .expect(201);

    await serverApp
      .post('/api/v1/auth/email/register')
      .send(userWithoutRole)
      .expect(201);

    // Login and get refresh tokens for both users
    const loginWithRole = await serverApp
      .post('/api/v1/auth/email/login')
      .send({ email: userWithRole.email, password: userWithRole.password })
      .expect(200);

    const loginWithoutRole = await serverApp
      .post('/api/v1/auth/email/login')
      .send({
        email: userWithoutRole.email,
        password: userWithoutRole.password,
      })
      .expect(200);

    const refreshTokenWithRole = loginWithRole.body.refreshToken;
    const refreshTokenWithoutRole = loginWithoutRole.body.refreshToken;

    // Attempt to refresh tokens for both users
    const refreshWithRole = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${refreshTokenWithRole}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send();

    expect(refreshWithRole.status).toBe(200);

    const refreshWithoutRole = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${refreshTokenWithoutRole}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send();

    expect(refreshWithoutRole.status).toBe(200);

    // Assert that both users received new tokens
    expect(refreshWithRole.body.token).toBeDefined();
    expect(refreshWithRole.body.refreshToken).toBeDefined();
    expect(refreshWithoutRole.body.token).toBeDefined();
    expect(refreshWithoutRole.body.refreshToken).toBeDefined();

    // Verify that the new tokens work by fetching the user profile
    const responseWithRole = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshWithRole.body.token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(responseWithRole.status).toBe(200);

    const responseWithoutRole = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshWithoutRole.body.token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .expect(200);

    expect(responseWithRole.body.role).toEqual(
      expect.objectContaining({ name: RoleEnum.User }),
    );
    expect(responseWithoutRole.body.role).toEqual(
      expect.objectContaining({ name: RoleEnum.User }),
    );
  });
});
