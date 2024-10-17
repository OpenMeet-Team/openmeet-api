import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';

@Entity({ name: 'eventAttendees' })
export class EventAttendeesEntity {
  @PrimaryColumn({ type: 'int' })
  eventId: string;

  @PrimaryColumn({ type: 'int' })
  userId: string;

  @Column({ type: 'text', nullable: true })
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
