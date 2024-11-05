import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TESTER_USER_ID } from '../../test/utils/constants';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../src/core/constants/constant';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMemberService } from '../group-member/group-member.service';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { ZulipService } from '../zulip/zulip.service';
import {
  mockCategoryService,
  mockEvent,
  mockEventAttendeeService,
  mockGroup,
  mockGroupMembers,
  mockTenantConnectionService,
  mockFilesS3PresignedService,
  mockRepository,
} from '../test/mocks';
import { mockEvents } from '../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('EventService', () => {
  let service: EventService;
  let eventAttendeeService: EventAttendeeService;
  let eventRepository: Repository<EventEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CategoryService,
          useValue: mockCategoryService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            findGroupDetailsMembers: mockGroupMembers,
          },
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
        {
          provide: ZulipService,
          useValue: {
            createTopic: jest.fn().mockResolvedValue({}),
            sendMessage: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = await module.resolve<EventService>(EventService);
    eventRepository = module.get<Repository<EventEntity>>(
      getRepositoryToken(EventEntity),
    );

    eventAttendeeService =
      await module.resolve<EventAttendeeService>(EventAttendeeService);
    await service.getTenantSpecificEventRepository();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe.skip('create', () => {
    it('should create an event', async () => {
      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: 'in person',
        location: 'Test Location',
        locationOnline: 'Test Location Online',
        maxAttendees: 100,
        categories: [1, 2],
        lat: 1,
        lon: 1,
        group: 1,
      };

      const mockAttendees = [
        {
          id: 1,
          name: 'Attendee 1',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Participant,
        } as unknown as EventAttendeesEntity,
        {
          id: 2,
          name: 'Attendee 2',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Speaker,
        } as unknown as EventAttendeesEntity,
      ];

      // Mock category service response
      jest.spyOn(service['categoryService'], 'findByIds').mockResolvedValue([
        {
          id: 1,
          name: 'Category 1',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
        {
          id: 2,
          name: 'Category 2',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
      ]);

      // Mock event attendee service
      jest.spyOn(eventAttendeeService, 'attendEvent').mockResolvedValue({
        id: 1,
        userId: TESTER_USER_ID,
        eventId: 1,
        status: EventAttendeeStatus.Confirmed,
        role: EventAttendeeRole.Participant,
        event: { id: 1 } as EventEntity,
        user: { id: TESTER_USER_ID } as UserEntity,
      } as unknown as EventAttendeesEntity);

      const event = await service.create(createEventDto, TESTER_USER_ID);
      expect(event).toBeDefined();
    });
  });

  describe('getTenantSpecificEventRepository', () => {
    it('should get the tenant specific event repository', async () => {
      await service.getTenantSpecificEventRepository();
      expect(service['eventRepository']).toBeDefined();
    });
  });

  describe('getEventsByCreator', () => {
    let mockEvents: Partial<EventEntity>[];

    it.skip('should return events created by the user when empty', async () => {
      const events = await service.getEventsByCreator(TESTER_USER_ID);
      expect(events).toEqual([]);
    });

    it.skip('should return events created by the user', async () => {
      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue(mockRepository),
        } as any);

      const events = await service.getEventsByCreator(TESTER_USER_ID);

      expect(mockRepository.find).toHaveBeenCalled();

      expect(events).toHaveLength(mockEvents.length);
      expect(events[0]).toEqual({
        ...mockEvents[0],
        attendeesCount: 0,
      });
      expect(events[1]).toEqual({
        ...mockEvents[1],
        attendeesCount: 1,
      });
      expect(events[2]).toEqual({
        ...mockEvents[2],
        attendeesCount: 2,
      });
    });
  });

  describe('findRecommendedEventsForGroup', () => {
    it('should throw error when not enough recommended events are found', async () => {
      const minEvents = 3;

      await expect(
        service.findRecommendedEventsForGroup(1, [1, 2], minEvents),
      ).rejects.toThrow();
    });
  });

  describe.skip('findRandomEventsForGroup', () => {
    it('should return random events for a group', async () => {
      const result = await service.findRandomEventsForGroup(mockGroup.id, 3, 5);
      expect(result).toEqual(mockEvents);
    });
  });

  describe.skip('getRecommendedEventsByEventId', () => {
    it('should return recommended events if enough are found', async () => {
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(eventRepository, 'createQueryBuilder').mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.getRecommendedEventsByEventId(mockEvent.id);
      expect(result).toEqual(mockEvents);
    });

    it('should fetch additional random events if not enough recommended events are found', async () => {
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(mockEvent);
      jest.spyOn(eventRepository, 'createQueryBuilder').mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.getRecommendedEventsByEventId(mockEvent.id);
      expect(result).toEqual(mockEvents);
    });
  });
});
