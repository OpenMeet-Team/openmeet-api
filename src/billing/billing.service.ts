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
      relations: ['plan', 'plan.limits'],
    });
  }

  // returns true if the user is using less than the limit for the resource type
  async checkUserLimits(
    userId: string,
    resourceType: string,
  ): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return false;
    }
    //  check if the user is within limits for the resource type
    const usage = await this.usageService.getUsage(userId, resourceType);
    const limit = subscription.plan.limits.find(
      (limit) => limit.resourceType.code === resourceType,
    )?.maxQuantity;

    // if the limit is not set, the user is within limits
    if (!limit) {
      return true;
    }

    return usage < limit;
  }
}
