import {
  Column,
  Entity,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { SubCategoryType } from '../../../../../core/constants/constant';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';

@Entity({ name: 'subcategories' })
export class SubCategoryEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    nullable: true,
    type: 'enum',
    enum: SubCategoryType,
  })
  type: SubCategoryType;

  @ManyToOne(() => CategoryEntity, (category) => category.subCategories)
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @ManyToMany(() => UserEntity, (user) => user.subCategory)
  users: UserEntity[];
}
