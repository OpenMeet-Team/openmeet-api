import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityFeedService } from './activity-feed.service';
import { EventQueryService } from '../event/services/event-query.service';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { Public } from '../auth/decorators/public.decorator';
import { JWTAuthGuard } from '../auth/auth.guard';

@ApiTags('Activity Feed')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventActivityFeedController {
  private readonly logger = new Logger(EventActivityFeedController.name);

  constructor(
    private readonly activityFeedService: ActivityFeedService,
    private readonly eventQueryService: EventQueryService,
  ) {}

  @Public()
  @Get(':slug/feed')
  @ApiOperation({
    summary: 'Get activity feed for an event',
    description:
      'Returns recent activities for an event. Public endpoint with optional auth for more visibility.',
  })
  async getEventFeed(
    @Param('slug') slug: string,
    @Query() query: ActivityFeedQueryDto,
  ): Promise<ActivityFeedEntity[]> {
    this.logger.log(`getEventFeed called for slug: ${slug}`);
    this.logger.debug(`Query params: ${JSON.stringify(query)}`);

    try {
      // Verify event exists
      const event = await this.eventQueryService.findEventBySlug(slug);
      if (!event) {
        this.logger.warn(`Event not found for slug: ${slug}`);
        throw new NotFoundException(`Event with slug ${slug} not found`);
      }

      this.logger.debug(`Event found: ${event.id} - ${event.name}`);

      // Build query options
      const options: {
        limit?: number;
        offset?: number;
        visibility?: string[];
      } = {
        limit: query.limit || 20,
        offset: query.offset || 0,
      };

      // Include visibility filter if provided
      if (query.visibility && query.visibility.length > 0) {
        options.visibility = query.visibility;
      }

      this.logger.debug(
        `Fetching feed with options: ${JSON.stringify(options)}`,
      );
      const result = await this.activityFeedService.getEventFeed(
        event.id,
        options,
      );
      this.logger.log(`Feed result count: ${result.length} for event ${slug}`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error in getEventFeed for slug ${slug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
