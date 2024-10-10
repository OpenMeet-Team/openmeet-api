import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from '../../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../events/infrastructure/persistence/relational/entities/events.entity';

@Entity({ name: 'eventAttendees' })
export class EventAttendeesEntity {
  @PrimaryColumn({ type: 'uuid' })
  eventId: string;

  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  rsvpStatus: string;

  @Column({ type: 'boolean', default: false })
  isHost: boolean;

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
