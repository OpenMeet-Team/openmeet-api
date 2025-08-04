import { Injectable } from '@nestjs/common';
import { EventEntity } from '../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { eventSeedData } from './event-seed.seed';
import { CategoryEntity } from '../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupEntity } from '../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../../../core/constants/constant';
import { EventAttendeesEntity } from '../../../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventRoleEntity } from 'src/event-role/infrastructure/persistence/relational/entities/event-role.entity';

@Injectable()
export class EventSeedService {
  private groupRepository: Repository<GroupEntity>;
  private userRepository: Repository<UserEntity>;
  private categoryRepository: Repository<CategoryEntity>;
  private eventRepository: Repository<EventEntity>;
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;
  private eventRoleRepository: Repository<EventRoleEntity>;
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
    this.eventRoleRepository = dataSource.getRepository(EventRoleEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);

    const count = await this.eventRepository.count();
    if (count === 0) {
      await this.seedEvents();
    }
  }

  private async seedEvents() {
    const allCategories = await this.categoryRepository.find();
    const hostRole = await this.eventRoleRepository.findOne({
      where: { name: EventAttendeeRole.Host },
    });

    // Get actual users from the database instead of using hardcoded IDs
    const availableUsers = await this.userRepository.find();
    if (availableUsers.length === 0) {
      console.log('No users found - skipping event seeding');
      return;
    }

    for (const eventData of eventSeedData) {
      // Assign a random actual user to each event
      const randomUser =
        availableUsers[Math.floor(Math.random() * availableUsers.length)];

      const numberOfCategories = Math.floor(Math.random() * 3) + 1;
      const selectedCategories = this.getRandomCategories(
        allCategories,
        numberOfCategories,
      );

      const event = await this.eventRepository.create({
        name: eventData.name,
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
        group: eventData.group,
        user: randomUser, // Use actual user instead of hardcoded ID
        categories: selectedCategories.map((category) => category),
        approvalQuestion: eventData.approvalQuestion ?? '',
        allowWaitlist: eventData.allowWaitlist ?? false,
        requireApproval: eventData.requireApproval ?? false,
        requireGroupMembership: eventData.requireGroupMembership ?? false,
      });

      const createdEvent = await this.eventRepository.save(event);

      const attendee = this.eventAttendeesRepository.create({
        status: EventAttendeeStatus.Confirmed,
        role: { id: hostRole?.id },
        event: { id: createdEvent.id },
        user: randomUser, // Use the same user as the event owner
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
