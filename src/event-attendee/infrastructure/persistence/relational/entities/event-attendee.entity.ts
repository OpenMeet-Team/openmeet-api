import {
  Entity,
  Column,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeStatus } from '../../../../../core/constants/constant';
import { EventRoleEntity } from '../../../../../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { SourceFields } from '../../../../../core/interfaces/source-data.interface';
import { EventSourceType } from '../../../../../core/constants/source-type.constant';

@Entity({ name: 'eventAttendees' })
export class EventAttendeesEntity implements SourceFields {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventAttendeeStatus,
  })
  status: EventAttendeeStatus;

  @ManyToOne(() => EventRoleEntity, (eventRole) => eventRole.attendees)
  role: EventRoleEntity;

  @ManyToOne(() => EventEntity, (event) => event.attendees)
  event: EventEntity;

  @ManyToOne(() => UserEntity, (user) => user.attendedEvents)
  user: UserEntity;

  @Column({ type: 'text', nullable: true })
  approvalAnswer?: string;

  // Source tracking fields (from SourceFields interface)
  @Column({ type: 'enum', enum: 'event_source_type', nullable: true })
  sourceType: EventSourceType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  /**
   * The unique identifier for the external source of this attendance.
   * For Bluesky RSVPs, this should be the full URI (e.g., at://did:plc:abcdef/app.bsky.feed.post/12345)
   */
  sourceId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  sourceData: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;
}
