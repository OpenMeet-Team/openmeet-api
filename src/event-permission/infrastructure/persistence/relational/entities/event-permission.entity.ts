import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { EventAttendeePermission } from '../../../../../core/constants/constant';
import { EventRoleEntity } from '../../../../../event-role/infrastructure/persistence/relational/entities/event-role.entity';

@Entity({ name: 'eventPermissions' })
export class EventPermissionEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: EventAttendeePermission })
  name: EventAttendeePermission;

  @ManyToMany(() => EventRoleEntity, (eventRole) => eventRole.permissions)
  eventRoles: EventRoleEntity[];
}
