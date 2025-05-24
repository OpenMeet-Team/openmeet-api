import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { MessageDraftEntity } from './message-draft.entity';

@Entity('message_audit')
@Index(['tenantId', 'userId'])
@Index(['tenantId', 'action'])
@Index(['tenantId', 'groupId'])
@Index(['tenantId', 'eventId'])
@Index(['tenantId', 'createdAt'])
export class MessageAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  tenantId: string;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: [
      'draft_created',
      'message_sent',
      'review_requested',
      'message_approved',
      'message_rejected',
      'rate_limit_exceeded',
      'message_send_skipped',
    ],
  })
  action:
    | 'draft_created'
    | 'message_sent'
    | 'review_requested'
    | 'message_approved'
    | 'message_rejected'
    | 'rate_limit_exceeded'
    | 'message_send_skipped';

  @Column({ nullable: true })
  groupId?: number;

  @Column({ nullable: true })
  eventId?: number;

  @Column({ nullable: true })
  messageId?: number;

  @Column({ type: 'json', nullable: true })
  details?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => GroupEntity, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity;

  @ManyToOne(() => EventEntity, { nullable: true })
  @JoinColumn({ name: 'eventId' })
  event?: EventEntity;

  @ManyToOne(() => MessageDraftEntity, { nullable: true })
  @JoinColumn({ name: 'messageId' })
  message?: MessageDraftEntity;
}
