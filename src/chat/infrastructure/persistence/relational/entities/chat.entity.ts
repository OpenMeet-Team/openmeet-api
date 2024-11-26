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
import { ZulipMessage } from 'zulip-js';
import { ulid } from 'ulid';

@Entity({ name: 'chats' })
export class ChatEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToMany(() => UserEntity, (user) => user.chats, { eager: true })
  participants: UserEntity[];

  messages: ZulipMessage[];

  user: UserEntity;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

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
