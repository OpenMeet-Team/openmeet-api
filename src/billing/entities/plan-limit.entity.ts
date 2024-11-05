import { ManyToOne } from 'typeorm';

import { Column, Entity, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';

import { ResourceType } from '../../usage/entities/resource-type.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('plan_limits')
export class PlanLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('numeric')
  maxQuantity: number;

  @ManyToOne(() => SubscriptionPlan, { nullable: false })
  @JoinColumn({ name: 'planId' })
  plan: SubscriptionPlan;

  @ManyToOne(() => ResourceType, { nullable: false })
  @JoinColumn({ name: 'resourceTypeId' })
  resourceType: ResourceType;
}
