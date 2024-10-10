import { Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupEntity } from '../../../../../groups/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { GroupRoleEntity } from '../../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';

@Entity({ name: 'groupMember' })
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
