import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { EventAttendeeRole } from '../../../../../core/constants/constant';
import { EventAttendeesEntity } from '../../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventPermissionEntity } from '../../../../../event-permission/infrastructure/persistence/relational/entities/event-permission.entity';

@Entity({ name: 'eventRoles' })
export class EventRoleEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: EventAttendeeRole })
  name: EventAttendeeRole;

  @OneToMany(() => EventAttendeesEntity, (eventAttendee) => eventAttendee.role)
  attendees: EventAttendeesEntity[];

  @ManyToMany(
    () => EventPermissionEntity,
    (eventPermission) => eventPermission.eventRoles,
  )
  @JoinTable({
    name: 'eventRolePermissions',
    joinColumn: {
      name: 'eventRoleId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'eventPermissionId',
      referencedColumnName: 'id',
    },
  })
  permissions: EventPermissionEntity[];
}
