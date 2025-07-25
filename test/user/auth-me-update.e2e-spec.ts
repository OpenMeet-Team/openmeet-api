import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import request from 'supertest';
import { createTestUser } from '../utils/functions';
import { cleanupTestEntities } from '../utils/database-cleanup';

describe('User Self-Update (/auth/me) - UI Path', () => {
  const app = TESTING_APP_URL;

  describe('User Profile Updates', () => {
    let userToken: string;
    let testEmail: string;
    const originalPassword = 'original-password-123';
    const newPassword = 'new-password-456';

    beforeAll(async () => {
      // Clean up any existing test users first
      await cleanupTestEntities(['openmeet-test.user']);
      
      // Create a test user using the registration endpoint
      testEmail = `openmeet-test.user-${Date.now()}@openmeet.net`;
      const userData = await createTestUser(
        app,
        TESTING_TENANT_ID,
        testEmail,
        'TestFirst',
        'TestLast',
        originalPassword,
      );
      userToken = userData.token;
    });

    afterAll(async () => {
      // Clean up test user after tests complete
      await cleanupTestEntities(['openmeet-test.user']);
    });

    describe('Basic Profile Updates', () => {
      it('should update firstName via auth/me endpoint', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            firstName: 'UpdatedFirstName',
          });

        expect(response.status).toBe(200);
        expect(response.body.firstName).toBe('UpdatedFirstName');
        expect(response.body.lastName).toBe('TestLast'); // Should preserve other fields
        expect(response.body.email).toBe(testEmail);
      });

      it('should update lastName via auth/me endpoint', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            lastName: 'UpdatedLastName',
          });

        expect(response.status).toBe(200);
        expect(response.body.lastName).toBe('UpdatedLastName');
        expect(response.body.firstName).toBe('UpdatedFirstName'); // Should preserve from previous test
      });

      it('should update bio via auth/me endpoint', async () => {
        const newBio = 'This is my updated bio with some **markdown** content';

        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            bio: newBio,
          });

        expect(response.status).toBe(200);
        expect(response.body.bio).toBe(newBio);
      });
    });

    describe('Password Changes', () => {
      it('should require oldPassword to change password', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            password: newPassword,
            // Missing oldPassword
          });

        expect(response.status).toBe(422);
        expect(response.body.errors.oldPassword).toBeDefined();
      });

      it('should reject incorrect oldPassword', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            password: newPassword,
            oldPassword: 'wrong-password',
          });

        expect(response.status).toBe(422);
        expect(response.body.errors.oldPassword).toBe(
          'Incorrect current password',
        );
      });

      it('should successfully change password with correct oldPassword', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            password: newPassword,
            oldPassword: originalPassword,
          });

        expect(response.status).toBe(200);
        expect(response.body.password).toBeUndefined(); // Should not expose password
      });

      it('should be able to login with new password', async () => {
        const response = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: testEmail,
            password: newPassword,
          });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe(testEmail);
      });

      it('should NOT be able to login with old password', async () => {
        const response = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: testEmail,
            password: originalPassword,
          });

        expect(response.status).toBe(422);
        // Password was changed, so old password should fail login
        expect(response.body.errors).toBeDefined();
      });
    });

    describe('Email Changes', () => {
      const newEmail = `openmeet-test.updated-${Date.now()}@openmeet.net`;

      it('should handle email change requests', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: newEmail,
          });

        expect(response.status).toBe(200);
        // Note: Email should not be changed immediately - requires confirmation
        expect(response.body.email).toBe(testEmail); // Should still be old email
      });

      it('should reject duplicate email', async () => {
        // First create another user
        const anotherUser = await createTestUser(
          app,
          TESTING_TENANT_ID,
          `openmeet-test.another-${Date.now()}@openmeet.net`,
          'Another',
          'User',
        );

        // Try to change our email to the other user's email
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: anotherUser.email,
          });

        expect(response.status).toBe(422);
        expect(response.body.errors.email).toBe(
          'This email is already in use.',
        );
      });
    });

    describe('Authorization', () => {
      it('should reject updates without authentication', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            firstName: 'Hacker',
          });

        expect(response.status).toBe(401);
      });

      it('should reject updates with invalid token', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', 'Bearer invalid-token')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            firstName: 'Hacker',
          });

        expect(response.status).toBe(401);
      });
    });

    describe('Data Validation', () => {
      it('should reject invalid email format', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: 'invalid-email-format',
          });

        expect(response.status).toBe(422);
      });

      it('should handle missing fields gracefully', async () => {
        const response = await request(app)
          .patch('/api/v1/auth/me')
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({});

        // Empty update should succeed (no changes)
        expect(response.status).toBe(200);
      });
    });
  });
});
