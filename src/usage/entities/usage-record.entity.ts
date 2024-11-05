import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// UsageRecord records the usage of a resource by a user
// Usage is tracked for billing purposes

// Example:
// User '123' uses 100MB of storage on '2024-03-01'
// User '123' makes 1 api_calls on '2024-03-01'
// User '456' uses 20s of api_time on '2024-03-01'

@Entity()
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamp')
  timestamp: Date;

  @Column('text')
  resourceType: string; // 'storage', 'api_call', 'message', etc.

  @Column('numeric')
  quantity: number;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  // For aggregation and reporting
  @Column('date')
  usageDate: Date;

  @Column('text')
  billingPeriod: string; // '2024-03' format for monthly billing
}
