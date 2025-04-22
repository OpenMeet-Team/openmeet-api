import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_USER_ID,
} from '../utils/constants';
import { loginAsAdmin, loginAsTester } from '../utils/functions';
import { AuthProvidersEnum } from '../../src/auth/auth-providers.enum';

describe('Shadow Account Integration Tests', () => {
  let adminToken: string;
  let userToken: string;
  let createdShadowAccount: any;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
    userToken = await loginAsTester();
  });

  describe('Access Controls', () => {
    it('should restrict access to shadow account API for regular users', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/shadow-accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should allow admin user to access shadow account API', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/shadow-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });
  });

  describe('Shadow Account Creation and Claiming', () => {
    it('should allow admin to create a shadow account', async () => {
      const uniqueId = `test-${Date.now()}`;
      const testShadowAccount = {
        externalId: uniqueId,
        displayName: 'Test Shadow User',
        provider: AuthProvidersEnum.bluesky,
        preferences: {
          bluesky: {
            did: uniqueId,
            handle: 'testshadowuser',
            connected: false,
          },
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/shadow-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(testShadowAccount);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.displayName).toBe('Test Shadow User');
      expect(response.body.externalId).toBe(testShadowAccount.externalId);
      expect(response.body.provider).toBe(AuthProvidersEnum.bluesky);

      createdShadowAccount = response.body;
    });

    it('should allow admin to claim a shadow account for a user', async () => {
      if (!createdShadowAccount) {
        console.log('Skipping test: Shadow account not created');
        return;
      }

      const claimRequest = {
        userId: TESTING_USER_ID,
        externalId: createdShadowAccount.externalId,
        provider: createdShadowAccount.provider,
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/v1/auth/internal/claim-shadow-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(claimRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Shadow account claimed successfully');
      expect(response.body.userId).toBe(TESTING_USER_ID);

      // Verify the shadow account no longer exists
      const checkResponse = await request(TESTING_APP_URL)
        .get('/api/shadow-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(checkResponse.status).toBe(200);

      const accountStillExists = checkResponse.body.some(
        (account: any) =>
          account.externalId === createdShadowAccount.externalId,
      );
      expect(accountStillExists).toBe(false);
    });
  });
});
