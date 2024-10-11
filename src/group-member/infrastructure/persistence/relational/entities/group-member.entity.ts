import { Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupRoleEntity } from '../../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';

@Entity({ name: 'groupMembers' })
export class GroupMemberEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.groupUsers)
  user: UserEntity;

  @ManyToOne(() => GroupRoleEntity, (groupRole) => groupRole.groupUsers)
  groupRole: GroupRoleEntity;

  @ManyToOne(() => GroupEntity, (group) => group.groupMembers)
  @JoinColumn()
  group: GroupEntity;
}
