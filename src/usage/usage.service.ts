import { Inject, Injectable, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';

import { UsageRecord } from './entities/usage-record.entity';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UsageAggregate } from './entities/usage-aggregate.entity';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class UsageService {
  private usageRecordRepository: Repository<UsageRecord>;
  private usageAggregateRepository: Repository<UsageAggregate>;
  private initialized = false;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async ensureInitialized() {
    if (!this.initialized) {
      await this.getTenantSpecificRepository();
      this.initialized = true;
    }
  }
  async getTenantSpecificRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.usageRecordRepository = dataSource.getRepository(UsageRecord);
    this.usageAggregateRepository = dataSource.getRepository(UsageAggregate);
  }

  // trackUsage is used to record usage of a resource by a user

  async trackUsage(
    userId: string,
    resourceType: string,
    quantity: number,
    metadata?: Record<string, any>,
  ) {
    const record = this.usageRecordRepository.create({
      userId,
      resourceType,
      quantity,
      metadata: {
        ...metadata,
      },
      timestamp: new Date(),
      usageDate: new Date(),
      billingPeriod: this.getCurrentBillingPeriod(),
    });

    await this.ensureInitialized();
    await this.updateUsageAggregate(userId, resourceType, quantity);

    return this.usageRecordRepository.save(record);
  }

  private getCurrentBillingPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async getUsage(userId: string, resourceType: string): Promise<number> {
    await this.ensureInitialized();

    const usage = await this.usageRecordRepository.find({
      where: { userId, resourceType },
    });
    return usage.reduce((acc, curr) => acc + curr.quantity, 0);
  }

  async updateUsageAggregate(
    userId: string,
    resourceType: string,
    quantity: number,
  ) {
    await this.ensureInitialized();
    const currentPeriod = this.getCurrentBillingPeriod();

    // Find or create aggregate record
    let aggregate = await this.usageAggregateRepository.findOne({
      where: {
        userId,
        resourceType,
        billingPeriod: currentPeriod,
      },
    });

    if (!aggregate) {
      aggregate = this.usageAggregateRepository.create({
        userId,
        resourceType,
        billingPeriod: currentPeriod,
        totalQuantity: 0,
        lastUpdated: new Date(),
        aggregateKey: `${userId}-${resourceType}-${currentPeriod}`,
      });
    }

    // Update the total
    aggregate.totalQuantity += quantity;
    aggregate.lastUpdated = new Date();

    await this.usageAggregateRepository.save(aggregate);
  }

  async getUserResourceUsage(
    userId: string,
    resourceType: string,
    billingPeriod?: string,
  ) {
    await this.ensureInitialized();

    const period = billingPeriod || this.getCurrentBillingPeriod();

    const aggregate = await this.usageAggregateRepository.findOne({
      where: {
        userId,
        resourceType,
        billingPeriod: period,
      },
    });

    return aggregate?.totalQuantity || 0;
  }
}
