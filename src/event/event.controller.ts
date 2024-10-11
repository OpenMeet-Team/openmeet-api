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
    console.log('🚀 ~ EventController ~ findAll ~ userId:', userId);
    query.userId = userId;
    return this.eventService.findAll(pagination, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(@Param('id') id: number): Promise<EventEntity> {
    const event = await this.eventService.findOne(+id);
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
    const user = req.user;
    const userId = user?.id;
    return this.eventService.update(+id, updateEventDto, userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    return this.eventService.remove(id);
  }
}
