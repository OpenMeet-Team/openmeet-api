import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EventRoleService } from './event-role.service';
import { CreateEventRoleDto } from './dto/create-eventRole.dto';
@ApiTags('EventRole')
@Controller('event-role')
export class EventRoleController {
  constructor(private readonly eventRoleService: EventRoleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event role' })
  async create(@Body() createEventRoleDto: CreateEventRoleDto) {
    return this.eventRoleService.create(createEventRoleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find an event role by name' })
  async findOne(@Body() name: string) {
    return this.eventRoleService.findOne(name);
  }
}
