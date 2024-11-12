import { Entity, Column, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeStatus } from '../../../../../core/constants/constant';
import { EventRoleEntity } from '../../../../../event-role/infrastructure/persistence/relational/entities/event-role.entity';

@Entity({ name: 'eventAttendees' })
export class EventAttendeesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventAttendeeStatus,
  })
  status: EventAttendeeStatus;

  @ManyToOne(() => EventRoleEntity, (eventRole) => eventRole.attendees)
  role: EventRoleEntity;

  @ManyToOne(() => EventEntity, (event) => event.attendees)
  event: EventEntity;

  @ManyToOne(() => UserEntity, (user) => user.attendedEvents)
  user: UserEntity;

  @Column({ type: 'text', nullable: true })
  approvalAnswer?: string;
}
