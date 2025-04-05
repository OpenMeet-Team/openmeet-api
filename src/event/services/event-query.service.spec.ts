import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import {
  EventStatus,
  EventVisibility,
  EventType,
} from '../../core/constants/constant';
import { mockUser } from '../../../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupMemberService } from '../../group-member/group-member.service';
import { mockRepository } from '../../test/mocks';

// Define a mock event entity for consistent use
const mockEventEntity: EventEntity = {
  id: 1,
  ulid: '01HABCDEFGHJKMNPQRSTVWXYZ',
  slug: 'test-event-slug',
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  status: EventStatus.Published,
  visibility: EventVisibility.Public,
  type: EventType.InPerson,
  location: 'Test Location',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 1 } as UserEntity,
  // Add other required fields or relations as needed by tests
} as EventEntity; // Cast for simplicity

describe('EventQueryService', () => {
  let service: EventQueryService;
  let eventRepository: jest.Mocked<Repository<EventEntity>>; // Use mocked type
  let mockGroupMemberService: jest.Mocked<GroupMemberService>; // Add declaration for the mock service

  beforeEach(async () => {
    // Define the mock repository behavior here
    eventRepository = {
      find: jest.fn(),
      findOne: jest.fn(), // Ensure findOne is mocked
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getOne: jest.fn(), // Add getOne if needed by service
        getCount: jest.fn(), // Add getCount if needed
      }),
      // Add other methods if needed
    } as unknown as jest.Mocked<Repository<EventEntity>>; // Use unknown cast for simplicity

    // Define mock GroupMemberService behavior
    mockGroupMemberService = {
      // Add necessary mocked methods used by EventQueryService
      findGroupDetailsMembers: jest.fn().mockResolvedValue([]), // Example mock method
      // ... other methods if needed
    } as unknown as jest.Mocked<GroupMemberService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventQueryService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          // Use a factory or value that returns the mocked repository instance
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue(eventRepository), // Ensure this returns our mock
            }),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            // Add mock methods used by EventQueryService
            showConfirmedEventAttendeesCount: jest.fn().mockResolvedValue(5),
            findEventAttendeeByUserId: jest.fn(),
            showEventAttendees: jest
              .fn()
              .mockResolvedValue({ data: [], meta: { total: 0 } }), // Add missing method
          },
        },
        {
          provide: GroupMemberService, // Re-add the provider
          useValue: mockGroupMemberService, // Use the defined mock
        },
        // Remove providers for unused services (Matrix, GroupMember, Recurrence)
        {
          provide: getRepositoryToken(EventEntity), // Keep this token provider
          useValue: eventRepository, // Ensure it uses the same mock instance
        },
        // Optionally remove EventAttendeesEntity repo if not directly used by QueryService
        // {
        //   provide: getRepositoryToken(EventAttendeesEntity),
        //   useValue: { /* mock attendee repo methods if needed */ },
        // },
      ],
    }).compile();

    service = await module.resolve<EventQueryService>(EventQueryService);
    // No need to get repository separately here if the service initializes it correctly via TenantConnectionService
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

  describe('findEventsForGroup', () => {
    it('should return events for a group', async () => {
      // Mock the database operations through the tenant connection
      const mockRepositoryFind = jest.fn().mockResolvedValue([mockEventEntity]);
      const mockGetRepository = jest.fn().mockReturnValue({
        find: mockRepositoryFind,
      });

      // Mock the attendee count service call which is used to enrich event data
      const mockAttendeeCount = jest.fn().mockResolvedValue(5);
      jest
        .spyOn(
          service['eventAttendeeService'],
          'showConfirmedEventAttendeesCount',
        )
        .mockImplementation(mockAttendeeCount);

      // Provide a mock for the tenant connection
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: mockGetRepository,
        } as any);

      // Call the method under test
      await service.findEventsForGroup(1, 3);

      // Verify tenant connection was used correctly
      expect(
        service['tenantConnectionService'].getTenantConnection,
      ).toHaveBeenCalled();

      // Verify repository was queried correctly
      expect(mockGetRepository).toHaveBeenCalledWith(EventEntity);
      expect(mockRepositoryFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            group: { id: 1 },
            status: EventStatus.Published,
          }),
          take: 3,
        }),
      );

      // Verify attendee service was called to enrich the returned events
      expect(
        service['eventAttendeeService'].showConfirmedEventAttendeesCount,
      ).toHaveBeenCalledWith(mockEventEntity.id);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(mockEventEntity),
          }),
        } as any);
      const result = await service.editEvent(mockEventEntity.slug);
      expect(result).toEqual(mockEventEntity);
    });
  });

  describe('showEvent', () => {
    it('should return event with details', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(mockEventEntity),
          }),
        } as any);
      const result = await service.showEvent(mockEventEntity.slug);
      expect(result).toEqual(mockEventEntity);
    });
  });

  describe('getHomePageFeaturedEvents', () => {
    it('should return featured events', async () => {
      // Mock the event attendee service
      jest
        .spyOn(
          service['eventAttendeeService'],
          'showConfirmedEventAttendeesCount',
        )
        .mockResolvedValue(5);

      // No need to mock recurrence service anymore as we now generate the description directly

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEventEntity]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          }),
        } as any);

      // Mock the attendee count service call which is used to enrich event data
      jest
        .spyOn(
          service['eventAttendeeService'],
          'showConfirmedEventAttendeesCount',
        )
        .mockResolvedValue(5);

      const result = await service.getHomePageFeaturedEvents();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findEventBySlug', () => {
    it('should return an event by slug', async () => {
      // Arrange: Set up the mock response for findOne
      eventRepository.findOne.mockResolvedValue(mockEventEntity);

      // Act: Call the method under test
      const result = await service.findEventBySlug(mockEventEntity.slug);

      // Assert: Check that findOne was called correctly and the result is as expected
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: mockEventEntity.slug },
        relations: expect.arrayContaining([
          'user',
          'group',
          'categories',
          'image',
        ]), // Adjust relations as needed
      });
      expect(result).toEqual(mockEventEntity);
    });

    it('should return null if event not found', async () => {
      // Arrange: Set up the mock response for findOne to return null
      eventRepository.findOne.mockResolvedValue(null);
      const slug = 'non-existent-slug';

      // Act: Call the method under test
      const result = await service.findEventBySlug(slug);

      // Assert: Check that findOne was called and the result is null
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { slug: slug },
        relations: expect.arrayContaining([
          'user',
          'group',
          'categories',
          'image',
        ]),
      });
      expect(result).toBeNull();
    });
  });
});
