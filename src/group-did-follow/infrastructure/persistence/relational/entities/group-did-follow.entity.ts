import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

@Entity({ name: 'groupDidFollows' })
export class GroupDIDFollowEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => GroupEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: GroupEntity;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  did: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
