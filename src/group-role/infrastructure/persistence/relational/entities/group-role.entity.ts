import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { GroupPermissionEntity } from '../../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupRole } from '../../../../../core/constants/constant';

@Entity({ name: 'groupRoles' })
export class GroupRoleEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: GroupRole })
  name: GroupRole;
  // @Column({ type: 'varchar', length: 255 })
  // name: string; // TODO replace with enum or type

  @OneToMany(() => GroupMemberEntity, (groupUser) => groupUser.groupRole)
  groupMembers: GroupMemberEntity[];

  @ManyToMany(
    () => GroupPermissionEntity,
    (groupPermission) => groupPermission.groupRoles,
  )
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
