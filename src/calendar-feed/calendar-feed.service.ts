import { Injectable, Scope } from '@nestjs/common';

import { ICalendarService } from '../event/services/ical/ical.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';
import { AuthService } from '../auth/auth.service';
import { GroupPermission } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST })
export class CalendarFeedService {
  constructor(
    private readonly groupService: GroupService,
    private readonly eventQueryService: EventQueryService,
    private readonly iCalendarService: ICalendarService,
    private readonly authService: AuthService,
  ) {}

  async getUserCalendarFeed(
    userId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    // Get user's events using the event query service directly with user ID
    const events = await this.eventQueryService.findUserEvents(
      userId,
      startDate,
      endDate,
    );

    // Generate iCalendar feed
    return this.iCalendarService.generateICalendarForEvents(events);
  }

  async getGroupCalendarFeed(
    groupSlug: string,
    startDate?: string,
    endDate?: string,
    userId?: number,
  ): Promise<string> {
    // Get group's events using the event query service
    // Since both services are now request-scoped, tenant context is automatically available
    const events = await this.eventQueryService.findGroupEvents(
      groupSlug,
      startDate,
      endDate,
      userId,
    );

    // Generate iCalendar feed
    return this.iCalendarService.generateICalendarForEvents(events);
  }

  async findGroupBySlug(groupSlug: string): Promise<GroupEntity | null> {
    try {
      // Both services are now request-scoped, so tenant context is automatically available
      return await this.groupService.findGroupBySlug(groupSlug);
    } catch {
      // Log error for debugging
      return null;
    }
  }

  private async findGroupForCalendarAccess(
    groupSlug: string,
  ): Promise<GroupEntity | null> {
    try {
      // We need to access the group repository directly to load the createdBy relationship
      // Since GroupService.findGroupBySlug doesn't load it
      const group = await this.groupService.findGroupBySlug(groupSlug);
      return group;
    } catch {
      return null;
    }
  }

  async validateFeedAccess(
    group: GroupEntity,
    userSlug?: string,
  ): Promise<boolean> {
    // Public groups are accessible to everyone
    if (group.visibility === 'public') {
      return true;
    }

    // Private groups require user authentication and proper permissions
    if (group.visibility === 'private') {
      if (!userSlug) {
        return false;
      }

      try {
        // Use the same permission checking pattern as PermissionsGuard
        // Check if user has SEE_EVENTS permission for this group
        const groupMember =
          await this.authService.getGroupMemberByUserSlugAndGroupSlug(
            userSlug,
            group.slug,
          );

        if (!groupMember) {
          return false;
        }

        if (!groupMember.groupRole?.groupPermissions) {
          return false;
        }

        // Check if user has SEE_EVENTS permission
        const hasPermission = this.hasRequiredPermissions(
          groupMember.groupRole.groupPermissions,
          [GroupPermission.SeeEvents],
        );

        return hasPermission;
      } catch {
        // If we can't check permissions, deny access
        return false;
      }
    }

    return false;
  }

  private hasRequiredPermissions(
    userPermissions: any[],
    requiredPermissions: string[],
  ): boolean {
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return false;
    }

    return requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );
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
