import {
  Column,
  AfterLoad,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  BeforeInsert,
} from 'typeorm';
import { RoleEntity } from '../../../../../role/infrastructure/persistence/relational/entities/role.entity';
import { StatusEntity } from '../../../../../status/infrastructure/persistence/relational/entities/status.entity';
import { FileEntity } from '../../../../../file/infrastructure/persistence/relational/entities/file.entity';

import { AuthProvidersEnum } from '../../../../../auth/auth-providers.enum';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';

// We use class-transformer in ORM entity and domain entity.
// We duplicate these rules because you can choose not to use adapters
// in your project and return an ORM entity directly in response.
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { SubCategoryEntity } from '../../../../../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import { UserPermissionEntity } from './user-permission.entity';
import { GroupUserPermissionEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group-user-permission.entity';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { ulid } from 'ulid';
@Entity({
  name: 'users',
})
export class UserEntity extends EntityRelationalHelper {
  @ApiProperty({
    type: Number,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    type: String,
  })
  @Column({ type: String, unique: true })
  ulid: string;

  @ApiProperty({
    type: String,
    example: 'john.doe@openmeet.net',
  })
  // For "string | null" we need to use String type.
  // More info: https://github.com/typeorm/typeorm/issues/2567
  @Column({ type: String, unique: true, nullable: true })
  @Expose({ groups: ['me', 'admin'] })
  email: string | null;

  @Column({ nullable: true })
  @Exclude({ toPlainOnly: true })
  password?: string;

  @Exclude({ toPlainOnly: true })
  public previousPassword?: string;

  @AfterLoad()
  public loadPreviousPassword(): void {
    this.previousPassword = this.password;
  }

  @ApiProperty({
    type: String,
    example: 'email',
  })
  @Column({ default: AuthProvidersEnum.email })
  @Expose({ groups: ['me', 'admin'] })
  provider: string;

  @ApiProperty({
    type: String,
    example: '1234567890',
  })
  @Index()
  @Column({ type: String, nullable: true })
  @Expose({ groups: ['me', 'admin'] })
  socialId?: string | null;

  @ApiProperty({
    type: String,
    example: 'John',
  })
  @Index()
  @Column({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({
    type: String,
    example: 'Doe',
  })
  @Index()
  @Column({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({
    type: () => FileEntity,
  })
  @OneToOne(() => FileEntity, {
    eager: true,
  })
  @JoinColumn()
  photo?: FileEntity | null;

  @ApiProperty({
    type: () => StatusEntity,
  })
  @ManyToOne(() => StatusEntity, {
    eager: true,
  })
  status?: StatusEntity;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty()
  @DeleteDateColumn()
  deletedAt: Date;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({
    type: 'integer',
    nullable: true,
  })
  zulipId?: number;

  @ManyToOne(() => RoleEntity, (role) => role.users)
  @JoinColumn({ name: 'roleId' })
  role: RoleEntity;

  @OneToMany(() => EventEntity, (event) => event.user)
  events: EventEntity[];

  @OneToMany(() => GroupMemberEntity, (groupMember) => groupMember.user)
  groupMembers: GroupMemberEntity[];

  @OneToMany(() => GroupEntity, (group) => group.createdBy)
  groups: GroupEntity[];

  @OneToMany(() => UserPermissionEntity, (up) => up.user)
  userPermissions: UserPermissionEntity[];

  @OneToMany(() => EventAttendeesEntity, (event) => event.user)
  attendedEvents: EventAttendeesEntity[];

  @OneToMany(
    () => GroupUserPermissionEntity,
    (groupUserPermission) => groupUserPermission.user,
  )
  groupUserPermissions: GroupUserPermissionEntity[];

  @ManyToMany(() => SubCategoryEntity, (SC) => SC.users)
  @JoinTable({ name: 'userInterests' })
  subCategory: SubCategoryEntity[];

  @Expose()
  @ApiProperty({
    type: String,
    example: 'John Doe',
  })
  get name(): string {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }

  @BeforeInsert()
  generateUlid() {
    this.ulid = ulid().toLowerCase();
  }
}
