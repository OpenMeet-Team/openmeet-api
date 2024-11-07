import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CommentDto, CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventService } from './event.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { JWTAuthGuard } from '../core/guards/auth.guard';
// import { PermissionsGuard } from '../shared/guard/permissions.guard';
// import { Permissions } from '../shared/guard/permissions.decorator';
import { QueryEventDto } from './dto/query-events.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { CreateEventAttendeeDto } from '../event-attendee/dto/create-eventAttendee.dto';
import { UpdateEventAttendeeDto } from '../event-attendee/dto/update-eventAttendee.dto';
import { QueryEventAttendeeDto } from '../event-attendee/dto/query-eventAttendee.dto';
@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(
    private readonly eventService: EventService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    const userId = user?.id;
    return this.eventService.create(createEventDto, userId);
  }

  @Post(':eventId/attend')
  @ApiOperation({ summary: 'Attending aa event' })
  async attendEvent(
    @AuthUser() user: User,
    @Body() createEventAttendeeDto: CreateEventAttendeeDto,
    @Param('eventId') eventId: number,
  ) {
    const userId = user.id;
    return await this.eventAttendeeService.attendEvent(
      createEventAttendeeDto,
      userId,
      eventId,
    );
  }

  @Patch('/event-attendee')
  @ApiOperation({ summary: 'Attending aa event' })
  async updateEvent(
    @AuthUser() user: User,
    @Body() updateEventAttendeeDto: UpdateEventAttendeeDto,
  ) {
    const userId = user.id;
    return await this.eventAttendeeService.updateEventAttendee(
      userId,
      updateEventAttendeeDto,
    );
  }

  @Get('/event-attendee/me')
  @ApiOperation({ summary: 'Get all event attendee' })
  async findAllAttendee(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventAttendeeDto,
    @AuthUser() user: User,
  ): Promise<any> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventAttendeeService.findAll(pagination, query);
  }

  @Get('event-attendee/:eventId')
  getEventAttendees(
    @Param('eventId') eventId: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.eventAttendeeService.getEventAttendees(eventId, pagination);
  }

  @Post(':eventId/comment')
  @ApiOperation({ summary: 'Create a new comment' })
  async comment(
    @Body() body: CommentDto,
    @Param('eventId') eventId: number,
  ): Promise<EventEntity> {
    return this.eventService.postComment(body, eventId);
  }

  @Post('comment-edit/:messageId')
  @ApiOperation({ summary: 'Update a comment' })
  async updaetComment(
    @Body() body: CommentDto,
    @Param('messageId') messageId: number,
  ): Promise<EventEntity> {
    return await this.eventService.updateComment(body, messageId);
  }

  @Delete('delete-comment/:messageId')
  async deleteComment(@Param('messageId') messageId: number): Promise<void> {
    return await this.eventService.deleteComment(messageId);
  }

  @Post('comment-reply/:eventId/:topicName')
  @ApiOperation({ summary: 'reply to comment' })
  async commentReply(
    @Body() body: CommentDto,
    @Param('topicName') topicName: string,
    @Param('eventId') eventId: number,
  ): Promise<EventEntity> {
    return await this.eventService.postCommentinTopic(body, topicName, eventId);
  }

  @Public()
  @Get('get-comments/:eventId')
  @ApiOperation({ summary: 'Get Topics' })
  async findTopics(@Param('eventId') eventId: number): Promise<EventEntity> {
    const event = await this.eventService.getTopics(+eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }
    return event;
  }

  @Get()
  @ApiOperation({ summary: 'Get all events' })
  async findme(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
  ): Promise<EventEntity[]> {
    return this.eventService.findAll(pagination, query);
  }

  // @Public()
  @Get('me')
  @ApiOperation({ summary: 'Get all events' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity[]> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventService.findAll(pagination, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get event details by ID' })
  async findEventDetails(
    @Param('id') id: number,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    const event = await this.eventService.findEventDetails(+id, user?.id);
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  @Public()
  @Get(':id/attendees')
  @ApiOperation({ summary: 'Get all event attendees' })
  async findEventDetailsAttendees(
    @Param('id') id: number,
  ): Promise<EventAttendeesEntity[]> {
    const attendees = await this.eventService.findEventDetailsAttendees(+id);
    if (!attendees) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return attendees;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event by ID' })
  async update(
    @Param('id') id: number,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: Request,
  ): Promise<EventEntity> {
    const user = req.user as UserEntity;
    const userId = user?.id;
    return this.eventService.update(+id, updateEventDto, userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    return this.eventService.remove(id);
  }

  @Public()
  @Get(':id/recommended-events')
  @ApiQuery({ name: 'maxEvents', type: Number, required: false })
  @ApiQuery({ name: 'minEvents', type: Number, required: false })
  @ApiOperation({
    summary: 'Get recommended events based on an existing event',
  })
  async getRecommendedEvents(@Param('id') id: number): Promise<EventEntity[]> {
    return await this.eventService.getRecommendedEventsByEventId(+id);
  }
}
