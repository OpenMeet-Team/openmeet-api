import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './group-user-permission.entity';
import slugify from 'slugify';
import { Status } from '../../../../../core/constants/constant';

@Entity({ name: 'groups' })
export class GroupEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'boolean', default: false })
  approved: boolean;

  @Column({
    nullable: true,
    type: 'enum',
    enum: Status,
  })
  status: Status;

  @OneToMany(() => EventEntity, (event) => event.group)
  events: EventEntity[];

  @OneToMany(() => GroupMemberEntity, (gm) => gm.group)
  groupMembers: GroupMemberEntity[];

  @OneToMany(
    () => GroupUserPermissionEntity,
    (groupUserPermission) => groupUserPermission.group,
  )
  groupUserPermissions: GroupUserPermissionEntity[];

  @ManyToMany(() => CategoryEntity, (category) => category.groups)
  @JoinTable({ name: 'groupCategories' })
  categories: CategoryEntity[];

  @BeforeInsert()
  generateSlug() {
    if (!this.slug) {
      this.slug = slugify(this.name, { lower: true });
    }
  }
}
