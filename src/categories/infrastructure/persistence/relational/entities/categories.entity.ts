import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { InterestEntity } from "../../../../../interests/infrastructure/persistence/relational/entities/interests.entity";
import { EventEntity } from "../../../../../events/infrastructure/persistence/relational/entities/events.entity";

@Entity({name: 'Category'})
export class CategoryEntity extends EntityRelationalHelper {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 255 })
    slug: string;

    @OneToMany(()=> InterestEntity, interest => interest.category)
    interests: InterestEntity[];

    @ManyToMany(() => EventEntity, (event) => event.categories)
    @JoinTable()
    events: EventEntity[];
}    