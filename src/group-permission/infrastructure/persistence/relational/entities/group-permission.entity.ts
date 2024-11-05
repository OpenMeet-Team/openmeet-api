import {
  Column,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupRoleEntity } from '../../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupUserPermissionEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group-user-permission.entity';
import { GroupPermission } from '../../../../../core/constants/constant';

@Entity({ name: 'groupPermissions' })
export class GroupPermissionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: GroupPermission })
  name: GroupPermission;

  @OneToMany(
    () => GroupUserPermissionEntity,
    (groupUserPermission) => groupUserPermission.groupPermission,
  )
  groupUserPermissions: GroupUserPermissionEntity[];

  @ManyToMany(() => GroupRoleEntity, (groupRole) => groupRole.groupPermissions)
  groupRoles: GroupRoleEntity[];
}
