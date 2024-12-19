import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TESTING_USER_ID } from '../../test/utils/constants';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  EventType,
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
  mockEventAttendeeService,
  mockGroup,
  mockGroupMembers,
  mockTenantConnectionService,
  mockFilesS3PresignedService,
  mockRepository,
  mockEventAttendee,
  mockEventRoleService,
  mockUserService,
  mockUser,
  mockZulipMessageResponse,
  mockZulipMessage,
} from '../test/mocks';
import { mockEvents } from '../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';
import { EventRecommendationService } from './event-recommendation.service';
import { mockEventRecommendationService } from '../test/mocks/event-mocks';
import { NotFoundException } from '@nestjs/common';

describe('EventService', () => {
  let service: EventService;
  let eventAttendeeService: EventAttendeeService;
  let eventRepository: Repository<EventEntity>;
  let zulipService: ZulipService;

  const mockEvent: EventEntity = {
    id: 1,
    slug: 'test-event',
    createdAt: new Date(),
    updatedAt: new Date(),
    ulid: 'test-ulid',
    name: 'Test Event',
    description: 'Test Description',
    startDate: new Date(),
    endDate: new Date(),
    type: EventType.InPerson,
    location: 'Test Location',
    locationOnline: 'Test Location Online',
    maxAttendees: 100,
    categories: [],
    lat: 0,
    lon: 0,
  } as unknown as EventEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EventRecommendationService,
          useValue: mockEventRecommendationService,
        },
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
            sendEventDiscussionMessage: jest
              .fn()
              .mockResolvedValue({ id: 123 }),
            updateEventDiscussionMessage: jest
              .fn()
              .mockResolvedValue({ id: 123 }),
            deleteEventDiscussionMessage: jest
              .fn()
              .mockResolvedValue({ id: 123 }),
          },
        },
        {
          provide: EventRoleService,
          useValue: mockEventRoleService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
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
    zulipService = module.get<ZulipService>(ZulipService);

    // Mock findOne to return null by default
    jest.spyOn(service['eventRepository'], 'findOne').mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event', async () => {
      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: 'hybrid',
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
      jest.spyOn(eventAttendeeService, 'create').mockResolvedValue({
        id: 1,
        userId: TESTING_USER_ID,
        eventId: 1,
        status: EventAttendeeStatus.Confirmed,
        role: EventAttendeeRole.Participant,
        event: { id: 1 } as EventEntity,
        user: { id: TESTING_USER_ID } as UserEntity,
      } as unknown as EventAttendeesEntity);

      jest
        .spyOn(service['eventRepository'], 'save')
        .mockResolvedValue(mockEvent);

      const event = await service.create(createEventDto, mockUser.id);
      expect(event).toEqual(mockEvent);
    });
  });

  describe('getTenantSpecificEventRepository', () => {
    it('should get the tenant specific event repository', async () => {
      await service.getTenantSpecificEventRepository();
      expect(service['eventRepository']).toBeDefined();
    });
  });

  describe('getEventsByCreator', () => {
    it('should return events created by the user', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue(mockRepository),
        } as any);

      const events = await service.getEventsByCreator(mockUser.id);
      expect(events).toBeTruthy();
    });
  });

  describe('findRecommendedEventsForGroup', () => {
    it('should return recommended events for a group', async () => {
      jest
        .spyOn(service, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockEvents);
      const result = await service.findRecommendedEventsForGroup(1, [1, 2], 3);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('findRandomEventsForGroup', () => {
    it('should return random events for a group', async () => {
      jest
        .spyOn(service, 'findRandomEventsForGroup')
        .mockResolvedValue(mockEvents);
      const result = await service.findRandomEventsForGroup(mockGroup.id, 5);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('findEventsForGroup', () => {
    it('should return events for a group', async () => {
      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents);
      const result = await service.findEventsForGroup(mockGroup.id, 3);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('showRandomEvents', () => {
    it('should return random published events', async () => {
      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents);
      const result = await service.showRandomEvents(3);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest.spyOn(service, 'editEvent').mockResolvedValue(mockEvent);
      const result = await service.editEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('attendEvent', () => {
    it('should attend an event', async () => {
      jest.spyOn(service, 'attendEvent').mockResolvedValue(mockEventAttendee);
      const result = await service.attendEvent(
        mockEvent.slug,
        mockUser.id,
        mockEventAttendee,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('cancelAttendingEvent', () => {
    it('should cancel attending an event', async () => {
      jest
        .spyOn(service, 'cancelAttendingEvent')
        .mockResolvedValue(mockEventAttendee);
      const result = await service.cancelAttendingEvent(
        mockEvent.slug,
        mockUser.id,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('sendEventDiscussionMessage', () => {
    it('should delegate to zulipService when event exists', async () => {
      // Mock findOne to return an event for this test
      jest
        .spyOn(service['eventRepository'], 'findOne')
        .mockResolvedValueOnce(mockEvent);

      const messageData = {
        message: 'Test message',
        topicName: 'Test topic',
      };

      const result = await service.sendEventDiscussionMessage(
        mockEvent.slug,
        1,
        messageData,
      );

      expect(zulipService.sendEventDiscussionMessage).toHaveBeenCalledWith(
        mockEvent.slug,
        1,
        messageData,
      );
      expect(result).toEqual({ id: 123 });
    });

    it('should throw NotFoundException when event not found', async () => {
      // findOne is already mocked to return null by default

      await expect(
        service.sendEventDiscussionMessage('invalid-slug', 1, {
          message: 'test',
          topicName: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEventDiscussionMessage', () => {
    it('should update an event discussion message', async () => {
      jest
        .spyOn(service, 'updateEventDiscussionMessage')
        .mockResolvedValue(mockZulipMessageResponse);
      const result = await service.updateEventDiscussionMessage(
        mockZulipMessage.id,
        mockZulipMessage.content,
        mockUser.id,
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('deleteEventDiscussionMessage', () => {
    it('should delete an event discussion message', async () => {
      const messageId = 123;
      const userId = 1;

      jest
        .spyOn(zulipService, 'deleteEventDiscussionMessage')
        .mockResolvedValue(mockZulipMessageResponse);

      const result = await service.deleteEventDiscussionMessage(
        messageId,
        userId,
      );

      expect(zulipService.deleteEventDiscussionMessage).toHaveBeenCalledWith(
        messageId,
        userId,
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });
});
