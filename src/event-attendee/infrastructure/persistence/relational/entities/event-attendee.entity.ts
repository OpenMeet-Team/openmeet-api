import {
  Entity,
  Column,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeStatus } from '../../../../../core/constants/constant';
import { EventRoleEntity } from '../../../../../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { SourceFields } from '../../../../../core/interfaces/source-data.interface';
import { EventSourceType } from '../../../../../core/constants/source-type.constant';

@Entity({ name: 'eventAttendees' })
@Index('IDX_eventAttendees_user', ['user'])
@Index('IDX_eventAttendees_event', ['event'])
@Index('IDX_eventAttendees_user_status', ['user', 'status'])
@Index('IDX_eventAttendees_status_event', ['status', 'event'])
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

  /**
   * AT Protocol URI where this RSVP is published (on attendee's PDS).
   * Format: at://did:plc:xxx/community.lexicon.calendar.rsvp/rkey
   * NULL means not yet published.
   * Note: Distinct from sourceId which tracks IMPORTED records from external sources.
   */
  @Column({ type: 'text', nullable: true })
  atprotoUri: string | null;

  /**
   * AT Protocol record key for this RSVP.
   * Used for updates/deletes on the PDS. TIDs are ~13 chars.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  atprotoRkey: string | null;

  /**
   * When this RSVP was last synced to the user's PDS.
   * Compare with updatedAt to detect changes needing re-sync.
   */
  @Column({ type: 'timestamp', nullable: true })
  atprotoSyncedAt: Date | null;
}
