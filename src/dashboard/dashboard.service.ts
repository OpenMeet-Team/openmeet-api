import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { CategoryService } from '../category/category.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class DashboardService {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly eventService: EventService,
    private readonly groupService: GroupService,
  ) {}

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
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch user events');
    }
  }

  async getMyGroups(userId: string): Promise<GroupEntity[]> {
    try {
      return await this.groupService.getGroupsByMember(userId);
    } catch (error) {
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch user groups');
    }
  }

  async getCreatedEvents(userId: string): Promise<EventEntity[]> {
    try {
      return (await this.eventService.getEventsByCreator(
        userId,
      )) as EventEntity[];
    } catch (error) {
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch created events');
    }
  }

  async getAttendingEvents(userId: string): Promise<EventEntity[]> {
    try {
      return await this.eventService.getEventsByAttendee(userId);
    } catch (error) {
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch attending events');
    }
  }

  async getCreatedGroups(userId: string): Promise<GroupEntity[]> {
    try {
      return await this.groupService.getGroupsByCreator(userId);
    } catch (error) {
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch created groups');
    }
  }

  async getInGroups(userId: string): Promise<GroupEntity[]> {
    try {
      return await this.groupService.getGroupsByMember(userId);
    } catch (error) {
      console.warn('error: ', error);
      throw new NotFoundException('Failed to fetch groups user is in');
    }
  }
}
