import {
  Body,
  Controller,
  Post,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { EventIntegrationService } from './services/event-integration.service';
import { ExternalEventDto } from './dto/external-event.dto';
import { ServiceKeyAuthGuard } from '../auth/guards/service-key-auth.guard';

/**
 * Controller handling requests for integrating external events
 * Used by services like bsky-event-processor
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
        eventId: result.id,
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
}
