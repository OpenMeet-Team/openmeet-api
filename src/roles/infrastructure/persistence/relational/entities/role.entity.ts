import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryColumn } from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { ApiProperty } from '@nestjs/swagger';
import { PermissionEntity } from '../../../../../permissions/infrastructure/persistence/relational/entities/permission.entity';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';

@Entity({
  name: 'role',
})
export class  RoleEntity extends EntityRelationalHelper {
  @ApiProperty({
    type: Number,
  })
  @PrimaryColumn()
  id: number;

  @ApiProperty({
    type: String,
    example: 'admin',
  })
  @Column()
  name?: string;

  @OneToMany(()=> UserEntity, user => user.role)
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
