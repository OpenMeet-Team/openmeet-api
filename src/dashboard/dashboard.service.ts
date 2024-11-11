import { Injectable, Scope, NotFoundException, Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';

@Injectable({ scope: Scope.REQUEST })
export class DashboardService {
  private eventRepository: Repository<EventEntity>;
  private groupRepository: Repository<GroupEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventService: EventService,
    private readonly groupService: GroupService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) { }

  async getTenantSpecificRepositories() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.groupRepository = dataSource.getRepository(GroupEntity);
  }

  async getMyEvents(userId: number): Promise<EventEntity[]> {
    await this.getTenantSpecificRepositories();
    try {
      const createdEvents = await this.eventService.getEventsByCreator(userId);

      const attendingEvents =
        await this.eventService.getEventsByAttendee(userId);

      // Combine and deduplicate events
      const allEvents = [...createdEvents, ...attendingEvents];
      const uniqueEvents = Array.from(
        new Map(allEvents.map((event) => [event.id, event])).values(),
      );

      return (await Promise.all(
        uniqueEvents.map(async (event) => ({
          ...event,
          attendee: await this.eventAttendeeService.findEventAttendeeByUserId(
            event.id,
            userId,
          ),
        })),
      )) as EventEntity[];
    } catch (error) {
      console.error('Failed to fetch user events:', error);
      throw new NotFoundException('Failed to fetch user events');
    }
  }

  async getMyGroups(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificRepositories();
    try {
      const groupsByMember = await this.groupService.getGroupsByMember(userId);

      const groupsByCreator =
        await this.groupService.getGroupsByCreator(userId);

      const groups = [...groupsByMember, ...groupsByCreator];
      const uniqueGroups = Array.from(
        new Map(groups.map((group) => [group.id, group])).values(),
      );

      return (await Promise.all(
        uniqueGroups.map(async (group) => ({
          ...group,
          groupMember: await this.groupMemberService.findGroupMemberByUserId(
            group.id,
            Number(userId),
          ),
        })),
      )) as GroupEntity[];
    } catch (error) {
      console.error('Failed to fetch user groups:', error);
      throw new NotFoundException('Failed to fetch user groups');
    }
  }
}
