import { Injectable } from '@nestjs/common';
import { EventEntity } from 'src/event/infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { eventSeedData } from './event-seed.seed';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { EventService } from 'src/event/event.service';
import { TenantConnectionService } from '../../../../tenant/tenant.service';

@Injectable()
export class EventSeedService {
  private groupRepository: Repository<GroupEntity>;
  private userRepository: Repository<UserEntity>;
  private categoryRepository: Repository<CategoryEntity>;
  private eventRepository: Repository<EventEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventService: EventService,
  ) {}

  run(tenantId: string) {
    console.log(tenantId, this.tenantConnectionService);
    // const dataSource =
    //   await this.tenantConnectionService.getTenantConnection(tenantId);
    // this.groupRepository = dataSource.getRepository(GroupEntity);
    // this.userRepository = dataSource.getRepository(UserEntity);
    // this.categoryRepository = dataSource.getRepository(CategoryEntity);
    // this.eventRepository = dataSource.getRepository(EventEntity);
    // const count = await this.eventRepository.count();
    // if (count === 0) {
    //   // await this.seedEvents();
    // }
  }

  private async seedEvents() {
    const allCategories = await this.categoryRepository.find();
    const allUsers = await this.userRepository.find();
    const allGroups = await this.groupRepository.find();

    for (const eventData of eventSeedData) {
      const randomUser = this.getRandomItem(allUsers);
      const randomGroup =
        Math.random() > 0.5 ? this.getRandomItem(allGroups) : null;
      const numberOfCategories = Math.floor(Math.random() * 3) + 1;
      const selectedCategories = this.getRandomCategories(
        allCategories,
        numberOfCategories,
      );

      try {
        const event = await this.eventService.create(
          {
            name: eventData.name,
            image: eventData.image ?? '',
            type: eventData.type,
            locationOnline: eventData.locationOnline ?? '',
            description: eventData.description,
            startDate: eventData.startDate,
            endDate: eventData.endDate,
            maxAttendees: eventData.maxAttendees,
            location: eventData.location ?? '',
            lat: eventData.lat ?? 0,
            lon: eventData.lon ?? 0,
            status: eventData.status,
            visibility: eventData.visibility,
            group: randomGroup?.id ?? undefined,
            categories: selectedCategories.map((category) => category.id),
          },
          randomUser.id,
        );

        console.log(`Created event: ${event.name}`);
      } catch (error) {
        console.error(`Failed to create event ${eventData.name}:`, error);
      }
    }
  }

  private getRandomCategories(
    allCategories: CategoryEntity[],
    numberOfCategories: number,
  ) {
    return allCategories
      .sort(() => Math.random() - 0.5)
      .slice(0, numberOfCategories);
  }

  private getRandomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }
}
