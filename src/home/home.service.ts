import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { GroupService } from '../group/group.service';
import { EventService } from '../event/event.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { SubCategoryService } from '../sub-category/sub-category.service';

@Injectable()
export class HomeService {
  constructor(
    private configService: ConfigService<AllConfigType>,
    private groupService: GroupService,
    private eventService: EventService,
    private categoryService: CategoryService,
    private subCategoryService: SubCategoryService,
  ) {}

  appInfo() {
    return { name: this.configService.get('app.name', { infer: true }) };
  }

  async getGuestHomeState() {
    const [featuredGroups, upcomingEvents, categories, interests] =
      await Promise.all([
        this.groupService.getHomePageFeaturedGroups(),
        this.eventService.getHomePageFeaturedEvents(),
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
      this.eventService.getHomePageUserNextHostedEvent(user.id),
      this.eventService.getHomePageUserRecentEventDrafts(user.id),
      this.eventService.getHomePageUserUpcomingEvents(user.id),
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
}
