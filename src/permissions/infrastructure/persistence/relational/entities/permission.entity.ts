import { Column, Entity, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { UserPermissionEntity } from "../../../../../users/infrastructure/persistence/relational/entities/user-permission.entity";
import { RoleEntity } from "../../../../../roles/infrastructure/persistence/relational/entities/role.entity";

@Entity({ name: 'Permissions' })
export class PermissionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @OneToMany(() => UserPermissionEntity, up => up.permission)
  userPermissions: UserPermissionEntity[];

  @ManyToMany(() => RoleEntity, (role) => role.permissions)
  roles: RoleEntity[];
}
