import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { EventEntity } from "../../../../../events/infrastructure/persistence/relational/entities/events.entity";
import { SubCategoryEntity } from "../../../../../sub-categories/infrastructure/persistence/relational/entities/sub-categories.entity";
import { GroupEntity } from "../../../../../groups/infrastructure/persistence/relational/entities/group.entity";

@Entity({name: 'Category'})
export class CategoryEntity extends EntityRelationalHelper {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255 })
    slug: string;

    @OneToMany(()=> SubCategoryEntity, SC => SC.category)
    subCategories: SubCategoryEntity[];

    @ManyToMany(() => EventEntity, (event) => event.categories)
    @JoinTable()
    events: EventEntity[];

    @ManyToMany(() => GroupEntity, group => group.categories)
    @JoinTable()
    groups: GroupEntity[];
}    