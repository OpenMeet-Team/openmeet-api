import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventService } from '../events/events.service';
import { GroupService } from '../groups/groups.service';

@Controller('dashboard')
@ApiTags('User Dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly eventService: EventService,
    private readonly groupService: GroupService,
  ) {
    this.dashboardService = dashboardService;
    this.eventService = eventService;
    this.groupService = groupService;
  }

  @ApiOperation({
    summary:
      'Get all events the authenticated user has created or is attending',
  })
  @Get('events')
  async getMyEvents(@Req() req) {
    const userEvents: any[] = await this.dashboardService.getMyEvents(
      req.user.id,
    );

    return userEvents;
  }

  @Get('created-events')
  async getCreatedEvents(@Req() req) {
    try {
      if (!req.user || !req.user.id) {
        throw new Error('User not authenticated or user ID not found');
      }
      const events = await this.eventService.getEventsByCreator(req.user.id);
      return events;
    } catch (error) {
      console.error('Error in getCreatedEvents:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'There was a problem retrieving created events',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('attending-events')
  async getAttendingEvents(@Req() req) {
    return this.eventService.getEventsByAttendee(req.user.id);
  }
}
