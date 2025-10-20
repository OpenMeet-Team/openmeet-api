import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActivityFeedService } from './activity-feed.service';
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
        limit: query.limit || 20,
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
