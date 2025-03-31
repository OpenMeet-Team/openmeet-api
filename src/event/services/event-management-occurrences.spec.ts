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
import { UpdateEventDto } from '../dto/update-event.dto';
import {
  EventType,
} from '../../core/constants/constant';

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
      findOneOrFail: jest.fn(),
      merge: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<EventEntity>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const mockRequest = { tenantId: 'test-tenant', user: { id: 1 } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventManagementService,
        {
          provide: EventOccurrenceService,
          useValue: mockOccurrenceService,
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue(eventRepository),
            }),
          },
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
            deleteEventAttendees: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: FilesS3PresignedService,
          useValue: {
            delete: jest.fn(),
            findById: jest.fn(),
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
            getUserById: jest.fn().mockResolvedValue({ id: 1 }),
            findByIdWithPreferences: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
        {
          provide: EventMailService,
          useValue: {
            sendMailAttendeeGuestJoined: jest.fn(),
          },
        },
        {
          provide: BlueskyService,
          useValue: {
            createEventRecord: jest.fn(),
            deleteEventRecord: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: eventRepository,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: 'DiscussionService',
          useValue: {
            cleanupEventChatRooms: jest.fn(),
          },
        },
      ],
    }).compile();

    managementService = await module.resolve(EventManagementService);

    // Setup repository manually
    Object.defineProperty(managementService, 'eventRepository', {
      value: eventRepository,
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a recurring event and generate occurrences', async () => {
      // Mock data
      const createEventDto = {
        name: 'Recurring Test Event',
        description: 'Test Description',
        type: EventType.InPerson,
        startDate: new Date('2025-01-01T10:00:00Z'),
        endDate: new Date('2025-01-01T12:00:00Z'),
        maxAttendees: 20,
        categories: [],
        location: 'Test Location',
        locationOnline: '',
        lat: 0,
        lon: 0,
        timeZone: 'UTC',
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
          count: 4,
        },
      } as CreateEventDto;

      const createdEvent = new EventEntity();
      Object.assign(createdEvent, {
        id: 1,
        name: createEventDto.name,
        description: createEventDto.description,
        startDate: createEventDto.startDate,
        endDate: createEventDto.endDate,
        isRecurring: true,
        recurrenceRule: createEventDto.recurrenceRule,
        timeZone: createEventDto.timeZone,
        ulid: 'test-ulid',
        slug: 'recurring-test-event',
      });

      const occurrences = [
        { id: 2, parentEventId: 1 },
        { id: 3, parentEventId: 1 },
        { id: 4, parentEventId: 1 },
      ];

      // Mocks
      eventRepository.create.mockReturnValue(createdEvent);
      eventRepository.save.mockResolvedValue(createdEvent);
      mockOccurrenceService.generateOccurrences.mockResolvedValue(
        occurrences as unknown as EventEntity[],
      );

      // Call service
      const result = await managementService.create(createEventDto, 1);

      // Assertions
      expect(result).toEqual(createdEvent);
      expect(eventRepository.create).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(mockOccurrenceService.generateOccurrences).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.created',
        expect.anything(),
      );
    });
  });

  describe('update', () => {
    it('should update a recurring event and regenerate occurrences if recurrence pattern changed', async () => {
      // Mock data
      const existingEvent = new EventEntity();
      Object.assign(existingEvent, {
        id: 1,
        name: 'Existing Recurring Event',
        slug: 'existing-recurring-event',
        isRecurring: true,
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
          count: 4,
        },
        timeZone: 'UTC',
      });

      const updateEventDto: UpdateEventDto = {
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 2, // Changed from weekly to bi-weekly
          count: 4,
        },
      };

      const updatedEvent = new EventEntity();
      Object.assign(updatedEvent, existingEvent, {
        recurrenceRule: updateEventDto.recurrenceRule,
      });

      // Mocks
      eventRepository.findOneOrFail.mockResolvedValue(existingEvent);
      eventRepository.merge.mockReturnValue(updatedEvent);
      eventRepository.save.mockResolvedValue(updatedEvent);
      mockOccurrenceService.deleteAllOccurrences.mockResolvedValue(3);
      mockOccurrenceService.generateOccurrences.mockResolvedValue(
        [] as EventEntity[],
      );

      // Call service
      const result = await managementService.update(
        'existing-recurring-event',
        updateEventDto,
        1,
      );

      // Assertions
      expect(result).toEqual(updatedEvent);
      expect(eventRepository.findOneOrFail).toHaveBeenCalled();
      expect(eventRepository.merge).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(mockOccurrenceService.deleteAllOccurrences).toHaveBeenCalledWith(
        1,
      );
      expect(mockOccurrenceService.generateOccurrences).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a recurring event and all its occurrences', async () => {
      // Mock data
      const recurringEvent = new EventEntity();
      Object.assign(recurringEvent, {
        id: 1,
        name: 'Recurring Event to Delete',
        slug: 'event-to-delete',
        isRecurring: true,
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
        },
      });

      // Mocks
      eventRepository.findOne.mockResolvedValue(recurringEvent);
      eventRepository.remove.mockResolvedValue(recurringEvent);
      mockOccurrenceService.deleteAllOccurrences.mockResolvedValue(5);

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

  describe('createExceptionOccurrence', () => {
    it('should create an exception occurrence for a specific date', async () => {
      // Mock data
      const parentEvent = new EventEntity();
      Object.assign(parentEvent, {
        id: 1,
        name: 'Recurring Parent Event',
        slug: 'recurring-parent-event',
        isRecurring: true,
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
        },
        startDate: new Date('2025-01-01T10:00:00Z'),
      });

      const occurrenceDate = new Date('2025-01-15T10:00:00Z');

      const updateDto: UpdateEventDto = {
        name: 'Modified Occurrence',
        description: 'This occurrence has been modified',
      };

      const exceptionEvent = new EventEntity();
      Object.assign(exceptionEvent, {
        id: 3,
        parentEventId: 1,
        name: 'Modified Occurrence',
        description: 'This occurrence has been modified',
        isRecurrenceException: true,
        originalDate: occurrenceDate,
      });

      // Mocks
      eventRepository.findOne.mockResolvedValue(parentEvent);
      mockOccurrenceService.createExceptionOccurrence.mockResolvedValue(
        exceptionEvent,
      );

      // Call service
      const result = await managementService.createExceptionOccurrence(
        'recurring-parent-event',
        occurrenceDate,
        updateDto,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'recurring-parent-event', isRecurring: true },
      });
      expect(
        mockOccurrenceService.createExceptionOccurrence,
      ).toHaveBeenCalledWith(1, occurrenceDate, expect.anything());
      expect(result).toEqual(exceptionEvent);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.occurrence.modified',
        expect.anything(),
      );
    });
  });

  describe('excludeOccurrence', () => {
    it('should exclude a specific occurrence from a recurring event', async () => {
      // Mock data
      const parentEvent = new EventEntity();
      Object.assign(parentEvent, {
        id: 1,
        name: 'Recurring Parent Event',
        slug: 'recurring-parent-event',
        isRecurring: true,
      });

      const occurrenceDate = new Date('2025-01-15T10:00:00Z');

      // Mocks
      eventRepository.findOne.mockResolvedValue(parentEvent);
      mockOccurrenceService.excludeOccurrence.mockResolvedValue(true);

      // Call service
      const result = await managementService.excludeOccurrence(
        'recurring-parent-event',
        occurrenceDate,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'recurring-parent-event', isRecurring: true },
      });
      expect(mockOccurrenceService.excludeOccurrence).toHaveBeenCalledWith(
        1,
        occurrenceDate,
      );
      expect(result).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.occurrence.excluded',
        expect.anything(),
      );
    });
  });

  describe('getOccurrencesInRange', () => {
    it('should get occurrences of a recurring event within a date range', async () => {
      // Mock data
      const parentEvent = new EventEntity();
      Object.assign(parentEvent, {
        id: 1,
        name: 'Recurring Parent Event',
        slug: 'recurring-parent-event',
        isRecurring: true,
      });

      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2025-01-31T23:59:59Z');

      const occurrences = [
        {
          id: 2,
          parentEventId: 1,
          startDate: new Date('2025-01-01T10:00:00Z'),
        },
        {
          id: 3,
          parentEventId: 1,
          startDate: new Date('2025-01-08T10:00:00Z'),
        },
        {
          id: 4,
          parentEventId: 1,
          startDate: new Date('2025-01-15T10:00:00Z'),
        },
        {
          id: 5,
          parentEventId: 1,
          startDate: new Date('2025-01-22T10:00:00Z'),
        },
        {
          id: 6,
          parentEventId: 1,
          startDate: new Date('2025-01-29T10:00:00Z'),
        },
      ];

      // Mocks
      eventRepository.findOne.mockResolvedValue(parentEvent);
      mockOccurrenceService.getOccurrencesInRange.mockResolvedValue(
        occurrences as unknown as EventEntity[],
      );

      // Call service
      const result = await managementService.getOccurrencesInRange(
        'recurring-parent-event',
        startDate,
        endDate,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'recurring-parent-event', isRecurring: true },
      });
      expect(mockOccurrenceService.getOccurrencesInRange).toHaveBeenCalledWith(
        1,
        startDate,
        endDate,
        true,
      );
      expect(result).toEqual(occurrences);
      expect(result.length).toBe(5);
    });
  });
});
