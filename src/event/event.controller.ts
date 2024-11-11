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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CommentDto, CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventService } from './event.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { QueryEventDto } from './dto/query-events.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
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

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get all events. Public endpoint with search and pagination',
  })
  async findme(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
  ): Promise<EventEntity[]> {
    return this.eventService.findAll(pagination, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    const userId = user?.id;
    return this.eventService.create(createEventDto, userId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get all user events' })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity[]> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventService.findAll(pagination, query);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Edit event by ID' })
  async editEvent(@Param('id') id: number): Promise<EventEntity | null> {
    const event = await this.eventService.editEvent(id);
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  @Public()
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Show event details by ID' })
  async showEvent(
    @Param('id') id: number,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    const event = await this.eventService.showEvent(id, user?.id);
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
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
    return this.eventService.update(id, updateEventDto, userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    return this.eventService.remove(id);
  }

  @Post(':id/attend')
  @ApiOperation({ summary: 'Attending an event' })
  async attendEvent(
    @AuthUser() user: User,
    @Body() createEventAttendeeDto: CreateEventAttendeeDto,
    @Param('id') id: number,
  ) {
    const userId = user.id;
    return this.eventService.attendEvent(createEventAttendeeDto, userId, id);
  }

  @Post(':id/cancel-attending')
  @ApiOperation({ summary: 'Cancel attending an event' })
  async cancelAttendingEvent(@Param('id') id: number, @AuthUser() user: User) {
    return await this.eventService.cancelAttendingEvent(id, user?.id);
  }

  @Patch(':id/attendees/:userId')
  @ApiOperation({ summary: 'Update event attendee' })
  async updateEvent(
    @Body() updateEventAttendeeDto: UpdateEventAttendeeDto,
    @Param('id') id: number,
    @Param('userId') userId: number,
  ) {
    return await this.eventAttendeeService.updateEventAttendee(
      id,
      userId,
      updateEventAttendeeDto,
    );
  }

  @Get(':id/attendees')
  @ApiOperation({ summary: 'Get all event attendees' })
  async findAllAttendees(
    @Param('id') id: number,
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventAttendeeDto,
    @AuthUser() user: User,
  ): Promise<any> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventService.getEventAttendees(id, pagination);
  }

  @Post(':id/topics')
  @ApiOperation({ summary: 'Create a new comment' })
  async comment(
    @Body() body: CommentDto,
    @Param('id') id: number,
  ): Promise<EventEntity> {
    return this.eventService.postComment(body, id);
  }

  @Post(':id/topics/:messageId')
  @ApiOperation({ summary: 'Update a comment' })
  async updaetComment(
    @Body() body: CommentDto,
    @Param('messageId') messageId: number,
  ): Promise<EventEntity> {
    return await this.eventService.updateComment(body, messageId);
  }

  @Delete(':id/topics/:messageId')
  async deleteComment(@Param('messageId') messageId: number): Promise<void> {
    return await this.eventService.deleteComment(messageId);
  }

  @Post(':id/topics/:topicName')
  @ApiOperation({ summary: 'reply to comment' })
  async commentReply(
    @Body() body: CommentDto,
    @Param('topicName') topicName: string,
    @Param('id') id: number,
  ): Promise<EventEntity> {
    return await this.eventService.postCommentinTopic(body, topicName, id);
  }

  @Public()
  @Get(':id/topics')
  @ApiOperation({ summary: 'Get Topics' })
  async findTopics(@Param('id') id: number): Promise<EventEntity> {
    const event = await this.eventService.getTopics(id);
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  @Public()
  @Get(':id/recommended-events')
  @ApiOperation({
    summary: 'Get similar events',
  })
  async getRecommendedEvents(@Param('id') id: number): Promise<EventEntity[]> {
    return await this.eventService.getRecommendedEventsByEventId(id);
  }
}
