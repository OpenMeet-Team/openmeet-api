import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { GroupService } from '../group/group.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { getBuildInfo } from '../utils/version';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { HomeQuery } from './dto/home-query.dto';
import { EventQueryService } from '../event/services/event-query.service';

@Injectable()
export class HomeService {
  constructor(
    private configService: ConfigService<AllConfigType>,
    private groupService: GroupService,
    private eventQueryService: EventQueryService,
    private categoryService: CategoryService,
    private subCategoryService: SubCategoryService,
  ) {}

  getAppInfo() {
    return getBuildInfo();
  }

  getRootRedirect() {
    const environment = this.configService.get('app.nodeEnv', { infer: true });
    const isProd = environment === 'production';

    const redirectUrl = isProd
      ? 'https://platform.openmeet.net'
      : 'https://platform-dev.openmeet.net';

    return {
      url: redirectUrl,
      statusCode: 302,
    };
  }

  async getGuestHomeState() {
    const [featuredGroups, upcomingEvents, categories, interests] =
      await Promise.all([
        this.groupService.getHomePageFeaturedGroups(),
        this.eventQueryService.getHomePageFeaturedEvents(),
        this.categoryService.getHomePageFeaturedCategories(),
        this.subCategoryService.getHomePageFeaturedSubCategories(),
      ]);

    return {
      groups: featuredGroups,
      events: upcomingEvents,
      categories: categories,
      interests: interests,
    };
  }

  async getUserHomeState(user: UserEntity) {
    const [
      organizedGroups,
      nextHostedEvent,
      recentEventDrafts,
      upcomingEvents,
      memberGroups,
      interests,
    ] = await Promise.all([
      this.groupService.getHomePageUserCreatedGroups(user.id, 3),
      this.eventQueryService.getHomePageUserNextHostedEvent(user.id),
      this.eventQueryService.getHomePageUserRecentEventDrafts(user.id),
      this.eventQueryService.getHomePageUserUpcomingEvents(user.id),
      this.groupService.getHomePageUserParticipatedGroups(user.id),
      this.subCategoryService.getHomePageUserInterests(user.id),
    ]);

    return {
      organizedGroups: organizedGroups,
      nextHostedEvent: nextHostedEvent,
      recentEventDrafts: recentEventDrafts,
      upcomingEvents: upcomingEvents,
      memberGroups: memberGroups,
      interests: interests,
    };
  }

  async globalSearch(pagination: PaginationDto, query: HomeQuery) {
    const [event, group] = await Promise.all([
      this.eventQueryService.searchAllEvents(pagination, query),
      this.groupService.searchAllGroups(pagination, query),
    ]);

    return {
      events: event,
      groups: group,
    };
  }
}
