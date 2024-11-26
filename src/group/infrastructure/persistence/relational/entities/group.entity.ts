import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './group-user-permission.entity';
import {
  GroupVisibility,
  GroupStatus,
} from '../../../../../core/constants/constant';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { Expose } from 'class-transformer';
import { FileEntity } from '../../../../../file/infrastructure/persistence/relational/entities/file.entity';
import { ApiProperty } from '@nestjs/swagger';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { generateShortCode } from '../../../../../utils/short-code';
import { ZulipMessage, ZulipTopic } from 'zulip-js';

@Entity({ name: 'groups' })
export class GroupEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    nullable: true,
    type: 'enum',
    enum: GroupStatus,
  })
  status: GroupStatus;

  @Column({
    nullable: true,
    type: 'enum',
    enum: GroupVisibility,
  })
  visibility: GroupVisibility;

  @Column({ type: 'boolean', default: true })
  requireApproval: boolean;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  @Index()
  locationPoint: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  location: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @OneToMany(() => EventEntity, (event) => event.group)
  events: EventEntity[];

  @OneToMany(() => GroupMemberEntity, (gm) => gm.group)
  groupMembers: GroupMemberEntity[];

  groupMember: GroupMemberEntity | null;

  @ManyToOne(() => UserEntity, (group) => group.groups)
  createdBy: UserEntity;

  @OneToMany(
    () => GroupUserPermissionEntity,
    (groupUserPermission) => groupUserPermission.group,
  )
  groupUserPermissions: GroupUserPermissionEntity[];

  @ApiProperty({
    type: () => FileEntity,
  })
  @OneToOne(() => FileEntity, {
    eager: true,
  })
  @JoinColumn()
  image?: FileEntity | null;

  @ManyToMany(() => CategoryEntity, (category) => category.groups)
  @JoinTable({
    name: 'groupCategories',
    joinColumn: {
      name: 'groupId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'categoryId',
      referencedColumnName: 'id',
    },
  })
  categories: CategoryEntity[];

  @Column({ type: 'integer', nullable: true })
  zulipChannelId: number;

  messages: ZulipMessage[];
  topics: ZulipTopic[];

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid().toLowerCase();
    }
  }

  @BeforeInsert()
  generateSlug() {
    if (!this.slug) {
      this.slug = `${slugify(this.name, { strict: true, lower: true })}-${generateShortCode().toLowerCase()}`;
    }
  }

  @Expose()
  get groupMembersCount(): number {
    return this.groupMembers ? this.groupMembers.length : 0;
  }
}
