import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { ApiProperty } from '@nestjs/swagger';
import { PermissionEntity } from '../../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { RoleEnum } from '../../../../role.enum';

@Entity({
  name: 'roles',
})
export class RoleEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    type: String,
    example: RoleEnum.Admin,
  })
  @Column()
  name?: RoleEnum;

  @OneToMany(() => UserEntity, (user) => user.role)
  users: UserEntity[];

  @ManyToMany(() => PermissionEntity, (permission) => permission.roles)
  @JoinTable({
    name: 'rolePermissions',
    joinColumn: {
      name: 'roleId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'permissionId',
      referencedColumnName: 'id',
    },
  })
  permissions: PermissionEntity[];
}
