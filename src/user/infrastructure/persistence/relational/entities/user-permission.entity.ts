import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { PermissionEntity } from '../../../../../permission/infrastructure/persistence/relational/entities/permission.entity';

@Entity({ name: 'userPermissions' })
export class UserPermissionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.userPermissions, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(
    () => PermissionEntity,
    (permission) => permission.userPermissions,
    { eager: true },
  )
  @JoinColumn({ name: 'permissionId' })
  permission: PermissionEntity;
}
