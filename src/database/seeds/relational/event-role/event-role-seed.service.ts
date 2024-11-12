import { Injectable } from '@nestjs/common';
import {
  EventAttendeeRole,
  EventAttendeePermission,
} from 'src/core/constants/constant';
import { EventPermissionEntity } from 'src/event-permission/infrastructure/persistence/relational/entities/event-permission.entity';
import { EventRoleEntity } from 'src/event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { TenantConnectionService } from 'src/tenant/tenant.service';
import { Repository } from 'typeorm';

@Injectable()
export class EventRoleSeedService {
  private eventRoleRepository: Repository<EventRoleEntity>;
  private eventPermissionRepository: Repository<EventPermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService, // For tenant-specific DB handling
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.eventRoleRepository = dataSource.getRepository(EventRoleEntity);
    this.eventPermissionRepository = dataSource.getRepository(
      EventPermissionEntity,
    );

    // DeleteEvent = 'DELETE_EVENT',
    // CancelEvent = 'CANCEL_EVENT',
    // ManageEvent = 'MANAGE_EVENT',
    // ApproveAttendees = 'APPROVE_ATTENDEES',
    // DeleteAttendees = 'DELETE_ATTENDEES',
    // ManageAttendees = 'MANAGE_ATTENDEES',
    // ManageDiscussions = 'MANAGE_DISCUSSIONS',
    // ViewEvent = 'VIEW_EVENT',
    // AttendEvent = 'ATTEND_EVENT',
    // MessageAttendees = 'MESSAGE_ATTENDEES',
    // CreateDiscussion = 'CREATE_DISCUSSION',

    await this.createEventRoleIfNotExists(EventAttendeeRole.Host, [
      EventAttendeePermission.ManageEvent,
      EventAttendeePermission.DeleteEvent,
      EventAttendeePermission.CancelEvent,
      EventAttendeePermission.ManageAttendees,
      EventAttendeePermission.ApproveAttendees,
      EventAttendeePermission.DeleteAttendees,
      EventAttendeePermission.ManageDiscussions,
      EventAttendeePermission.MessageAttendees,
      EventAttendeePermission.AttendEvent,
      EventAttendeePermission.CreateDiscussion,
      EventAttendeePermission.ViewEvent,
    ]);

    await this.createEventRoleIfNotExists(EventAttendeeRole.Moderator, [
      EventAttendeePermission.ManageEvent,
      EventAttendeePermission.ManageAttendees,
      EventAttendeePermission.ApproveAttendees,
      EventAttendeePermission.DeleteAttendees,
      EventAttendeePermission.ManageDiscussions,
      EventAttendeePermission.MessageAttendees,
      EventAttendeePermission.AttendEvent,
      EventAttendeePermission.CreateDiscussion,
      EventAttendeePermission.ViewEvent,
    ]);

    await this.createEventRoleIfNotExists(EventAttendeeRole.Participant, [
      EventAttendeePermission.AttendEvent,
      EventAttendeePermission.CreateDiscussion,
      EventAttendeePermission.ViewEvent,
    ]);

    await this.createEventRoleIfNotExists(EventAttendeeRole.Speaker, [
      EventAttendeePermission.AttendEvent,
      EventAttendeePermission.CreateDiscussion,
      EventAttendeePermission.ViewEvent,
    ]);

    await this.createEventRoleIfNotExists(EventAttendeeRole.Guest, [
      EventAttendeePermission.AttendEvent,
      EventAttendeePermission.CreateDiscussion,
      EventAttendeePermission.ViewEvent,
    ]);
  }

  private async createEventRoleIfNotExists(
    roleName: string,
    permissionNames: string[],
  ) {
    const count = await this.eventRoleRepository.count({
      where: { name: roleName as EventAttendeeRole },
    });

    if (!count) {
      const eventRole = this.eventRoleRepository.create({
        name: roleName as EventAttendeeRole,
      });

      const permissions =
        await this.getEventPermissionsByNames(permissionNames);

      eventRole.permissions = permissions;
      await this.eventRoleRepository.save(eventRole);
    }
  }

  private async getEventPermissionsByNames(
    names: string[],
  ): Promise<EventPermissionEntity[]> {
    if (names.length === 0) {
      return [];
    }
    return this.eventPermissionRepository.find({
      where: names.map((name) => ({
        name: name as EventAttendeePermission,
      })),
    });
  }
}
