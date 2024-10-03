import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { GroupPermissionEntity } from "../../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity";
import { GroupMemberEntity } from "../../../../../group-members/infrastructure/persistence/relational/entities/group-member.entity";

@Entity({ name: 'groupRole' })
export class GroupRoleEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @OneToMany(() => GroupMemberEntity, groupUser => groupUser.groupRole)
  groupUsers: GroupMemberEntity[];

  @ManyToMany(() => GroupPermissionEntity, groupPermission => groupPermission.groupRoles)
  @JoinTable({
    name: 'groupRolePermissions',
    joinColumn: {
      name: 'groupRoleId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'groupPermissionId',
      referencedColumnName: 'id',
    },
  })
  groupPermissions: GroupPermissionEntity[];
}
