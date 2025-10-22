import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Logger,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { Public } from '../auth/decorators/public.decorator';
import { JWTAuthGuard } from '../auth/auth.guard';

@ApiTags('Activity Feed')
@Controller('feed')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class SitewideActivityFeedController {
  private readonly logger = new Logger(SitewideActivityFeedController.name);

  constructor(private readonly activityFeedService: ActivityFeedService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get sitewide activity feed',
    description:
      'Returns recent activities across all public groups. Public endpoint with optional auth for more visibility. Guests see only public activities, authenticated users see public + authenticated activities.',
  })
  async getSitewideFeed(
    @Query() query: ActivityFeedQueryDto,
    @Request() req: any,
  ): Promise<ActivityFeedEntity[]> {
    this.logger.log('getSitewideFeed called');
    this.logger.debug(`Query params: ${JSON.stringify(query)}`);

    try {
      // Determine visibility based on authentication
      // Guests (no user) see only 'public'
      // Authenticated users see 'public' + 'authenticated'
      const isAuthenticated = req.user && req.user.id;
      const visibility = isAuthenticated
        ? ['public', 'authenticated']
        : ['public'];

      this.logger.debug(
        `User authenticated: ${isAuthenticated}, visibility: ${visibility.join(', ')}`,
      );

      // Build query options
      const options: {
        limit?: number;
        offset?: number;
        visibility?: string[];
      } = {
        limit: query.limit || 10,
        offset: query.offset || 0,
        visibility,
      };

      this.logger.debug(
        `Fetching sitewide feed with options: ${JSON.stringify(options)}`,
      );
      const result = await this.activityFeedService.getSitewideFeed(options);
      this.logger.log(`Sitewide feed result count: ${result.length}`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error in getSitewideFeed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

@ApiTags('Activity Feed')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupActivityFeedController {
  private readonly logger = new Logger(GroupActivityFeedController.name);

  constructor(
    private readonly activityFeedService: ActivityFeedService,
    private readonly groupService: GroupService,
  ) {}

  @Public()
  @Get(':slug/feed')
  @ApiOperation({
    summary: 'Get activity feed for a group',
    description:
      'Returns recent activities for a group. Public endpoint with optional auth for more visibility.',
  })
  async getGroupFeed(
    @Param('slug') slug: string,
    @Query() query: ActivityFeedQueryDto,
  ): Promise<ActivityFeedEntity[]> {
    this.logger.log(`getGroupFeed called for slug: ${slug}`);
    this.logger.debug(`Query params: ${JSON.stringify(query)}`);

    try {
      // Verify group exists
      const group = await this.groupService.getGroupBySlug(slug);
      if (!group) {
        this.logger.warn(`Group not found for slug: ${slug}`);
        throw new NotFoundException(`Group with slug ${slug} not found`);
      }

      this.logger.debug(`Group found: ${group.id} - ${group.name}`);

      // Build query options
      const options: {
        limit?: number;
        offset?: number;
        visibility?: string[];
      } = {
        limit: query.limit || 10,
        offset: query.offset || 0,
      };

      // Include visibility filter if provided
      if (query.visibility && query.visibility.length > 0) {
        options.visibility = query.visibility;
      }

      this.logger.debug(
        `Fetching feed with options: ${JSON.stringify(options)}`,
      );
      const result = await this.activityFeedService.getGroupFeed(
        group.id,
        options,
      );
      this.logger.log(`Feed result count: ${result.length} for group ${slug}`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error in getGroupFeed for slug ${slug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

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
        limit: query.limit || 10,
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
