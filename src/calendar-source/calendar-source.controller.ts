import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { REQUEST } from '@nestjs/core';

import { CalendarSourceService } from './calendar-source.service';
import { CreateCalendarSourceDto } from './dto/create-calendar-source.dto';
import { UpdateCalendarSourceDto } from './dto/update-calendar-source.dto';
import { QueryCalendarSourceDto } from './dto/query-calendar-source.dto';
import { CalendarSourceEntity } from './infrastructure/persistence/relational/entities/calendar-source.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { PaginationDto } from '../utils/dto/pagination.dto';

@ApiTags('Calendar Sources')
@Controller('calendar-sources')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class CalendarSourceController {
  constructor(
    private readonly calendarSourceService: CalendarSourceService,
    @Inject(REQUEST) private readonly request: Request & { tenantId: string },
  ) {}

  private getTenantId(): string {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new BadRequestException(
        'Missing tenant ID. Tenant ID is required for all calendar operations.',
      );
    }
    return tenantId;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new calendar source connection' })
  async create(
    @Body() createCalendarSourceDto: CreateCalendarSourceDto,
    @AuthUser() user: User,
  ): Promise<CalendarSourceEntity> {
    const tenantId = this.getTenantId();
    // Convert User domain object to UserEntity - this is a temporary solution
    // TODO: Refactor to avoid this conversion by updating the service interface
    const userEntity = { id: user.id } as UserEntity;
    return this.calendarSourceService.create(
      createCalendarSourceDto,
      userEntity,
      tenantId,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all calendar sources for the authenticated user',
  })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryCalendarSourceDto,
    @AuthUser() user: User,
  ): Promise<CalendarSourceEntity[]> {
    const tenantId = this.getTenantId();
    return this.calendarSourceService.findAllByUser(user.id, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific calendar source by ID' })
  async findOne(
    @Param('id') id: string,
    @AuthUser() user: User,
  ): Promise<CalendarSourceEntity> {
    const tenantId = this.getTenantId();
    const calendarSource = await this.calendarSourceService.findOne(
      parseInt(id),
      tenantId,
    );
    await this.calendarSourceService.validateOwnership(
      parseInt(id),
      user.id,
      tenantId,
    );
    return calendarSource;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a calendar source' })
  async update(
    @Param('id') id: string,
    @Body() updateCalendarSourceDto: UpdateCalendarSourceDto,
    @AuthUser() user: User,
  ): Promise<CalendarSourceEntity> {
    const tenantId = this.getTenantId();
    await this.calendarSourceService.validateOwnership(
      parseInt(id),
      user.id,
      tenantId,
    );
    return this.calendarSourceService.update(
      parseInt(id),
      updateCalendarSourceDto,
      tenantId,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a calendar source' })
  async remove(@Param('id') id: string, @AuthUser() user: User): Promise<void> {
    const tenantId = this.getTenantId();
    await this.calendarSourceService.validateOwnership(
      parseInt(id),
      user.id,
      tenantId,
    );
    return this.calendarSourceService.remove(parseInt(id), tenantId);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger manual sync for a calendar source' })
  sync(@Param('id') _id: string, @AuthUser() _user: User): { message: string } {
    // Implementation will come in Phase 2
    return { message: 'Sync feature will be implemented in Phase 2' };
  }
}
