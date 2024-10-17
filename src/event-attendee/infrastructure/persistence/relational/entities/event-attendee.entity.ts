import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../../../../core/constants/constant';
import { name } from 'aws-sdk/clients/importexport';

@Entity({ name: 'eventAttendees' })
export class EventAttendeesEntity {
  @PrimaryColumn({ type: 'int' })
  eventId: string;

  @PrimaryColumn()
  userId: number;

  @Column({ type: 'text', nullable: true })
  rsvpStatus: string;

  @Column({ type: 'boolean', default: false })
  isHost: boolean;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventAttendeeStatus,
  })
  status: EventAttendeeStatus;

  @Column({
    nullable: true,
    type: 'enum',
    enum: EventAttendeeRole,
  })
  role: EventAttendeeRole;

  @ManyToOne(() => EventEntity, (event) => event.attendees, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'eventId' })
  event: EventEntity;

  // Many-to-One relationship with User
  @ManyToOne(() => UserEntity, (user) => user.attendedEvents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
