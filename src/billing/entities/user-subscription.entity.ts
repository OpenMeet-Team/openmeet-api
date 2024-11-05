import { ManyToOne } from 'typeorm';

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { SubscriptionPlan } from './subscription-plan.entity';

@Entity()
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => SubscriptionPlan)
  plan: SubscriptionPlan;

  @Column('text')
  status: 'active' | 'past_due' | 'canceled' | 'trialing';

  @Column('timestamp')
  currentPeriodStart: Date;

  @Column('timestamp')
  currentPeriodEnd: Date;

  @Column('text', { nullable: true })
  stripeSubscriptionId: string;

  @Column('text', { nullable: true })
  stripeCustomerId: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;
}
