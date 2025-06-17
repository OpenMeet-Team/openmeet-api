import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('matrixHandleRegistry')
@Index('idx_matrix_handle_registry_handle_lower', { synchronize: false })
export class MatrixHandleRegistryEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_matrix_handle_registry_handle')
  handle: string;

  @Column({ type: 'varchar', length: 255 })
  @Index('idx_matrix_handle_registry_tenant')
  tenantId: string;

  @Column({ type: 'integer' })
  userId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Compound index for tenant + user lookups
  @Index('idx_matrix_handle_registry_tenant_user', ['tenantId', 'userId'])
  static tenantUserIndex: void;
}
