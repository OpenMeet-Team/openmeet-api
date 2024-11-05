import request from 'supertest';
import { APP_URL, TESTER_USER_ID, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { INestApplication } from '@nestjs/common';
import { ResourceType } from '../../src/usage/entities/resource-type.entity';
import { PlanLimit } from '../../src/billing/entities/plan-limit.entity';
import { UserSubscription } from '../../src/billing/entities/user-subscription.entity';
import { SubscriptionPlan } from '../../src/billing/entities/subscription-plan.entity';
import { REQUEST } from '@nestjs/core';
import { TenantModule } from '../../src/tenant/tenant.module';
import { TenantConnectionService } from '../../src/tenant/tenant.service';
import { UsageRecord } from '../../src/usage/entities/usage-record.entity';

describe('Billing Limits (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantConnectionService: TenantConnectionService;
  let tenantConnection: DataSource;

  let token: string;
  let testEntities: { entity: any; id: any }[] = [];

  // Setup application
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TenantModule],
    })
      .overrideProvider(REQUEST)
      .useValue({
        headers: {
          'tenant-id': TESTING_TENANT_ID,
        },
      })
      .compile();

    app = moduleRef.createNestApplication();

    // Set up request scope
    app.use((req, res, next) => {
      req.tenantId = TESTING_TENANT_ID;
      next();
    });

    await app.init();

    dataSource = moduleRef.get<DataSource>(DataSource);
    tenantConnectionService = moduleRef.get<TenantConnectionService>(
      TenantConnectionService,
    );
    tenantConnection =
      await tenantConnectionService.getTenantConnection(TESTING_TENANT_ID);

    console.log('tenantConnection', TESTING_TENANT_ID);
    expect(tenantConnection).toBeDefined();
  }, 30000);

  // Before each test, get a fresh auth token
  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should prevent file upload when storage limit is exceeded', async () => {
    try {
      // Create resource type
      const resourceType = await tenantConnection
        .getRepository(ResourceType)
        .save({
          code: 'storage',
          name: 'Storage',
          unit: 'bytes',
        });
      testEntities.push({ entity: ResourceType, id: resourceType.id });

      // Create plan with very low storage limit
      const plan = await tenantConnection.getRepository(SubscriptionPlan).save({
        name: 'Test Plan Tiny File Limit',
        code: 'test-plan-tiny-file-limit',
        billingPeriod: 'monthly',
        price: 1,
        stripePriceId: 'price_123',
      });
      testEntities.push({ entity: SubscriptionPlan, id: plan.id });

      // Create plan limit
      const planLimit = await tenantConnection.getRepository(PlanLimit).save({
        plan: { id: plan.id },
        resourceType: { id: resourceType.id },
        maxQuantity: 1, // 1 byte limit
      });
      testEntities.push({ entity: PlanLimit, id: planLimit.id });

      // Create user subscription
      const subscription = await tenantConnection
        .getRepository(UserSubscription)
        .save({
          userId: TESTER_USER_ID.toString(),
          plan: { id: plan.id },
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 60 * 60 * 24),
        });
      testEntities.push({ entity: UserSubscription, id: subscription.id });

      // First request should succeed (getting pre-signed URL)
      const text = 'more than one byte, looks like a Jpeg';
      const response = await request(APP_URL)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID)
        .send({
          fileName: 'test.jpeg',
          fileSize: Buffer.from(text).length,
          mimeType: 'image/jpeg',
        });

      expect(response.status).toBe(201);
      expect(response.body.uploadSignedUrl).toBeDefined(); // Should return pre-signed URL

      // Record usage to simulate file being uploaded
      await tenantConnection.getRepository(UsageRecord).save({
        userId: TESTER_USER_ID.toString(),
        timestamp: new Date(),
        resourceType: resourceType.code, // Using the code ('storage') instead of the ID
        quantity: Buffer.from(text).length,
        metadata: {
          fileName: 'test.jpeg',
          mimeType: 'image/jpeg',
        },
        usageDate: new Date(),
        billingPeriod: new Date().toISOString().substring(0, 7), // Format: '2024-03'
      });

      // Second request should fail due to limit
      const response2 = await request(APP_URL)
        .post('/api/v1/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID)
        .send({
          fileName: 'test2.jpeg',
          fileSize: Buffer.from(text).length,
          mimeType: 'image/jpeg',
        });

      expect(response2.status).toBe(403);
      expect(response2.body.message).toBe('Storage limit exceeded');
    } catch (error) {
      throw error;
    }
  });

  // After each test, clean up created entities
  afterEach(async () => {
    if (testEntities.length > 0) {
      // Delete usage records first
      await tenantConnection.getRepository(UsageRecord).delete({
        userId: TESTER_USER_ID.toString(),
      });

      // Then delete other entities in reverse order
      for (const record of testEntities.reverse()) {
        await tenantConnection.getRepository(record.entity).delete(record.id);
      }
      testEntities = [];
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
