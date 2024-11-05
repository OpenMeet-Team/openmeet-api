import { Entity } from 'typeorm';
import { Column, PrimaryGeneratedColumn } from 'typeorm';
import { OneToMany } from 'typeorm';
import { PlanLimit } from '../../billing/entities/plan-limit.entity';

// Resource types describes the type of resource that is being tracked

// One ResourceType can be associated with many PlanLimit records
// Each PlanLimit belongs to exactly one ResourceType

// A resource type (like 'storage' or 'api_calls') will need different limits for different subscription plans
// For example:
// Free plan: 1GB storage
// Basic plan: 10GB storage
// Premium plan: 100GB storage

@Entity()
export class ResourceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  code: string; // 'storage', 'api_call', etc.

  @Column('text')
  name: string;

  @Column('text')
  unit: string; // 'bytes', 'calls', 'messages'

  @Column('text', { nullable: true })
  description: string;

  @OneToMany(() => PlanLimit, (limit) => limit.resourceType)
  planLimits: PlanLimit[];
}
