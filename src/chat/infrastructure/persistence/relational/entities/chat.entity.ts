import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { ulid } from 'ulid';

@Entity({ name: 'chats' })
export class ChatEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToMany(() => UserEntity, (user) => user.chats, { eager: true })
  participants: UserEntity[];

  // Non-persisted properties for Matrix integration
  messages: any[]; // Changed from ZulipMessage[] to any[] to support Matrix messages

  user: UserEntity;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

  // Matrix-specific properties (non-persisted)
  name: string;
  topic: string;
  isPublic: boolean;
  memberCount: number;

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid().toLowerCase();
    }
  }

  participant: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
