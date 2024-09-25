import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
  Headers,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventService } from './events.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { JWTAuthGuard } from '../core/guards/auth.guard';



@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(@Body() createEventDto: CreateEventDto, @Req() req: Request): Promise<EventEntity> {
    const user  = req.user
    const userId = user?.id;
    return this.eventService.create(createEventDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all events' })
  async findAll(): Promise<EventEntity[]> {
    return this.eventService.findAll();
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
  ): Promise<EventEntity> {
    return this.eventService.update(+id, updateEventDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    return this.eventService.remove(id);
  }
}
