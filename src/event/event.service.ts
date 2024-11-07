import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  InternalServerErrorException,
  UnprocessableEntityException,
  HttpStatus,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommentDto, CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { QueryEventDto } from './dto/query-events.dto';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  Status,
  Visibility,
} from '../core/constants/constant';
import slugify from 'slugify';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupMemberService } from '../group-member/group-member.service';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { ZulipService } from '../zulip/zulip.service';
@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private eventEmitter: EventEmitter2,
    private readonly groupMemberService: GroupMemberService,
    private readonly fileService: FilesS3PresignedService,
    private readonly zulipService: ZulipService,
  ) {
    void this.initializeRepository();
  }

  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async create(
    createEventDto: CreateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const user = { id: userId };
    const group = createEventDto.group ? { id: createEventDto.group } : null;

    let categories: CategoryEntity[] = [];
    try {
      categories = await this.categoryService.findByIds(
        createEventDto.categories,
      );
    } catch (error) {
      console.error('Error finding categories:', error);
      throw new NotFoundException(`Error finding categories: ${error.message}`);
    }

    const slugifiedName = slugify(createEventDto.name, {
      strict: true,
      lower: true,
    });

    const mappedDto = {
      ...createEventDto,
      user,
      slug: slugifiedName,
      group,
      categories,
    };
    const event = this.eventRepository.create(mappedDto as EventEntity);
    const createdEvent = await this.eventRepository.save(event);

    const eventAttendeeDto = {
      role: EventAttendeeRole.Host,
      status: EventAttendeeStatus.Confirmed,
    };
    await this.eventAttendeeService.attendEvent(
      eventAttendeeDto,
      userId,
      createdEvent.id,
    );
    return createdEvent;
  }

  async postComment(body: CommentDto, eventId: number) {
    const { message } = body;
    const event = await this.findOne(eventId);

    const timestamp = Date.now();
    const topicName = `${timestamp}-${message.split(' ').slice(0, 5).join('-').toLowerCase()}`;

    const params = {
      to: `${event.shortId}_${event.slug}`,
      type: 'stream',
      topic: topicName,
      content: message,
    };

    try {
      const response = await this.zulipService.PostZulipComment(params);
      console.log('Message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to create Zulip topic');
    }
  }

  async updateComment(body: CommentDto, messageId: number) {
    const { message } = body;

    try {
      const response = await this.zulipService.EditZulipMessage(
        messageId,
        message,
      );
      console.log('Message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to create Zulip topic');
    }
  }

  async deleteComment(messageId: number) {
    try {
      const response = await this.zulipService.DeleteZulipMessage(messageId);
      console.log('Message sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to create Zulip topic');
    }
  }

  async getTopics(eventId: number) {
    try {
      const event = await this.findOne(eventId);
      const streamName = `${event.shortId}_${event.slug}`;

      const response = this.zulipService.GetZulipTopics(streamName);

      return response;
    } catch (error) {
      console.error('Error fetching topics and messages from Zulip:', error);
      throw new Error('Failed to fetch topics and messages');
    }
  }

  async postCommentinTopic(
    body: CommentDto,
    topicName: string,
    eventId: number,
  ) {
    const { message } = body;

    const event = await this.findOne(eventId);

    const params = {
      to: `${event.shortId}_${event.slug}`,
      type: 'stream',
      topic: topicName,
      content: message,
    };

    try {
      const response = await this.zulipService.PostZulipComment(params);
      console.log('Message sent successfully to topic:', topicName);
      return response;
    } catch (error) {
      console.error('Error sending message to Zulip:', error);
      throw new Error('Failed to send message to the topic');
    }
  }

  async findAll(pagination: PaginationDto, query: QueryEventDto): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { page, limit } = pagination;
    const { search, userId, fromDate, toDate, categories, location, type } =
      query;

    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('event.attendees', 'attendees')
      .where('event.status = :status', { status: Status.Published });

    if (userId) {
      eventQuery.andWhere('event.user = :userId', { userId });
    }

    if (search) {
      eventQuery.andWhere(
        `(event.name LIKE :search OR 
          event.description LIKE :search OR 
          event.location LIKE :search OR 
          CAST(event.lat AS TEXT) LIKE :search OR 
          CAST(event.lon AS TEXT) LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    if (location) {
      eventQuery.andWhere('event.location LIKE :location', {
        location: `%${location}%`,
      });
    }

    if (type) {
      eventQuery.andWhere('event.type LIKE :type', {
        type: `%${type}%`,
      });
    }

    if (fromDate && toDate) {
      eventQuery.andWhere('event.createdAt BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      eventQuery.andWhere('event.createdAt >= :fromDate', { fromDate });
    } else if (toDate) {
      eventQuery.andWhere('event.createdAt <= :toDate', { toDate: new Date() });
    }

    if (categories && categories.length > 0) {
      const likeConditions = categories
        .map((_, index) => `categories.name LIKE :category${index}`)
        .join(' OR ');

      const likeParameters = categories.reduce((acc, category, index) => {
        acc[`category${index}`] = `%${category}%`;
        return acc;
      }, {});

      eventQuery.andWhere(`(${likeConditions})`, likeParameters);
    }

    return paginate(eventQuery, { page, limit });
  }

  async findOne(id: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: [
        'user',
        'attendees',
        'group',
        'group.groupMembers',
        'categories',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    event.attendees = event.attendees.slice(0, 5);
    event.categories = event.categories.slice(0, 5);

    return event;
  }

  async findEventDetails(id: number, userId: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: [
        'user',
        'attendees',
        'group',
        'group.groupMembers',
        'categories',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    event.attendees = event.attendees.slice(0, 5);
    event.categories = event.categories.slice(0, 5);

    if (event.group) {
      event.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );
    }

    if (userId) {
      event.attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );
    }

    return event;
  }

  async showGroupEvents(eventId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.findEventAttendees(eventId);
  }

  async findRandom(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const events = await this.eventRepository.find();

    if (!events || events.length === 0) {
      throw new NotFoundException(`Events not found`);
    }

    const shuffledEvents = events.sort(() => 0.5 - Math.random());

    const randomEvents = shuffledEvents.slice(0, 5);

    return randomEvents;
  }

  async getRecommendedEventsByEventId(eventId: number): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();
    const maxEvents = 5;

    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ['categories'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const categoryIds = event.categories?.map((c) => c.id);

    let recommendedEvents: EventEntity[] = [];
    try {
      recommendedEvents = await this.findRecommendedEventsForEvent(
        eventId,
        categoryIds,
        0,
        maxEvents,
      );
    } catch (error) {
      console.error('Error fetching recommended events:', error);
    }

    const remainingEventsToFetch = maxEvents - recommendedEvents.length;

    if (remainingEventsToFetch > 0) {
      try {
        const randomEvents = await this.findRandomEventsForEvent(
          eventId,
          0,
          remainingEventsToFetch,
        );
        recommendedEvents = [...recommendedEvents, ...randomEvents];
      } catch (error) {
        console.error('Error fetching random events:', error);
      }
    }

    // Deduplicate events
    const uniqueEvents = recommendedEvents.filter(
      (event, index, self) =>
        index === self.findIndex((t) => t.id === event.id),
    );

    return uniqueEvents.slice(0, maxEvents);
  }

  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .select('event.id')
      .addSelect('RANDOM()', 'random')
      .distinct(true)
      .innerJoin('event.categories', 'category')
      .where('event.status = :status', { status: Status.Published })
      .andWhere('event.id != :eventId', { eventId })
      .andWhere('category.id IN (:...categoryIds)', { categoryIds })
      .orderBy('random')
      .limit(maxEvents);
    const ids = await queryBuilder.getRawMany();

    if (ids.length < minEvents) {
      return [];
    }

    return this.eventRepository.findByIds(ids.map((row) => row.event_id));
  }

  async findRandomEventsForEvent(
    eventId: number,
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    try {
      const randomEvents = await this.eventRepository
        .createQueryBuilder('event')
        .select('event.id')
        .addSelect('RANDOM()', 'random')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('event.id != :eventId', { eventId })
        .orderBy('random')
        .limit(maxEvents)
        .getMany();

      if (randomEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough random events found for event ${eventId}. Found ${randomEvents.length}, expected at least ${minEvents}.`,
        );
      }

      return randomEvents;
    } catch (error) {
      console.error(`Error finding random events for event ${eventId}:`, error);
      throw error;
    }
  }

  async findRecommendedEventsForGroup(
    groupId: number,
    categories: number[],
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    try {
      const recommendedEvents = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.attendees', 'attendees')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .andWhere('categories.id IN (:...categories)', { categories })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getMany();

      if (recommendedEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough recommended events found for group ${groupId}. Found ${recommendedEvents.length}, expected at least ${minEvents}.`,
        );
      }

      return recommendedEvents.slice(0, maxEvents);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding recommended events for group ${groupId}: ${error.message}`,
      );
    }
  }

  async findRandomEventsForGroup(
    groupId: number,
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    try {
      const randomEventIds = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoin('event.group', 'group')
        .select('event.id')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getRawMany();

      // Then fetch full event details for these IDs
      const events = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.attendees', 'attendees')
        .where('event.id IN (:...ids)', {
          ids: randomEventIds.map((e) => e.event_id),
        })
        .getMany();

      return events;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding random events for group ${groupId}: ${error.message}`,
      );
    }
  }

  async update(
    id: number,
    updateEventDto: UpdateEventDto,
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    const group = updateEventDto.group ? { id: updateEventDto.group } : null;
    const user = { id: userId };

    let slugifiedName = '';

    if (updateEventDto.name) {
      slugifiedName = slugify(updateEventDto.name, {
        strict: true,
        lower: true,
      });
    }

    const mappedDto: any = {
      ...updateEventDto,
      slug: slugifiedName,
      user,
      group,
    };

    if (updateEventDto.categories && updateEventDto.categories.length) {
      const categories = await this.categoryService.findByIds(
        updateEventDto.categories,
      );
      mappedDto.categories = categories;
    }

    if (mappedDto.image?.id === 0) {
      if (mappedDto.image) {
        await this.fileService.delete(mappedDto.image.id);
        mappedDto.image = null;
      }
    } else if (mappedDto.image?.id) {
      const fileObject = await this.fileService.findById(mappedDto.image.id);

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }

      mappedDto.image = fileObject;
    }

    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    return this.eventRepository.save(updatedEvent);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
  }

  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    await this.eventRepository.delete({ group: { id: groupId } });
  }

  async getEventsByCreator(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events =
      (await this.eventRepository.find({
        where: { user: { id: userId } },
        relations: ['user', 'attendees'],
      })) || [];
    return events.map((event) => ({
      ...event,
      attendeesCount: event.attendees ? event.attendees.length : 0,
    }));
  }

  async getEventsByAttendee(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { attendees: { userId } },
      relations: ['user', 'attendees'],
    });
    return events.map((event) => ({
      ...event,
      attendeesCount: event.attendees ? event.attendees.length : 0,
    }));
  }

  async getHomePageFeaturedEvents(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    return this.eventRepository
      .createQueryBuilder('event')
      .where({ visibility: Visibility.Public, status: Status.Published })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object
  }

  async getHomePageUserUpcomingEvents(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: Status.Published },
      relations: ['user', 'attendees'],
    }); // TODO: check if this is correct. Should return list of user upcoming events (Home Page)
  }

  async getHomePageUserRecentEventDrafts(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: Status.Draft },
    }); // TODO: check if this is correct. Should return list of user recent event drafts (Home Page)
  }

  async getHomePageUserNextHostedEvent(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.findOne({ where: { user: { id: userId } } });
  }

  async findEventDetailsAttendees(eventId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.findEventAttendees(eventId);
  }

  async findEventsForGroup(groupId: number, limit: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { group: { id: groupId } },
      take: limit,
    });
  }
}
