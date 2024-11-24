import request from 'supertest';
import {
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';

describe('Sessions', () => {
  const app = TESTING_APP_URL;
  let testServer;
  let testUserId: number;

  beforeEach(() => {
    testServer = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should create new session on login', async () => {
    const loginResponse = await testServer
      .post('/api/v1/auth/email/login')
      .send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeDefined();

    // Verify session works by accessing protected route
    const meResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.email).toBe(TESTING_ADMIN_EMAIL);
  });

  it('should handle multiple sessions for same user', async () => {
    // Create first session
    const firstLogin = await testServer.post('/api/v1/auth/email/login').send({
      email: TESTING_ADMIN_EMAIL,
      password: TESTING_ADMIN_PASSWORD,
    });

    // Create second session
    const secondLogin = await testServer.post('/api/v1/auth/email/login').send({
      email: TESTING_ADMIN_EMAIL,
      password: TESTING_ADMIN_PASSWORD,
    });

    // Both tokens should be different but valid
    expect(firstLogin.body.token).not.toBe(secondLogin.body.token);

    // Verify both sessions work
    const firstMeResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${firstLogin.body.token}`);

    const secondMeResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${secondLogin.body.token}`);

    expect(firstMeResponse.status).toBe(200);
    expect(secondMeResponse.status).toBe(200);
  });

  it('should handle logout and session management', async () => {
    // Login to create session
    const loginResponse = await testServer
      .post('/api/v1/auth/email/login')
      .send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

    const token = loginResponse.body.token;

    // Verify session is valid before logout
    const beforeLogoutResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(beforeLogoutResponse.status).toBe(200);

    // Attempt logout
    const logoutResponse = await testServer
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutResponse.status).toBe(204);

    // Check what happens after logout
    const afterLogoutResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(afterLogoutResponse.status).toBe(200);
  });

  it('should create valid session during user registration', async () => {
    const newUser = {
      email: `test.session.reg${Date.now()}@openmeet.net`,
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'Session',
    };

    // Attempt registration
    const registerResponse = await testServer
      .post('/api/v1/auth/email/register')
      .send(newUser);

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.token).toBeDefined();
    expect(registerResponse.body.user).toBeDefined();
    expect(registerResponse.body.user.id).toBeDefined();

    // Store the user ID for cleanup
    testUserId = registerResponse.body.user.id;

    // Verify the session works immediately
    const meResponse = await testServer
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registerResponse.body.token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.email).toBe(newUser.email);
  });

  afterEach(async () => {
    if (testUserId) {
      await testServer.delete(`/api/v1/users/${testUserId}`);
    }
  });
});
