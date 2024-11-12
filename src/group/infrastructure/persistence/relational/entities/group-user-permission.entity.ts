import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupPermissionEntity } from '../../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { GroupEntity } from './group.entity';

@Entity({ name: 'groupUserPermissions' })
export class GroupUserPermissionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.groupUserPermissions)
  user: UserEntity;

  @ManyToOne(() => GroupEntity, (group) => group.groupUserPermissions)
  group: GroupEntity;

  @ManyToOne(
    () => GroupPermissionEntity,
    (groupPermission) => groupPermission.groupUserPermissions,
  )
  groupPermission: GroupPermissionEntity;
}
