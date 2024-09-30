import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { CategoryEntity } from "../../../../../categories/infrastructure/persistence/relational/entities/categories.entity";
import { UserEntity } from "../../../../../users/infrastructure/persistence/relational/entities/user.entity";

@Entity({name: 'Interest'})
export class InterestEntity extends EntityRelationalHelper{
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @ManyToOne(() => CategoryEntity, category => category.interests)
    @JoinColumn({name: 'categoryId'})
    category: CategoryEntity;

    @ManyToMany(() => UserEntity, (user) => user.interests)
    @JoinTable()
    users: UserEntity[];
}