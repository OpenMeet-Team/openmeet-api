import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

jest.setTimeout(30000);

describe('Cross-App Login Link (e2e)', () => {
  const app = TESTING_APP_URL;
  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  describe('POST /api/v1/auth/create-login-link', () => {
    describe('Happy path: create and exchange login link', () => {
      it('should create a login link with url and expiresIn', async () => {
        const response = await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/events/test-event' })
          .expect(201);

        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('expiresIn', 60);

        // URL should contain the code and the encoded redirect path
        const url = new URL(response.body.url);
        expect(url.searchParams.get('code')).toMatch(/^[a-f0-9]{64}$/);
        expect(url.searchParams.get('redirect')).toBe('/events/test-event');
        expect(url.pathname).toBe('/auth/token-login');
      });

      it('should exchange the login link code for JWT tokens', async () => {
        // Step 1: Create a login link
        const createResponse = await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/events/test-event' })
          .expect(201);

        // Step 2: Extract code from URL
        const url = new URL(createResponse.body.url);
        const code = url.searchParams.get('code');
        expect(code).toBeTruthy();

        // Step 3: Exchange the code for tokens
        const exchangeResponse = await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code })
          .expect(200);

        expect(exchangeResponse.body).toHaveProperty('token');
        expect(exchangeResponse.body).toHaveProperty('refreshToken');
        expect(exchangeResponse.body).toHaveProperty('tokenExpires');
        expect(typeof exchangeResponse.body.token).toBe('string');
        expect(typeof exchangeResponse.body.refreshToken).toBe('string');
        expect(typeof exchangeResponse.body.tokenExpires).toBe('number');
      });

      it('should return a token that works for authenticated requests', async () => {
        // Step 1: Create a login link
        const createResponse = await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/dashboard' })
          .expect(201);

        // Step 2: Exchange the code
        const url = new URL(createResponse.body.url);
        const code = url.searchParams.get('code');

        const exchangeResponse = await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code })
          .expect(200);

        const exchangedToken = exchangeResponse.body.token;

        // Step 3: Verify the exchanged token works by calling /auth/me
        const meResponse = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${exchangedToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .expect(200);

        expect(meResponse.body).toHaveProperty('id');
        expect(meResponse.body).toHaveProperty('email');
      });
    });

    describe('Single-use: code cannot be reused', () => {
      it('should reject a code that has already been exchanged', async () => {
        // Step 1: Create a login link
        const createResponse = await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/events/some-event' })
          .expect(201);

        // Step 2: Extract code and exchange it successfully
        const url = new URL(createResponse.body.url);
        const code = url.searchParams.get('code');

        await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code })
          .expect(200);

        // Step 3: Try to exchange the same code again
        await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code })
          .expect(401);
      });
    });

    describe('Authentication required for create-login-link', () => {
      it('should reject unauthenticated requests', async () => {
        await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/events/test-event' })
          .expect(401);
      });
    });

    describe('Reject invalid code', () => {
      it('should return 401 for a code that does not exist in Redis', async () => {
        // A valid-format but non-existent code (64 hex characters)
        const fakeCode = 'a'.repeat(64);

        await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code: fakeCode })
          .expect(401);
      });
    });

    describe('Reject invalid redirect path (open redirect prevention)', () => {
      it('should reject redirectPath that does not start with /', async () => {
        const response = await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: 'https://evil.com/steal' })
          .expect(422);

        expect(response.body).toHaveProperty('errors');
        expect(response.body.errors).toHaveProperty('redirectPath');
      });

      it('should reject redirectPath containing ://', async () => {
        await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '/foo://bar' })
          .expect(422);
      });

      it('should reject empty redirectPath', async () => {
        await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ redirectPath: '' })
          .expect(422);
      });

      it('should reject missing redirectPath', async () => {
        await request(app)
          .post('/api/v1/auth/create-login-link')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({})
          .expect(422);
      });
    });

    describe('Code format validation', () => {
      it('should reject code that is not a 64-character hex string', async () => {
        await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ code: 'too-short' })
          .expect(422);
      });

      it('should reject missing code', async () => {
        await request(app)
          .post('/api/v1/auth/exchange-login-link')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({})
          .expect(422);
      });
    });
  });
});
