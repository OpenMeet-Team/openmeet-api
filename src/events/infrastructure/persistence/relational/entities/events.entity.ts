import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { CategoryEntity } from '../../../../../categories/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from '../../../../../groups/infrastructure/persistence/relational/entities/group.entity';

@Entity({ name: 'Event' })
export class EventEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: Date })
  startDate: Date;

  @Column({ type: Date })
  endDate: Date;

  @Column({ type: 'varchar', length: 255 })
  location: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @ManyToOne(() => UserEntity, (user) => user.events)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(()=> GroupEntity, group => group.events)
  @JoinColumn({name: 'groupId'})
  group: GroupEntity;

  @OneToMany(() => EventAttendeesEntity, (event) => event.event)
  attendees: EventAttendeesEntity[];

  @ManyToMany(() => CategoryEntity, (category) => category.events)
  @JoinTable()
  categories: CategoryEntity[];
}
