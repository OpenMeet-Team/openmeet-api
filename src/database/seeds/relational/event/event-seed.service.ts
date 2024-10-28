import { Injectable } from '@nestjs/common';
import { EventEntity } from 'src/event/infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { eventSeedData } from './event-seed.seed';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import slugify from 'slugify';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from 'src/core/constants/constant';
import { EventAttendeesEntity } from 'src/event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';

@Injectable()
export class EventSeedService {
  private groupRepository: Repository<GroupEntity>;
  private userRepository: Repository<UserEntity>;
  private categoryRepository: Repository<CategoryEntity>;
  private eventRepository: Repository<EventEntity>;
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.userRepository = dataSource.getRepository(UserEntity);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);

    const count = await this.eventRepository.count();
    if (count === 0) {
      await this.seedEvents();
    }
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

      const event = await this.eventRepository.create({
        name: eventData.name,
        slug: slugify(eventData.name, {
          strict: true,
          lower: true,
        }),
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
        group: randomGroup?.id ? { id: randomGroup.id } : undefined,
        user: { id: randomUser.id },
        categories: selectedCategories.map((category) => category),
      });

      const createdEvent = await this.eventRepository.save(event);

      const attendee = this.eventAttendeesRepository.create({
        status: EventAttendeeStatus.Confirmed,
        role: EventAttendeeRole.Host,
        event: { id: createdEvent.id },
        user: { id: randomUser.id },
      });
      await this.eventAttendeesRepository.save(attendee);
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
