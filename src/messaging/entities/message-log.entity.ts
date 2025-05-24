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
import { MessageDraftEntity } from './message-draft.entity';
import { MessageChannel } from '../interfaces/message.interface';

@Entity('message_logs')
@Index(['tenantId', 'messageId'])
@Index(['tenantId', 'recipientUserId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'channel'])
export class MessageLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  tenantId: string;

  @Column({ nullable: true })
  messageId?: number;

  @Column()
  recipientUserId: number;

  @Column({
    type: 'enum',
    enum: MessageChannel,
  })
  channel: MessageChannel;

  @Column({
    type: 'enum',
    enum: ['sent', 'failed', 'bounced', 'delivered'],
  })
  status: 'sent' | 'failed' | 'bounced' | 'delivered';

  @CreateDateColumn()
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId?: string; // For tracking with external services (SES message ID, etc.)

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // For storing additional data like system message info

  // Relations
  @ManyToOne(() => MessageDraftEntity)
  @JoinColumn({ name: 'messageId' })
  message: MessageDraftEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'recipientUserId' })
  recipient: UserEntity;
}
