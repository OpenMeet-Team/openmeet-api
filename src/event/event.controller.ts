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
import { CreateEventDto } from './dto/create-event.dto';
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
import { HttpException, HttpStatus } from '@nestjs/common';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from 'src/event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    const userId = user?.id;
    return this.eventService.create(createEventDto, userId);
  }

  @Public()
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
  async getRecommendedEvents(
    @Param('id') id: number,
    @Query('minEvents') minEvents?,
    @Query('maxEvents') maxEvents?,
  ): Promise<EventEntity[]> {
    // default values for min and max
    const min = minEvents ? parseInt(minEvents.toString(), 10) : 0;
    const max = maxEvents ? parseInt(maxEvents.toString(), 10) : 5;

    try {
      const recommendedEvents =
        await this.eventService.getRecommendedEventsByEventId(+id, min, max);

      return recommendedEvents;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
