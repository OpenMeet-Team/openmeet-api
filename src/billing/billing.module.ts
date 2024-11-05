import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanLimit } from './entities/plan-limit.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, PlanLimit, UserSubscription]),
    UsageModule,
  ],
  providers: [BillingService],
  controllers: [BillingController],
})
export class BillingModule {}
