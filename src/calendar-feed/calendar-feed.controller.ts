import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
  Scope,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';

import { CalendarFeedService } from './calendar-feed.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { AuthService } from '../auth/auth.service';
import { GroupPermission } from '../core/constants/constant';
import { OptionalJWTAuthGuard } from './optional-auth.guard';

@ApiTags('Calendar Feeds')
@Controller({ path: 'calendar', scope: Scope.REQUEST })
export class CalendarFeedController {
  constructor(
    private readonly calendarFeedService: CalendarFeedService,
    private readonly authService: AuthService,
  ) {}

  @Get('my/calendar.ics')
  @UseGuards(JWTAuthGuard)
  @ApiOperation({
    summary: 'Get authenticated user calendar feed',
    description:
      'Returns iCalendar (.ics) feed for all events the authenticated user organizes or attends',
  })
  @ApiQuery({
    name: 'start',
    required: false,
    description: 'Start date filter (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'end',
    required: false,
    description: 'End date filter (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'iCalendar file content',
    content: {
      'text/calendar': {
        example: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n...\r\nEND:VCALENDAR\r\n',
      },
    },
  })
  async getUserCalendar(
    @AuthUser() user: UserEntity,
    @Res() res: Response,
    @Query('start') startDate?: string,
    @Query('end') endDate?: string,
  ): Promise<void> {
    const icalContent = await this.calendarFeedService.getUserCalendarFeed(
      user.id,
      startDate,
      endDate,
    );

    // Set appropriate headers for iCalendar response
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${user.slug}.ics"`);
    res.send(icalContent);
  }

  @Get('groups/:groupSlug/calendar.ics')
  @UseGuards(OptionalJWTAuthGuard)
  @ApiOperation({
    summary: 'Get group calendar feed',
    description:
      'Returns iCalendar (.ics) feed for all events in a group. Public groups are accessible to all, private groups require membership.',
  })
  @ApiParam({
    name: 'groupSlug',
    description: 'Group slug identifier',
    example: 'tech-meetup',
  })
  @ApiQuery({
    name: 'start',
    required: false,
    description: 'Start date filter (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'end',
    required: false,
    description: 'End date filter (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @ApiResponse({
    status: 200,
    description: 'iCalendar file content',
    content: {
      'text/calendar': {
        example: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n...\r\nEND:VCALENDAR\r\n',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied to private group calendar',
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
  })
  async getGroupCalendar(
    @Param('groupSlug') groupSlug: string,
    @Req() req: any,
    @Res() res: Response,
    @Query('start') startDate?: string,
    @Query('end') endDate?: string,
  ): Promise<void> {
    // Optional authentication: user will be undefined if no valid auth provided
    const user = req.user as UserEntity | undefined;

    // SECURITY: Check if group exists first (for proper 404 handling)
    const group = await this.calendarFeedService.findGroupBySlug(groupSlug);
    if (!group) {
      throw new NotFoundException(`Group with slug ${groupSlug} not found`);
    }

    // SECURITY: Check if user has access to this group's calendar
    // This enforces authorization AFTER authentication (defense in depth)
    const hasAccess = await this.checkGroupCalendarAccess(groupSlug, user);
    if (!hasAccess) {
      // Return different errors based on the scenario for better UX
      if (!user) {
        throw new ForbiddenException(
          'Authentication required to access private group calendar',
        );
      } else {
        throw new ForbiddenException('Access denied to private group calendar');
      }
    }

    const icalContent = await this.calendarFeedService.getGroupCalendarFeed(
      groupSlug,
      startDate,
      endDate,
      user?.id, // Pass user ID for event query
    );

    // Set appropriate headers for iCalendar response
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${groupSlug}.ics"`);
    res.send(icalContent);
  }

  /**
   * SECURITY: Check if user has access to group calendar based on group visibility and permissions
   * Implements defense-in-depth security model:
   * - Public groups: Accessible to everyone (authenticated or not)
   * - Private groups: Require authentication + membership + SEE_EVENTS permission
   */
  private async checkGroupCalendarAccess(
    groupSlug: string,
    user?: UserEntity,
  ): Promise<boolean> {
    try {
      // STEP 1: Verify group exists
      const group = await this.calendarFeedService.findGroupBySlug(groupSlug);
      if (!group) {
        // Group doesn't exist - this will be handled as 404 by caller
        return false;
      }

      // STEP 2: Check group visibility
      if (group.visibility === 'public') {
        // PUBLIC GROUPS: Always accessible (like public GitHub repos)
        return true;
      }

      if (group.visibility === 'private') {
        // PRIVATE GROUPS: Require authentication + authorization

        // STEP 3: Verify user is authenticated
        if (!user?.slug) {
          // No authenticated user - deny access to private groups
          return false;
        }

        // STEP 4: Check group membership and permissions
        const groupMember =
          await this.authService.getGroupMemberByUserSlugAndGroupSlug(
            user.slug,
            groupSlug,
          );

        if (!groupMember) {
          // User is not a member of this private group
          return false;
        }

        // STEP 5: Verify user has required permission
        const hasPermission = groupMember.groupRole?.groupPermissions?.some(
          (p) => p.name === GroupPermission.SeeEvents,
        );

        if (!hasPermission) {
          // User is a member but doesn't have SEE_EVENTS permission
          return false;
        }

        // All security checks passed
        return true;
      }

      // Unknown visibility type - deny access
      return false;
    } catch {
      // Security: Log error for debugging but don't expose details to client
      // Always deny access on errors to fail secure
      return false;
    }
  }
}
