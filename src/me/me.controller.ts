import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { Trace } from '../utils/trace.decorator';
import { EventQueryService } from '../event/services/event-query.service';
import { MyEventsQueryDto } from './dto/my-events-query.dto';

@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly eventQueryService: EventQueryService) {}

  @Get('events')
  @ApiOperation({
    summary: 'Get events for the authenticated user',
    description:
      'Returns all events where the user is organizer or has any RSVP. ' +
      'Includes isOrganizer, attendeeStatus, and attendeeRole fields.',
  })
  @Trace('me.getMyEvents')
  async getMyEvents(@AuthUser() user: User, @Query() query: MyEventsQueryDto) {
    return this.eventQueryService.getMyEvents(user.id, query);
  }
}
