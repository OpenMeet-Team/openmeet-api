import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  DeleteDateColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';

import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({
  name: 'sessions',
})
export class SessionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  user: UserEntity;

  @Column()
  hash: string;

  /**
   * Secure session identifier (UUID v4)
   *
   * SECURITY: This UUID is used as the session token exposed to clients via cookies.
   * It prevents session enumeration/prediction attacks by using cryptographically
   * random values instead of sequential numeric IDs.
   *
   * - Stored in cookies as 'oidc_session'
   * - Used for session lookups via findBySecureId()
   * - Never expose the numeric 'id' field to clients
   */
  @Column({ unique: true, nullable: false })
  @Index()
  secureId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
