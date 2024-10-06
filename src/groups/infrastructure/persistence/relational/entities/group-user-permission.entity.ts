import { Entity, Column, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { GroupEntity } from './group.entity';
import { GroupPermissionEntity } from '../../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';

@Entity({ name: 'group_user_permissions' })
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

  @Column({ type: 'boolean', default: true })
  granted: boolean;
}
