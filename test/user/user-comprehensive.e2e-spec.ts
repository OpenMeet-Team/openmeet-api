import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import request from 'supertest';
import { RoleEnum } from '../../src/role/role.enum';
import { StatusEnum } from '../../src/status/status.enum';
import { loginAsAdmin } from '../utils/functions';

describe('User Service Comprehensive Tests', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
  });

  describe('User CRUD Operations', () => {
    let testUser: any;
    const originalEmail = `test-user-${Date.now()}@openmeet.net`;
    const originalPassword = 'original-password-123';
    const updatedEmail = `updated-user-${Date.now()}@openmeet.net`;
    const updatedPassword = 'updated-password-456';

    describe('User Creation', () => {
      it('should create a new user successfully', async () => {
        const response = await request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: originalEmail,
            password: originalPassword,
            firstName: 'Test',
            lastName: 'User',
            role: { id: RoleEnum.User },
            status: { id: StatusEnum.active },
          });

        expect(response.status).toBe(201);
        expect(response.body.email).toBe(originalEmail);
        expect(response.body.firstName).toBe('Test');
        expect(response.body.lastName).toBe('User');
        expect(response.body.id).toBeDefined();
        expect(response.body.slug).toBeDefined();
        expect(response.body.password).toBeUndefined(); // Should not expose password

        testUser = response.body;
      });

      it('should login with newly created user', async () => {
        const response = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: originalEmail,
            password: originalPassword,
          });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe(originalEmail);
      });
    });

    describe('User Reading', () => {
      it('should get user by ID', async () => {
        const response = await request(app)
          .get(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUser.id);
        expect(response.body.email).toBe(originalEmail);
        expect(response.body.password).toBeUndefined();
      });

      it('should get user profile by slug', async () => {
        const response = await request(app)
          .get(`/api/v1/users/${testUser.slug}/profile`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(testUser.slug);
        expect(response.body.email).toBe(originalEmail);
      });

      it('should list users with pagination', async () => {
        const response = await request(app)
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.hasNextPage).toBeDefined();

        // The test user should be in the list
        const foundUser = response.body.data.find(
          (u: any) => u.id === testUser.id,
        );
        if (response.body.data.length > 0) {
          expect(foundUser).toBeDefined();
          expect(foundUser.email).toBe(originalEmail);
        }
      });
    });

    describe('User Updates', () => {
      it('should update user email and password', async () => {
        const response = await request(app)
          .patch(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: updatedEmail,
            password: updatedPassword,
          });

        if (response.status !== 200) {
          console.log('User update failed:', response.status, response.body);
        }

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testUser.id);
        expect(response.body.email).toBe(updatedEmail);
        expect(response.body.slug).toBe(testUser.slug); // Slug should be preserved
        expect(response.body.password).toBeUndefined(); // Should not expose password
      });

      it('should login with updated credentials', async () => {
        const response = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: updatedEmail,
            password: updatedPassword,
          });

        if (response.status !== 200) {
          console.log(
            'Login with updated credentials failed:',
            response.status,
            response.body,
          );
        }

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe(updatedEmail);
      });

      it('should NOT login with old credentials', async () => {
        const response = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: originalEmail,
            password: originalPassword,
          });

        expect(response.status).toBe(422);
        expect(response.body.errors.email).toBe('User not found');
      });

      it('should update only firstName', async () => {
        const response = await request(app)
          .patch(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            firstName: 'UpdatedFirstName',
          });

        expect(response.status).toBe(200);
        expect(response.body.firstName).toBe('UpdatedFirstName');
        expect(response.body.email).toBe(updatedEmail); // Should preserve other fields
        expect(response.body.slug).toBe(testUser.slug);
      });
    });

    describe('User Deletion', () => {
      it('should soft delete user', async () => {
        const response = await request(app)
          .delete(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(204);
      });

      it('should not find deleted user by ID', async () => {
        const response = await request(app)
          .get(`/api/v1/users/${testUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect([404, 200]).toContain(response.status);
        if (response.status === 200) {
          // Soft deleted user should return null or empty object
          expect([null, {}]).toContainEqual(response.body);
        }
      });
    });
  });

  describe('Authorization Tests', () => {
    it('should reject user creation without admin token', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: 'unauthorized@test.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should reject user update without admin token', async () => {
      const response = await request(app)
        .patch('/api/v1/users/999')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          firstName: 'Hacked',
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should reject user list without admin token', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('User list response:', response.status, response.body);
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Validation Tests', () => {
    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: 'invalid-email',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(response.status).toBe(422);
    });

    it('should reject duplicate email', async () => {
      const email = `duplicate-${Date.now()}@test.com`;

      // Create first user
      await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'password123',
          firstName: 'First',
          lastName: 'User',
          role: { id: RoleEnum.User },
          status: { id: StatusEnum.active },
        });

      // Try to create second user with same email
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'password456',
          firstName: 'Second',
          lastName: 'User',
          role: { id: RoleEnum.User },
          status: { id: StatusEnum.active },
        });

      expect(response.status).toBe(422);
      expect(response.body.errors.email).toBe('emailAlreadyExists');
    });
  });
});
