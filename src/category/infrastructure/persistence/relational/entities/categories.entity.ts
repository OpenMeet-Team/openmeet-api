import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import slugify from 'slugify';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { SubCategoryEntity } from '../../../../../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';

@Entity({ name: 'categories' })
export class CategoryEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

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
