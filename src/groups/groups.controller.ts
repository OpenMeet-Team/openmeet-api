import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Patch,
    Delete,
    NotFoundException,
    Req,
  } from '@nestjs/common';
  import { ApiTags, ApiOperation } from '@nestjs/swagger';
  import { CreateGroupDto } from './dto/create-group.dto';
  import { UpdateGroupDto } from './dto/update-group.dto';
  import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupService } from './groups.service';
  
  @ApiTags('Groups')
  @Controller('groups')
  export class GroupController {
    constructor(private readonly groupService: GroupService) {}
  
    @Post()
    @ApiOperation({ summary: 'Create a new group' })
    async create(
      @Body() createGroupDto: CreateGroupDto,
    ): Promise<GroupEntity> {
      return this.groupService.create(createGroupDto);
    }
  
    @Get()
    @ApiOperation({ summary: 'Get all groups' })
    async findAll(): Promise<GroupEntity[]> {
      return this.groupService.findAll();
    }
  
    @Get(':id')
    @ApiOperation({ summary: 'Get group by ID' })
    async findOne(@Param('id') id: number): Promise<GroupEntity> {
      const group = await this.groupService.findOne(+id);
      if (!group) {
        throw new NotFoundException(`Group with ID ${id} not found`);
      }
      return group;
    }
  
    @Patch(':id')
    @ApiOperation({ summary: 'Update a group by ID' })
    async update(
      @Param('id') id: number,
      @Body() updateGroupDto: UpdateGroupDto,
    ): Promise<GroupEntity> {
      return this.groupService.update(+id, updateGroupDto);
    }
  
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a group by ID' })
    async remove(@Param('id') id: number): Promise<void> {
      return this.groupService.remove(+id);
    }
  }
  