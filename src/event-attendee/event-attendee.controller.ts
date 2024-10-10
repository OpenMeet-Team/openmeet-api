import { Controller, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventAttendeeService } from './event-attendee.service';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';

@ApiTags('Event Attendees')
@Controller('event-attendees')
export class EventAttendeeController {
  constructor(private readonly eventAttendeeService: EventAttendeeService) {}

  
  @Post('attend')
  async attendEvent(@Body() createEventAttendeeDto: CreateEventAttendeeDto) {
    return await this.eventAttendeeService.attendEvent(createEventAttendeeDto);
  }

  @Delete('leave/:userId/:eventId')
  async leaveEvent(
    @Param('userId') userId: number,
    @Param('eventId') eventId: number,
  ) {
    await this.eventAttendeeService.leaveEvent(userId, eventId);
    
  }
}
