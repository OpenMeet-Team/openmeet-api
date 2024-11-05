import { ManyToOne } from 'typeorm';

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { ResourceType } from '../../usage/entities/resource-type.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity()
export class PlanLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SubscriptionPlan)
  plan: SubscriptionPlan;

  @ManyToOne(() => ResourceType)
  resourceType: ResourceType;

  @Column('numeric')
  maxQuantity: number;

  @Column('boolean', { default: false })
  isOveragePossible: boolean;

  @Column('numeric', { nullable: true })
  overageRate: number; // Cost per unit over limit
}
