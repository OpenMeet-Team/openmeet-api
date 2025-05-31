import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
  Scope,
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
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Calendar Feeds')
@Controller({ path: 'calendar', scope: Scope.REQUEST })
export class CalendarFeedController {
  constructor(private readonly calendarFeedService: CalendarFeedService) {}

  @Get('users/:userSlug/calendar.ics')
  @Public()
  @UseGuards(JWTAuthGuard)
  @ApiOperation({
    summary: 'Get user calendar feed',
    description:
      'Returns iCalendar (.ics) feed for all events a user organizes or attends',
  })
  @ApiParam({
    name: 'userSlug',
    description: 'User slug identifier',
    example: 'john-doe',
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
    status: 404,
    description: 'User not found',
  })
  async getUserCalendar(
    @Param('userSlug') userSlug: string,
    @Res() res: Response,
    @Query('start') startDate?: string,
    @Query('end') endDate?: string,
  ): Promise<void> {
    const icalContent = await this.calendarFeedService.getUserCalendarFeed(
      userSlug,
      startDate,
      endDate,
    );

    // Set appropriate headers for iCalendar response
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${userSlug}.ics"`);
    res.send(icalContent);
  }

  @Get('groups/:groupSlug/calendar.ics')
  @Public()
  @UseGuards(JWTAuthGuard)
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
    const user = req.user as UserEntity;
    const icalContent = await this.calendarFeedService.getGroupCalendarFeed(
      groupSlug,
      startDate,
      endDate,
      user?.id,
    );

    // Set appropriate headers for iCalendar response
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${groupSlug}.ics"`);
    res.send(icalContent);
  }
}
