import {
  Body,
  Controller,
  Post,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Headers,
  UnauthorizedException,
  Delete,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { EventIntegrationService } from './services/event-integration.service';
import { ExternalEventDto } from './dto/external-event.dto';
import { ServiceKeyAuthGuard } from '../auth/guards/service-key-auth.guard';

/**
 * Controller handling requests for integrating external events
 * Used by services like bsky-event-processor
 *
 * Note: For Bluesky events, sourceId should be the full URI in format:
 * at://{did}/{collection}/{rkey}
 */
@ApiTags('Event Integration')
@Controller('integration/events')
@UseGuards(ServiceKeyAuthGuard)
export class EventIntegrationController {
  private readonly logger = new Logger(EventIntegrationController.name);

  constructor(
    private readonly eventIntegrationService: EventIntegrationService,
  ) {}

  /**
   * Ingests an event from an external source
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Ingest an event from an external source' })
  @ApiBody({ type: ExternalEventDto })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Event accepted for processing',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid event data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing tenant ID',
  })
  async ingestEvent(
    @Headers('x-tenant-id') tenantId: string,
    @Body() eventData: ExternalEventDto,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Missing tenant ID. Please provide the x-tenant-id header.',
      );
    }

    try {
      this.logger.debug(
        `Ingesting external event for tenant ${tenantId}: ${eventData.name}`,
      );

      const result = await this.eventIntegrationService.processExternalEvent(
        eventData,
        tenantId,
      );

      return {
        success: true,
        message: 'Event accepted for processing',
        slug: result.slug,
      };
    } catch (error) {
      this.logger.error(
        `Error processing external event: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to process event: ${error.message}`,
      );
    }
  }

  /**
   * Deletes an event from an external source using query parameters
   */
  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Delete an event from an external source using query parameters',
  })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  @ApiQuery({
    name: 'sourceId',
    description:
      'Source ID of the event to delete - should be the full URI for Bluesky events',
    required: true,
  })
  @ApiQuery({
    name: 'sourceType',
    description: 'Source type of the event',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Event deletion request accepted',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing tenant ID',
  })
  async deleteEventByQuery(
    @Headers('x-tenant-id') tenantId: string,
    @Query('sourceId') sourceId: string,
    @Query('sourceType') sourceType: string,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Missing tenant ID. Please provide the x-tenant-id header.',
      );
    }

    if (!sourceId || !sourceType) {
      throw new BadRequestException(
        'Both sourceId and sourceType query parameters are required',
      );
    }

    try {
      this.logger.debug(
        `Deleting external event for tenant ${tenantId} with sourceId: ${sourceId} and sourceType: ${sourceType}`,
      );

      await this.eventIntegrationService.deleteExternalEvent(
        sourceId,
        sourceType,
        tenantId,
      );

      return {
        success: true,
        message: 'Event deletion request accepted',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting external event: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Failed to delete event: ${error.message}`);
    }
  }

  /**
   * Deletes an AT Protocol event using individual path parameter components.
   * Constructs the at:// URI from the components to match the stored sourceId format.
   */
  @Delete('atproto/:did/:collection/:rkey')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Delete an AT Protocol event using path parameter components',
  })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  @ApiQuery({
    name: 'sourceType',
    description: 'Source type of the event (e.g., bluesky)',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Event deletion request accepted',
  })
  async deleteAtprotoEvent(
    @Headers('x-tenant-id') tenantId: string,
    @Param('did') did: string,
    @Param('collection') collection: string,
    @Param('rkey') rkey: string,
    @Query('sourceType') sourceType: string,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Missing tenant ID. Please provide the x-tenant-id header.',
      );
    }

    if (!did || !collection || !rkey || !sourceType) {
      throw new BadRequestException(
        'Missing required parameters: did, collection, rkey, sourceType',
      );
    }

    try {
      // Construct the AT Protocol URI
      const sourceId = `at://${did}/${collection}/${rkey}`;

      this.logger.debug(
        `Deleting AT Protocol event for tenant ${tenantId} with sourceId: ${sourceId} and sourceType: ${sourceType}`,
      );

      const result = await this.eventIntegrationService.deleteExternalEvent(
        sourceId,
        sourceType,
        tenantId,
      );

      return {
        success: true,
        message: result.message || 'Event deletion request accepted',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting AT Protocol event: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Failed to delete event: ${error.message}`);
    }
  }
}
