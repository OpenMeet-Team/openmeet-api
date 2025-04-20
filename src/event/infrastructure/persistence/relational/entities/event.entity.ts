import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
  OneToOne,
  BeforeInsert,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import {
  EventType,
  EventVisibility,
  EventStatus,
  PostgisSrid,
} from '../../../../../core/constants/constant';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { FileEntity } from '../../../../../file/infrastructure/persistence/relational/entities/file.entity';
import { ApiProperty } from '@nestjs/swagger';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { generateShortCode } from '../../../../../utils/short-code';
import { SourceFields } from '../../../../../core/interfaces/source-data.interface';
import { EventSourceType } from '../../../../../core/constants/source-type.constant';
import { EventSeriesEntity } from '../../../../../event-series/infrastructure/persistence/relational/entities/event-series.entity';

@Entity({ name: 'events' })
export class EventEntity
  extends EntityRelationalHelper
  implements SourceFields
{
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  slug: string;

  @ApiProperty({
    type: () => FileEntity,
  })
  @OneToOne(() => FileEntity, {
    eager: true,
  })
  @JoinColumn()
  image?: FileEntity;

  @Column({
    type: 'enum',
    enum: EventType,
  })
  type: EventType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  locationOnline: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: Date })
  startDate: Date;

  @Column({ type: Date, nullable: true })
  endDate: Date;

  @Column({ type: 'int', nullable: true })
  maxAttendees: number;

  @Column({ type: 'boolean', default: false })
  requireApproval: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvalQuestion: string;

  @Column({ type: 'boolean', default: false })
  requireGroupMembership: boolean;

  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: PostgisSrid.SRID,
    nullable: true,
  })
  @Index()
  locationPoint?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  location: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventStatus,
  })
  status: EventStatus;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventVisibility,
  })
  visibility: EventVisibility;

  @Column({ type: 'boolean', default: false })
  allowWaitlist: boolean;

  @ManyToOne(() => UserEntity, (user) => user.events)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => GroupEntity, (group) => group.events, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity | null;

  @OneToMany(() => EventAttendeesEntity, (event) => event.event, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  attendees: EventAttendeesEntity[];

  @ManyToMany(() => CategoryEntity, (category) => category.events)
  categories: CategoryEntity[];

  groupMember: GroupMemberEntity | null;
  attendee: EventAttendeesEntity | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  matrixRoomId: string;

  attendeesCount: number;

  @Column({ type: 'enum', enum: 'event_source_type', nullable: true })
  sourceType: EventSourceType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  sourceData: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  // Series-based recurrence model
  @ManyToOne(
    () => EventSeriesEntity,
    (series: EventSeriesEntity) => series.events,
    {
      nullable: true,
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'seriesSlug', referencedColumnName: 'slug' })
  series: EventSeriesEntity;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  seriesSlug: string;

  /**
   * Original date of the occurrence when it was created or modified.
   * This is used to identify which date a modified occurrence belongs to
   * in the recurrence pattern.
   */
  @Column({ type: 'timestamp', nullable: true })
  @Index()
  originalDate: Date;

  // Additional RFC 5545/7986 properties
  @Column({ nullable: true, type: 'varchar', length: 20 })
  securityClass: string;

  @Column({ nullable: true, type: 'integer', default: 0 })
  priority: number;

  @Column({ nullable: false, type: 'boolean', default: true })
  blocksTime: boolean;

  @Column({ nullable: true, type: 'boolean' })
  isAllDay: boolean;

  @Column({ nullable: true, type: 'jsonb' })
  resources: string[];

  @Column({ nullable: true, type: 'varchar', length: 20 })
  color: string;

  @Column({ nullable: true, type: 'jsonb' })
  conferenceData: Record<string, any>;

  /**
   * Virtual property to indicate if an event is part of a recurring series
   * Not stored in database, computed from seriesSlug
   */
  isRecurring?: boolean;

  // @Expose()
  // get attendeesCount(): number {
  //   return this.attendees ? this.attendees.length : 0;
  // }

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid().toLowerCase();
    }
  }

  @BeforeInsert()
  generateSlug() {
    if (!this.slug) {
      this.slug = `${slugify(
        this.name + '-' + generateShortCode().toLowerCase(),
        {
          strict: true,
          lower: true,
        },
      )}`;
    }
  }

  // Messages are now stored in Matrix, not in the event entity
}
