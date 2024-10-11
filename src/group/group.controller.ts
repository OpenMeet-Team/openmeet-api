import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupService } from './group.service';
import { QuerGrouptDto } from './dto/group-query.dto';
import { Public } from '../auth/decorators/public.decorator';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { Request } from 'express';

@ApiTags('Groups')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  async create(@Body() createGroupDto: CreateGroupDto, @Req() req: Request,): Promise<GroupEntity> {
    const user = req.user;
    let userId;
    if(user){
     userId = user.id;
    }
    return this.groupService.create(createGroupDto, userId);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all groups' })
  async findAll(@Query() query: QuerGrouptDto): Promise<GroupEntity[]> {
    return this.groupService.findAll(query);
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
