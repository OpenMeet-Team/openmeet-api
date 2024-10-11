import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventAttendeeService } from './event-attendee.service';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { QueryEventAttendeeDto } from './dto/query-eventAttendee.dto';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { JWTAuthGuard } from '../core/guards/auth.guard';

@ApiTags('Event Attendees')
@Controller('event-attendees')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventAttendeeController {
  constructor(private readonly eventAttendeeService: EventAttendeeService) {}

  @Post('attend')
  @ApiOperation({ summary: 'Attending aa event' })
  async attendEvent(
    @AuthUser() user: User,
    @Body() createEventAttendeeDto: CreateEventAttendeeDto,
  ) {
    const userId = user.id;
    console.log('🚀 ~ EventAttendeeController ~ attendEvent ~ userId:', userId);
    return await this.eventAttendeeService.attendEvent(
      createEventAttendeeDto,
      userId,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Get all event attendee' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventAttendeeDto,
    @AuthUser() user: User,
  ): Promise<any> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventAttendeeService.findAll(pagination, query);
  }

  @Delete('cancel/:userId/:eventId')
  async leaveEvent(
    @Param('userId') userId: number,
    @Param('eventId') eventId: number,
  ) {
    await this.eventAttendeeService.leaveEvent(userId, eventId);
  }
}
