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
import { GroupService } from '../group/group.service';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { Public } from '../auth/decorators/public.decorator';
import { JWTAuthGuard } from '../auth/auth.guard';

@ApiTags('Activity Feed')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ActivityFeedController {
  private readonly logger = new Logger(ActivityFeedController.name);

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
        limit: query.limit || 20,
        offset: query.offset || 0,
      };

      // Include visibility filter if provided
      if (query.visibility && query.visibility.length > 0) {
        options.visibility = query.visibility;
      }

      this.logger.debug(`Fetching feed with options: ${JSON.stringify(options)}`);
      const result = await this.activityFeedService.getGroupFeed(group.id, options);
      this.logger.log(`Feed result count: ${result.length} for group ${slug}`);

      return result;
    } catch (error) {
      this.logger.error(`Error in getGroupFeed for slug ${slug}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
