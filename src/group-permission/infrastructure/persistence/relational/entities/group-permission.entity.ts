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

@Entity({ name: 'groupPermissions' })
export class GroupPermissionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @OneToMany(
    () => GroupUserPermissionEntity,
    (groupUserPermission) => groupUserPermission.groupPermission,
  )
  groupUserPermissions: GroupUserPermissionEntity[];

  @ManyToMany(() => GroupRoleEntity, (groupRole) => groupRole.groupPermissions)
  groupRoles: GroupRoleEntity[];
}
