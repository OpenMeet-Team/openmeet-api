import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './group-user-permission.entity';
import slugify from 'slugify';
import { Status, Visibility } from '../../../../../core/constants/constant';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';

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

  @Column({
    nullable: true,
    type: 'enum',
    enum: Status,
  })
  status: Status;

  @Column({
    nullable: true,
    type: 'enum',
    enum: Visibility,
  })
  visibility: Visibility;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @OneToMany(() => EventEntity, (event) => event.group)
  events: EventEntity[];

  @OneToMany(() => GroupMemberEntity, (gm) => gm.group)
  groupMembers: GroupMemberEntity[];

  @ManyToOne(() => UserEntity, (group) => group.groups)
  createdBy: UserEntity;

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
