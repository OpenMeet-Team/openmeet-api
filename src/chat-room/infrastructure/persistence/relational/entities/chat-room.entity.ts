import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';

export enum ChatRoomType {
  EVENT = 'event',
  GROUP = 'group',
  DIRECT = 'direct',
}

export enum ChatRoomVisibility {
  PUBLIC = 'public', // Visible to all members of a group or event
  PRIVATE = 'private', // Visible only to specific members
}

@Entity({ name: 'chat_rooms' })
export class ChatRoomEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  topic: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  @Index()
  matrixRoomId: string;

  @Column({
    type: 'enum',
    enum: ChatRoomType,
    default: ChatRoomType.GROUP,
  })
  type: ChatRoomType;

  @Column({
    type: 'enum',
    enum: ChatRoomVisibility,
    default: ChatRoomVisibility.PUBLIC,
  })
  visibility: ChatRoomVisibility;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    historyVisibility?: string;
    guestAccess?: boolean;
    requireInvitation?: boolean;
    encrypted?: boolean;
  };

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'creatorId' })
  creator: UserEntity;

  @ManyToOne(() => EventEntity, { nullable: true })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  @ManyToOne(() => GroupEntity, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group: GroupEntity;

  @ManyToMany(() => UserEntity)
  @JoinTable({
    name: 'user_chat_rooms',
    joinColumn: { name: 'chatRoomId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  members: UserEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
