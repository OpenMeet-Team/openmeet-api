import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { CategoryEntity } from '../../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { Expose } from 'class-transformer';
import { Status, Visibility } from '../../../../../core/constants/constant';

@Entity({ name: 'events' })
export class EventEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image: string;

  @Column({ type: 'varchar', length: 255 })
  type: string;

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
    enum: Status,
  })
  status: Status;

  @Column({
    nullable: true,
    type: 'enum',
    enum: Visibility,
  })
  visibility: Visibility;

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

  @Expose()
  get attendeesCount(): number {
    console.log('this.attendees: ', this.attendees);
    return this.attendees ? this.attendees.length : 0;
  }
}
