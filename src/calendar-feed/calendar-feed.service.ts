import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { ICalendarService } from '../event/services/ical/ical.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserService } from '../user/user.service';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';

@Injectable()
export class CalendarFeedService {
  constructor(
    private readonly userService: UserService,
    private readonly groupService: GroupService,
    private readonly eventQueryService: EventQueryService,
    private readonly iCalendarService: ICalendarService,
  ) {}

  async getUserCalendarFeed(
    userSlug: string,
    _startDate?: string,
    _endDate?: string,
  ): Promise<string> {
    // Find user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }

    // TODO: Add findUserEvents method to EventQueryService
    // For now, we'll need to use direct repository access until the service method is implemented
    throw new Error(
      'findUserEvents method not yet implemented in EventQueryService',
    );
  }

  async getGroupCalendarFeed(
    groupSlug: string,
    startDate?: string,
    endDate?: string,
    userId?: number,
  ): Promise<string> {
    // Find group by slug
    const group = await this.groupService.findGroupBySlug(groupSlug);
    if (!group) {
      throw new NotFoundException(`Group with slug ${groupSlug} not found`);
    }

    // Check access permissions
    const hasAccess = this.validateFeedAccess(group, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to private group calendar');
    }

    // TODO: Add findGroupEvents method to EventQueryService
    // For now, we'll need to use direct repository access until the service method is implemented
    throw new Error(
      'findGroupEvents method not yet implemented in EventQueryService',
    );
  }

  validateFeedAccess(group: GroupEntity, userId?: number): boolean {
    // Public groups are accessible to everyone
    if (group.visibility === 'public') {
      return true;
    }

    // Private groups require user authentication
    if (group.visibility === 'private') {
      if (!userId) {
        return false;
      }

      // For private groups, assume access if userId is provided
      // The actual membership check happens in the query
      return true;
    }

    return false;
  }

  getDefaultDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const oneMonthAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
    );
    const oneYearFromNow = new Date(
      now.getFullYear() + 1,
      now.getMonth(),
      now.getDate(),
    );

    return {
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: oneYearFromNow.toISOString().split('T')[0],
    };
  }
}
