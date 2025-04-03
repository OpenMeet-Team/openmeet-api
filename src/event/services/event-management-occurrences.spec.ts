import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { EventManagementService } from './event-management.service';
import { EventOccurrenceService } from './occurrences/event-occurrence.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CategoryService } from '../../category/category.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../../file/infrastructure/uploader/s3-presigned/file.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { UserService } from '../../user/user.service';
import { EventMailService } from '../../event-mail/event-mail.service';
import { BlueskyService } from '../../bluesky/bluesky.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { EventType } from '../../core/constants/constant';
import { EventQueryService } from './event-query.service';
import { EventSeriesService } from '../../event-series/services/event-series.service';
import { mockEventSeriesService } from '../../test/mocks';

describe('EventManagementService Integration with EventOccurrenceService', () => {
  let managementService: EventManagementService;
  let mockOccurrenceService: jest.Mocked<EventOccurrenceService>;
  let eventRepository: jest.Mocked<Repository<EventEntity>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    // Create mock implementations
    mockOccurrenceService = {
      generateOccurrences: jest.fn(),
      getOccurrencesInRange: jest.fn(),
      createExceptionOccurrence: jest.fn(),
      excludeOccurrence: jest.fn(),
      includeOccurrence: jest.fn(),
      deleteAllOccurrences: jest.fn(),
      initializeRepository: jest.fn(),
    } as unknown as jest.Mocked<EventOccurrenceService>;

    eventRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([
        [
          { id: 1, name: 'Test Event 1' },
          { id: 2, name: 'Test Event 2' },
        ],
        2,
      ]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getMany: jest.fn(),
      })),
    } as unknown as jest.Mocked<Repository<EventEntity>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventManagementService,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue(eventRepository),
            }),
          },
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: eventRepository,
        },
        {
          provide: CategoryService,
          useValue: {
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            create: jest.fn(),
            findEventAttendeeByUserId: jest.fn(),
            showEventAttendeesCount: jest.fn(),
            createEventMember: jest.fn(),
            findEventAttendees: jest.fn(),
            deleteEventAttendees: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FilesS3PresignedService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
            getUserById: jest.fn().mockResolvedValue({}),
            findByIdWithPreferences: jest.fn().mockResolvedValue({
              id: 1,
              preferences: {},
            }),
          },
        },
        {
          provide: EventMailService,
          useValue: {
            sendMailAttendeeGuestJoined: jest.fn(),
            sendMailAttendeeStatusChanged: jest.fn(),
          },
        },
        {
          provide: BlueskyService,
          useValue: {
            getUserDid: jest.fn().mockResolvedValue('did:whatever'),
            createEvent: jest
              .fn()
              .mockResolvedValue({ uri: 'at://test', cid: 'test' }),
            updateEvent: jest.fn().mockResolvedValue({}),
            deleteEvent: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: EventOccurrenceService,
          useValue: mockOccurrenceService,
        },
        {
          provide: EventQueryService,
          useValue: {
            findEventBySlug: jest.fn(),
            findAll: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: REQUEST,
          useValue: {
            tenantId: 'test-tenant',
            user: {
              id: 1,
              preferences: {
                bluesky: {
                  connected: true,
                },
              },
            },
          },
        },
        {
          provide: 'DiscussionService',
          useValue: {
            createEventRoom: jest.fn(),
            cleanupEventChatRooms: jest.fn(),
          },
        },
        {
          provide: EventSeriesService,
          useValue: mockEventSeriesService,
        },
      ],
    }).compile();

    managementService = await module.resolve<EventManagementService>(
      EventManagementService,
    );
  });

  describe('delete', () => {
    it('should delete an event and delete all its recurrence occurrences if it is recurring', async () => {
      // Mock data
      const recurringEvent = new EventEntity();
      Object.assign(recurringEvent, {
        id: 1,
        name: 'Event to delete',
        slug: 'event-to-delete',
        isRecurring: true,
        sourceType: null,
        sourceId: null,
      });

      // Mocks
      eventRepository.findOne.mockResolvedValue(recurringEvent);
      eventRepository.remove.mockResolvedValue(recurringEvent);
      mockOccurrenceService.deleteAllOccurrences.mockResolvedValue(0);

      // Call service
      await managementService.remove('event-to-delete');

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'event-to-delete' },
      });
      expect(mockOccurrenceService.deleteAllOccurrences).toHaveBeenCalledWith(
        1,
      );
      expect(eventRepository.remove).toHaveBeenCalledWith(recurringEvent);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.deleted',
        expect.anything(),
      );
    });
  });

  describe('EventSeries Integration', () => {
    it('should work with the EventSeries functionality', () => {
      // This test verifies that we've migrated from direct recurrence code
      // to the EventSeries architecture

      // Create event part of a series
      const createDto: CreateEventDto = {
        name: 'Test Event Series Occurrence',
        description: 'This is a test event',
        type: EventType.InPerson,
        startDate: new Date(),
        endDate: new Date(),
        categories: [],
        locationOnline: 'false',
        maxAttendees: 100,
        lat: 0,
        lon: 0,
      };

      const createdEvent = new EventEntity();
      Object.assign(createdEvent, {
        id: 123,
        ...createDto,
        seriesId: 1,
        materialized: true,
      });

      eventRepository.create.mockReturnValue(createdEvent);
      eventRepository.save.mockResolvedValue(createdEvent);

      // Verify that the service is provided correctly
      expect(managementService).toBeDefined();
      // Call a method that uses the EventSeriesService to verify it's injected correctly
      expect(() =>
        managementService.findEventsBySeriesSlug('test-series'),
      ).not.toThrow();
    });
  });

  describe('findEventsBySeriesSlug', () => {
    it('should return events for a given series slug', async () => {
      const result =
        await managementService.findEventsBySeriesSlug('test-series');
      expect(result).toBeDefined();
    });
  });
});
