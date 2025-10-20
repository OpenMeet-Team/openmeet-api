import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
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
    console.log('ActivityFeedController.getGroupFeed called for slug:', slug);
    console.log('Query params:', query);

    try {
      // Verify group exists
      const group = await this.groupService.getGroupBySlug(slug);
      if (!group) {
        console.log('Group not found for slug:', slug);
        throw new NotFoundException(`Group with slug ${slug} not found`);
      }

      console.log('Group found:', group.id, group.name);

      // Build query options
      const options: {
        limit?: number;
        visibility?: string[];
      } = {
        limit: query.limit || 50,
      };

      // Include visibility filter if provided
      if (query.visibility && query.visibility.length > 0) {
        options.visibility = query.visibility;
      }

      console.log('Fetching feed with options:', options);
      const result = await this.activityFeedService.getGroupFeed(group.id, options);
      console.log('Feed result count:', result.length);

      return result;
    } catch (error) {
      console.error('Error in getGroupFeed:', error);
      throw error;
    }
  }
}
