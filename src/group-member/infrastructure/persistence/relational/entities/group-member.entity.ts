import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupRoleEntity } from '../../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';

@Entity({ name: 'groupMembers' })
export class GroupMemberEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @ManyToOne(() => UserEntity, (user) => user.groupMembers, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;

  @ManyToOne(() => GroupRoleEntity, (groupRole) => groupRole.groupMembers)
  groupRole: GroupRoleEntity;

  @ManyToOne(() => GroupEntity, (group) => group.groupMembers)
  @JoinColumn()
  group: GroupEntity;
}
