import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import {
  MessageType,
  MessageStatus,
  MessageChannel,
} from '../interfaces/message.interface';

@Entity('message_drafts')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'authorId'])
@Index(['tenantId', 'groupId'])
@Index(['tenantId', 'eventId'])
export class MessageDraftEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  slug: string;

  @Column({ type: 'varchar', length: 50 })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: MessageType,
  })
  type: MessageType;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  htmlContent?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  templateId?: string;

  @Column({
    type: 'simple-array',
    transformer: {
      to: (value: MessageChannel[]) => {
        if (!value || value.length === 0) return '';
        return Array.isArray(value) ? value.join(',') : value;
      },
      from: (value: any) => {
        if (!value) return [];
        if (Array.isArray(value)) return value as MessageChannel[];
        if (typeof value === 'string')
          return value.split(',') as MessageChannel[];
        return [];
      },
    },
  })
  channels: MessageChannel[];

  // Context
  @Column({ nullable: true })
  groupId?: number;

  @Column({ nullable: true })
  eventId?: number;

  // Recipients
  @Column({
    type: 'simple-array',
    nullable: true,
    transformer: {
      to: (value: number[] | null) => {
        if (!value) return null;
        return Array.isArray(value) ? value.join(',') : value;
      },
      from: (value: any) => {
        if (!value) return null;
        if (Array.isArray(value)) return value.map(Number);
        if (typeof value === 'string') return value.split(',').map(Number);
        return null;
      },
    },
  })
  recipientUserIds?: number[];

  @Column({
    type: 'enum',
    enum: ['all', 'members', 'attendees', 'admins', 'moderators'],
    nullable: true,
  })
  recipientFilter?: 'all' | 'members' | 'attendees' | 'admins' | 'moderators';

  // Workflow
  @Column()
  authorId: number;

  @Column({ nullable: true })
  reviewerId?: number;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.DRAFT,
  })
  status: MessageStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  // Scheduling
  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserEntity, { eager: true })
  @JoinColumn({ name: 'authorId' })
  author: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'reviewerId' })
  reviewer?: UserEntity;

  @ManyToOne(() => GroupEntity, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity;

  @ManyToOne(() => EventEntity, { nullable: true })
  @JoinColumn({ name: 'eventId' })
  event?: EventEntity;
}
