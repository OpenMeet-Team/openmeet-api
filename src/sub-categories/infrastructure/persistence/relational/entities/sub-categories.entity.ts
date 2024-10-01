import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { CategoryEntity } from "../../../../../categories/infrastructure/persistence/relational/entities/categories.entity";
import { SubCategoryType } from "../../../../../core/constants/constant";
import { UserEntity } from "../../../../../users/infrastructure/persistence/relational/entities/user.entity";

@Entity({name: 'subCategory'})
export class SubCategoryEntity extends EntityRelationalHelper{
    @PrimaryGeneratedColumn()
    id: number;
  
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

    @ManyToOne(() => CategoryEntity, category => category.subCategories)
    @JoinColumn({name: 'categoryId'})
    category: CategoryEntity;

    @ManyToMany(() => UserEntity, (user) => user.subCategory)
    @JoinTable({name: 'userInterests'})
    users: UserEntity[];
}
