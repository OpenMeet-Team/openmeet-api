import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// UsageAggregate is used to aggregate usage records for billing purposes
// UsageAggregate table is used to store pre-calculated totals of usage for faster querying and reporting.
// Instead of having to sum up all individual UsageRecord entries each time, we maintain running totals in the aggregate table.

@Entity('usage_aggregates')
export class UsageAggregate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('text')
  resourceType: string;

  @Column('text')
  billingPeriod: string;

  @Column('numeric')
  totalQuantity: number;

  @Column('timestamp')
  lastUpdated: Date;

  @Index(['userId', 'resourceType', 'billingPeriod'], { unique: true })
  @Column('text')
  aggregateKey: string;
}
