import { Inject, Injectable, Scope } from '@nestjs/common';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { CategoryService } from '../category/category.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class DashboardService {
  private eventRepository: Repository<EventEntity>;
  private groupRepository: Repository<GroupEntity>;
  constructor(
    private readonly categoryService: CategoryService,
    private readonly eventService: EventService,
    private readonly groupService: GroupService,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
  }

  async getMyEvents(userId: string) {
    const createdEvents = await this.eventService.getEventsByCreator(userId);
    const attendingEvents = await this.eventService.getEventsByAttendee(userId);

    // Combine and deduplicate events
    const allEvents = [...createdEvents, ...attendingEvents];
    const uniqueEvents = Array.from(
      new Map(allEvents.map((event) => [event.id, event])).values(),
    );

    return uniqueEvents;
  }

  async getCreatedEvents(userId: string) {
    return await this.eventService.getEventsByCreator(userId);
  }

  async getAttendingEvents(userId: string) {
    return await this.eventService.getEventsByAttendee(userId);
  }

  async getCreatedGroups(userId: string) {
    return await this.groupService.getGroupsByCreator(userId);
  }
  async getInGroups(userId: string) {
    return await this.groupService.getGroupsByMember(userId);
  }
}
