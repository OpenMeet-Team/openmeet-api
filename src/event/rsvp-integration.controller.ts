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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { RsvpIntegrationService } from './services/rsvp-integration.service';
import { ExternalRsvpDto } from './dto/external-rsvp.dto';
import { ServiceKeyAuthGuard } from '../auth/guards/service-key-auth.guard';

/**
 * Controller handling requests for integrating external RSVPs
 * Used by services like bsky-event-processor
 */
@ApiTags('RSVP Integration')
@Controller('integration/rsvps')
@UseGuards(ServiceKeyAuthGuard)
export class RsvpIntegrationController {
  private readonly logger = new Logger(RsvpIntegrationController.name);

  constructor(
    private readonly rsvpIntegrationService: RsvpIntegrationService,
  ) {}

  /**
   * Ingests an RSVP from an external source
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Ingest an RSVP from an external source' })
  @ApiBody({ type: ExternalRsvpDto })
  @ApiHeader({
    name: 'x-tenant-id',
    description: 'Tenant ID',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'RSVP accepted for processing',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid RSVP data',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing tenant ID',
  })
  async ingestRsvp(
    @Headers('x-tenant-id') tenantId: string,
    @Body() rsvpData: ExternalRsvpDto,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException(
        'Missing tenant ID. Please provide the x-tenant-id header.',
      );
    }

    try {
      this.logger.debug(
        `Ingesting external RSVP for tenant ${tenantId}: ${rsvpData.userHandle} -> ${rsvpData.eventSourceId}`,
      );

      const result = await this.rsvpIntegrationService.processExternalRsvp(
        rsvpData,
        tenantId,
      );

      return {
        success: true,
        message: 'RSVP accepted for processing',
        attendeeId: result?.id || null,
      };
    } catch (error) {
      this.logger.error(
        `Error processing external RSVP: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Failed to process RSVP: ${error.message}`);
    }
  }
}
