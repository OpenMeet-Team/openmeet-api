import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { ExternalCalendarService } from './external-calendar.service';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';
import { CreateCalendarSourceDto } from '../calendar-source/dto/create-calendar-source.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';

@ApiTags('External Calendar')
@Controller('external-calendar')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ExternalCalendarController {
  private readonly logger = new Logger(ExternalCalendarController.name);

  constructor(
    private readonly externalCalendarService: ExternalCalendarService,
    private readonly calendarSourceService: CalendarSourceService,
    @Inject(REQUEST) private readonly request: Request & { tenantId: string },
  ) {}

  @Get('auth/:type')
  @ApiOperation({
    summary: 'Get OAuth authorization URL for calendar provider',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        authorizationUrl: { type: 'string' },
        state: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported calendar type or OAuth not supported',
  })
  getAuthorizationUrl(
    @Param('type') type: CalendarSourceType,
    @AuthUser() user: UserEntity,
  ): {
    authorizationUrl: string;
    state: string;
  } {
    this.logger.log(
      `Generating OAuth URL for ${type} calendar for user ${user.id}`,
    );

    try {
      const authorizationUrl = this.externalCalendarService.getAuthorizationUrl(
        type,
        user.id,
      );

      return {
        authorizationUrl,
        state: user.id.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate OAuth URL for ${type}:`,
        error.message,
      );
      throw error;
    }
  }

  @Post('callback/:type')
  @ApiOperation({ summary: 'Handle OAuth callback and create calendar source' })
  @ApiResponse({
    status: 200,
    description: 'Calendar connected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        calendarSource: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid authorization code or callback data',
  })
  @ApiResponse({
    status: 401,
    description: 'State parameter mismatch - unauthorized',
  })
  async handleOAuthCallback(
    @Param('type') type: CalendarSourceType,
    @Body() callbackDto: OAuthCallbackDto,
    @AuthUser() user: UserEntity,
  ): Promise<{
    success: boolean;
    calendarSource: any;
    message: string;
  }> {
    const tenantId = this.request.tenantId;
    this.logger.log(
      `Handling OAuth callback for ${type} calendar for user ${user.id}`,
    );

    // Verify state parameter matches user ID (security check)
    if (callbackDto.state !== user.id.toString()) {
      this.logger.warn(
        `State mismatch for user ${user.id}: expected ${user.id}, got ${callbackDto.state}`,
      );
      throw new UnauthorizedException(
        'Invalid state parameter - authorization request mismatch',
      );
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse =
        await this.externalCalendarService.exchangeAuthorizationCode(
          type,
          callbackDto.code,
          user.id,
        );

      // Create calendar source
      const createCalendarSourceDto: CreateCalendarSourceDto = {
        type,
        name: this.getDefaultCalendarName(type),
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        expiresAt: tokenResponse.expiresAt,
        isPrivate: false,
        syncFrequency: 60, // Default: sync every hour
      };

      const calendarSource = await this.calendarSourceService.create(
        createCalendarSourceDto,
        user,
        tenantId,
      );

      this.logger.log(
        `Successfully connected ${type} calendar for user ${user.id}`,
      );

      return {
        success: true,
        calendarSource,
        message: `${this.getProviderDisplayName(type)} connected successfully`,
      };
    } catch (error) {
      this.logger.error(`OAuth callback failed for ${type}:`, error.message);
      throw error;
    }
  }

  @Post('sync/:calendarSourceId')
  @ApiOperation({ summary: 'Trigger manual sync for calendar source' })
  @ApiResponse({
    status: 200,
    description: 'Calendar sync completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        syncResult: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Calendar source not found or not owned by user',
  })
  async syncCalendarSource(
    @Param('calendarSourceId') calendarSourceId: string,
    @AuthUser() user: UserEntity,
  ): Promise<{
    success: boolean;
    syncResult: any;
    message: string;
  }> {
    const tenantId = this.request.tenantId;
    this.logger.log(
      `Manual sync requested for calendar source ${calendarSourceId} by user ${user.id}`,
    );

    // Verify user owns this calendar source
    const calendarSource = await this.calendarSourceService.findByUlid(
      calendarSourceId,
      tenantId,
    );

    if (!calendarSource || calendarSource.userId !== user.id) {
      throw new UnauthorizedException(
        'Calendar source not found or access denied',
      );
    }

    try {
      // Perform sync
      const syncResult = await this.externalCalendarService.syncCalendarSource(
        calendarSource,
        tenantId,
      );

      // Update lastSyncedAt
      await this.calendarSourceService.updateSyncStatusByUlid(
        calendarSourceId,
        syncResult.lastSyncedAt,
        tenantId,
      );

      this.logger.log(
        `Sync completed for calendar source ${calendarSourceId}: ${syncResult.eventsCount} events`,
      );

      return {
        success: syncResult.success,
        syncResult,
        message: syncResult.success
          ? 'Calendar sync completed successfully'
          : `Calendar sync failed: ${syncResult.error}`,
      };
    } catch (error) {
      this.logger.error(
        `Sync failed for calendar source ${calendarSourceId}:`,
        error.message,
      );
      throw error;
    }
  }

  @Get('test/:calendarSourceId')
  @ApiOperation({ summary: 'Test calendar connection' })
  @ApiResponse({
    status: 200,
    description: 'Connection test result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        connected: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Calendar source not found or not owned by user',
  })
  async testConnection(
    @Param('calendarSourceId') calendarSourceId: string,
    @AuthUser() user: UserEntity,
  ): Promise<{
    success: boolean;
    connected: boolean;
    message: string;
  }> {
    const tenantId = this.request.tenantId;
    this.logger.log(
      `Connection test requested for calendar source ${calendarSourceId} by user ${user.id}`,
    );

    // Verify user owns this calendar source
    const calendarSource = await this.calendarSourceService.findByUlid(
      calendarSourceId,
      tenantId,
    );

    if (!calendarSource || calendarSource.userId !== user.id) {
      throw new UnauthorizedException(
        'Calendar source not found or access denied',
      );
    }

    try {
      const connected = await this.externalCalendarService.testConnection(
        calendarSource,
        tenantId,
      );

      this.logger.log(
        `Connection test for calendar source ${calendarSourceId}: ${connected ? 'success' : 'failed'}`,
      );

      return {
        success: true,
        connected,
        message: connected
          ? 'Calendar connection is working'
          : 'Calendar connection failed - check credentials',
      };
    } catch (error) {
      this.logger.error(
        `Connection test failed for calendar source ${calendarSourceId}:`,
        error.message,
      );

      return {
        success: false,
        connected: false,
        message: `Connection test error: ${error.message}`,
      };
    }
  }

  private getDefaultCalendarName(type: CalendarSourceType): string {
    switch (type) {
      case CalendarSourceType.GOOGLE:
        return 'Google Calendar';
      case CalendarSourceType.OUTLOOK:
        return 'Outlook Calendar';
      case CalendarSourceType.APPLE:
        return 'Apple Calendar';
      case CalendarSourceType.ICAL:
        return 'iCal Calendar';
      default:
        return 'External Calendar';
    }
  }

  private getProviderDisplayName(type: CalendarSourceType): string {
    switch (type) {
      case CalendarSourceType.GOOGLE:
        return 'Google Calendar';
      case CalendarSourceType.OUTLOOK:
        return 'Microsoft Outlook';
      case CalendarSourceType.APPLE:
        return 'Apple Calendar';
      case CalendarSourceType.ICAL:
        return 'iCal URL';
      default:
        return 'External Calendar';
    }
  }
}
