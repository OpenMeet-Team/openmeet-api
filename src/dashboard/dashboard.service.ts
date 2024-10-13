import { Injectable, Scope, NotFoundException, Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { CategoryService } from '../category/category.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';

@Injectable({ scope: Scope.REQUEST })
export class DashboardService {
  private eventRepository: Repository<EventEntity>;
  private groupRepository: Repository<GroupEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly eventService: EventService,
    private readonly groupService: GroupService,
  ) {}

  async getTenantSpecificRepositories() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.groupRepository = dataSource.getRepository(GroupEntity);
  }

  async getMyEvents(userId: string): Promise<EventEntity[]> {
    try {
      const createdEvents = await this.eventService.getEventsByCreator(userId);
      const attendingEvents =
        await this.eventService.getEventsByAttendee(userId);

      // Combine and deduplicate events
      const allEvents = [...createdEvents, ...attendingEvents];
      const uniqueEvents = Array.from(
        new Map(allEvents.map((event) => [event.id, event])).values(),
      );

      return uniqueEvents as EventEntity[];
    } catch (error) {
      console.error('Failed to fetch user events:', error);
      throw new NotFoundException('Failed to fetch user events');
    }
  }

  async getMyGroups(userId: string): Promise<GroupEntity[]> {
    try {
      const groupsByMember = await this.groupService.getGroupsByMember(userId);

      const groupsByCreator =
        await this.groupService.getGroupsByCreator(userId);

      const groups = [...groupsByMember, ...groupsByCreator];
      const uniqueGroups = Array.from(
        new Map(groups.map((group) => [group.id, group])).values(),
      );
      return uniqueGroups as GroupEntity[];
    } catch (error) {
      console.error('Failed to fetch user groups:', error);
      throw new NotFoundException('Failed to fetch user groups');
    }
  }
}
