import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AvailabilityService } from './availability.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { GetConflictsDto } from './dto/get-conflicts.dto';

@ApiTags('Calendar Availability')
@Controller('availability')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AvailabilityController {
  private readonly logger = new Logger(AvailabilityController.name);

  constructor(
    private readonly availabilityService: AvailabilityService,
    @Inject(REQUEST) private readonly request: Request & { tenantId: string },
  ) {}

  @Post('check')
  @ApiOperation({ summary: 'Check availability for a specific time slot' })
  @ApiResponse({ 
    status: 200, 
    description: 'Availability check result',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        conflicts: { type: 'array', items: { type: 'string' } },
        conflictingEvents: { type: 'array' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid time range or parameters' })
  async checkAvailability(
    @Body() checkAvailabilityDto: CheckAvailabilityDto,
    @AuthUser() user: UserEntity,
  ): Promise<{
    available: boolean;
    conflicts: string[];
    conflictingEvents: any[];
    message: string;
  }> {
    const tenantId = this.request.tenantId;
    this.logger.log(`Checking availability for user ${user.id} from ${checkAvailabilityDto.startTime} to ${checkAvailabilityDto.endTime}`);

    try {
      const result = await this.availabilityService.checkAvailability(
        user.id,
        checkAvailabilityDto.startTime,
        checkAvailabilityDto.endTime,
        checkAvailabilityDto.calendarSourceIds || [],
        tenantId,
      );

      this.logger.log(`Availability check for user ${user.id}: ${result.available ? 'available' : 'conflicts found'}`);

      return {
        available: result.available,
        conflicts: result.conflicts,
        conflictingEvents: result.conflictingEvents,
        message: result.available 
          ? 'No conflicts found - time slot is available'
          : 'Time slot has conflicts with existing events',
      };
    } catch (error) {
      this.logger.error(`Availability check failed for user ${user.id}:`, error.message);
      throw error;
    }
  }

  @Post('conflicts')
  @ApiOperation({ summary: 'Get all conflicts for a time range' })
  @ApiResponse({ 
    status: 200, 
    description: 'Conflicts found in the time range',
    schema: {
      type: 'object',
      properties: {
        conflicts: { type: 'array' },
        totalCount: { type: 'number' },
        timeRange: {
          type: 'object',
          properties: {
            startTime: { type: 'string' },
            endTime: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid date range or parameters' })
  async getConflicts(
    @Body() getConflictsDto: GetConflictsDto,
    @AuthUser() user: UserEntity,
  ): Promise<{
    conflicts: any[];
    totalCount: number;
    timeRange: {
      startTime: Date;
      endTime: Date;
    };
  }> {
    const tenantId = this.request.tenantId;
    this.logger.log(`Getting conflicts for user ${user.id} from ${getConflictsDto.startTime} to ${getConflictsDto.endTime}`);

    try {
      const conflicts = await this.availabilityService.getConflicts(
        user.id,
        getConflictsDto.startTime,
        getConflictsDto.endTime,
        getConflictsDto.calendarSourceIds || [],
        tenantId,
      );

      this.logger.log(`Found ${conflicts.length} conflicts for user ${user.id}`);

      return {
        conflicts,
        totalCount: conflicts.length,
        timeRange: {
          startTime: getConflictsDto.startTime,
          endTime: getConflictsDto.endTime,
        },
      };
    } catch (error) {
      this.logger.error(`Get conflicts failed for user ${user.id}:`, error.message);
      throw error;
    }
  }
}