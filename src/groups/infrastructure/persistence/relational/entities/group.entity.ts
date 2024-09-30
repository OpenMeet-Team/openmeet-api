import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { CategoryEntity } from "../../../../../categories/infrastructure/persistence/relational/entities/categories.entity";

@Entity({name: 'Group'})
export class GroupEntity extends EntityRelationalHelper{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'text' })
    description: string;

    @ManyToMany(()=> CategoryEntity, category => category.groups)
    @JoinTable()
    categories: CategoryEntity[];
}