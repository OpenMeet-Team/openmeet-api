import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';
import { PermissionEntity } from '../../../../../permissions/infrastructure/persistence/relational/entities/permission.entity';

@Entity({ name: 'userPermissions' })
export class UserPermissionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.userPermissions, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => PermissionEntity, (permission) => permission.userPermissions, { eager: true })
  @JoinColumn({ name: 'permissionId' })
  permission: PermissionEntity;

  @Column({ type: 'boolean', default: false })
  granted: boolean;
}
