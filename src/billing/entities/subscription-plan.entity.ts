import { OneToMany } from 'typeorm';

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { PlanLimit } from './plan-limit.entity';

@Entity()
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  code: string; // 'free', 'pro', 'enterprise'

  @Column('text')
  name: string;

  @Column('text')
  billingPeriod: string; // 'monthly', 'yearly'

  @Column('numeric')
  price: number;

  @Column('text')
  stripePriceId: string;

  @OneToMany(() => PlanLimit, (limit) => limit.plan)
  limits: PlanLimit[];
}
