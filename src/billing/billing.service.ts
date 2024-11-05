import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UsageService } from '../usage/usage.service';
import { UserSubscription } from './entities/user-subscription.entity';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(UserSubscription)
    private userSubscriptionRepo: Repository<UserSubscription>,
    private usageService: UsageService,
  ) {}

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    return this.userSubscriptionRepo.findOne({
      where: { userId },
      relations: ['plan', 'plan.limits', 'plan.limits.resourceType'],
    });
  }

  // returns true if the user is using less than the limit for the resource type
  async checkUserLimits(
    userId: string,
    resourceType: string,
  ): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      console.log('No subscription found for user:', userId);
      return false;
    }

    const usage = await this.usageService.getUsage(userId, resourceType);
    const limit = subscription.plan.limits.find(
      (limit) => limit.resourceType.code === resourceType,
    )?.maxQuantity;

    console.log('Current usage:', usage);
    console.log('Limit:', limit);
    console.log(
      'Resource limits:',
      subscription.plan.limits.map((l) => ({
        code: l.resourceType.code,
        maxQuantity: l.maxQuantity,
      })),
    );

    // if the limit is not set, the user is within limits
    if (!limit) {
      console.log('No limit set for resource type:', resourceType);
      return true;
    }

    return usage < limit;
  }
}
