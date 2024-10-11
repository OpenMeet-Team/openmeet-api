import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import slugify from 'slugify';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { EventEntity } from '../../../../../events/infrastructure/persistence/relational/entities/events.entity';
import { SubCategoryEntity } from '../../../../../sub-categories/infrastructure/persistence/relational/entities/sub-categories.entity';
import { GroupEntity } from '../../../../../groups/infrastructure/persistence/relational/entities/group.entity';

@Entity({ name: 'categories' })
export class CategoryEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string;

  @OneToMany(() => SubCategoryEntity, (SC) => SC.category)
  subCategories: SubCategoryEntity[];

  @ManyToMany(() => EventEntity, (event) => event.categories)
  @JoinTable({ name: 'eventCategories' })
  events: EventEntity[];

  @ManyToMany(() => GroupEntity, (group) => group.categories)
  groups: GroupEntity[];

  @BeforeInsert()
  generateSlug() {
    if (!this.slug) {
      this.slug = slugify(this.name, { lower: true });
    }
  }
}
