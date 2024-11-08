import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
  OneToOne,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { Expose } from 'class-transformer';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../../../../core/constants/constant';
import { GroupMemberEntity } from '../../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { FileEntity } from '../../../../../file/infrastructure/persistence/relational/entities/file.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'events' })
export class EventEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
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

  @Column({ type: 'varchar', length: 255, nullable: true })
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

  @ManyToOne(() => UserEntity, (user) => user.events)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => GroupEntity, (group) => group.events, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity | null;

  @OneToMany(() => EventAttendeesEntity, (event) => event.event)
  attendees: EventAttendeesEntity[];

  @ManyToMany(() => CategoryEntity, (category) => category.events)
  categories: CategoryEntity[];

  groupMember: GroupMemberEntity | null;
  attendee: EventAttendeesEntity | null;

  @Expose()
  get attendeesCount(): number {
    return this.attendees ? this.attendees.length : 0;
  }
}
