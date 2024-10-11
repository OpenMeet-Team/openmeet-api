import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GroupRoleService } from './group-role.service';
import { CreateGroupRoleDto } from './dto/create-groupRole.dto';

@ApiTags('GroupRole') 
@Controller('group-role')
export class GroupRoleController {
  constructor(private readonly groupRoleService: GroupRoleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group role' })
  async create(@Body() createGroupRoleDto: CreateGroupRoleDto) {
    return this.groupRoleService.create(createGroupRoleDto);
  }

  @Get()
  @ApiOperation({ summary: '' })
  async findOne(@Body() name: string) {
    return this.groupRoleService.findOne(name);
  }
  }

