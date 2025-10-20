import {
  BeforeInsert,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { ulid } from 'ulid';

@Entity({ name: 'activityFeed' })
export class ActivityFeedEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // Activity identification
  @Column({ type: 'varchar', length: 50 })
  @Index()
  activityType: string;

  // Scoping: which feed does this belong to?
  @Column({ type: 'varchar', length: 20 })
  @Index()
  feedScope: 'sitewide' | 'group' | 'event';

  // Target references (polymorphic)
  @Column({ type: 'integer', nullable: true })
  groupId?: number;

  @Column({ type: 'integer', nullable: true })
  eventId?: number;

  // Relations (optional - for joins)
  @ManyToOne(() => GroupEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity;

  @ManyToOne(() => EventEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event?: EventEntity;

  // Actor tracking
  @Column({ type: 'integer', nullable: true })
  actorId?: number;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorId' })
  actor?: UserEntity;

  @Column({ type: 'integer', array: true, default: '{}' })
  actorIds: number[];

  // Target information (polymorphic)
  @Column({ type: 'varchar', length: 50, nullable: true })
  targetType?: string;

  @Column({ type: 'integer', nullable: true })
  targetId?: number;

  // Flexible metadata
  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  // Privacy control (DERIVED from parent entity)
  @Column({ type: 'varchar', length: 20, default: 'public' })
  @Index()
  visibility: 'public' | 'authenticated' | 'members_only' | 'private';

  // Aggregation fields
  @Column({ type: 'varchar', length: 200, nullable: true })
  @Index()
  aggregationKey?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  aggregationStrategy?: 'time_window' | 'daily' | 'none';

  @Column({ type: 'integer', default: 1 })
  aggregatedCount: number;

  // Composite indexes for performance
  // These are defined in the migration file

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid().toLowerCase();
    }
  }
}
