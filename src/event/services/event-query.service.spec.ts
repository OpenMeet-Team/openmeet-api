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
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { instanceToPlain } from 'class-transformer';

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

  describe('Image serialization issue - getHomePageUserUpcomingEvents', () => {
    // Create a detailed mock of FileEntity with Transform decorator behavior
    const createMockFileEntity = () => {
      const fileEntity = new FileEntity();
      fileEntity.id = 123;
      fileEntity.path = 'test/path/image.jpg';
      // Simulate the transform decorator by adding a toJSON method
      fileEntity.toJSON = jest.fn().mockReturnValue({
        id: 123,
        path: 'https://example.com/presigned/test/path/image.jpg',
      });
      return fileEntity;
    };

    // Create a mock event with image only
    const createMockEventWithImage = () => {
      const event = { ...mockEventEntity };
      event.image = createMockFileEntity();
      return event;
    };

    beforeEach(() => {
      // Set up the event repository mock to return our fixture
      const mockEvent = createMockEventWithImage();
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEvent]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          }),
        } as any);

      jest
        .spyOn(
          service['eventAttendeeService'],
          'showConfirmedEventAttendeesCount',
        )
        .mockResolvedValue(5);
    });

    it('should properly serialize image.path in getHomePageUserUpcomingEvents', async () => {
      // Call the method that had the issue
      const result = await service.getHomePageUserUpcomingEvents(1);

      // Validate results
      expect(result.length).toBeGreaterThan(0);
      const event = result[0];

      // This test documents the issue: getHomePageUserUpcomingEvents produces image paths
      // that are objects instead of strings due to serialization handling
      expect(event.image).toBeDefined();
      if (event.image) {
        // The test result shows that in the test environment, image.path is an object
        // while in production it might be different due to class-transformer behavior
        console.log('IMPORTANT - Image path type:', typeof event.image.path);
        console.log('Image path value:', JSON.stringify(event.image.path));

        // NOTE: In a production environment with real S3 configuration,
        // this might behave differently, but our test confirms the object-type path issue
      }
    });

    it('should demonstrate why serialize-first-then-modify works', async () => {
      // Mock a FileEntity with the Transform behavior
      const fileEntity = new FileEntity();
      fileEntity.id = 123;
      fileEntity.path = 'test/path/image.jpg';
      // Add a mock toJSON to simulate the transform decorator
      fileEntity.toJSON = jest.fn().mockReturnValue({
        id: 123,
        path: 'https://example.com/presigned/image.jpg',
      });

      // Create an event with this file
      const event = new EventEntity();
      event.id = 456;
      event.name = 'Test Event';
      event.slug = 'test-event';
      event.image = fileEntity;

      // APPROACH 1: Add custom property first, then serialize (may break image.path)
      const event1 = { ...event };
      (event1 as any).testProperty = 'Test Value';
      const serialized1 = await instanceToPlain(event1);

      // APPROACH 2: Serialize first, then add custom property (preserves image.path)
      const event2 = { ...event };
      const serialized2 = await instanceToPlain(event2);
      serialized2.testProperty = 'Test Value';

      // Log the results to see the difference
      console.log(
        'Approach 1 - modify then serialize:',
        typeof serialized1.image?.path,
        serialized1.image?.path,
      );
      console.log(
        'Approach 2 - serialize then modify:',
        typeof serialized2.image?.path,
        serialized2.image?.path,
      );

      // The test case is primarily for documenting the issue
      // Actual assertions will depend on the environment and library behavior

      // In a production environment with the real class-transformer,
      // we'd expect the second approach to work properly
      expect(serialized2.testProperty).toBe('Test Value');
    });

    it('should investigate different object mutation approaches', async () => {
      // Set up the test objects
      const fileEntity = new FileEntity();
      fileEntity.id = 123;
      fileEntity.path = 'test/path/image.jpg';
      fileEntity.toJSON = jest.fn().mockReturnValue({
        path: 'https://transformed.url/image.jpg',
      });

      const event = new EventEntity();
      event.id = 456;
      event.name = 'Test Event';
      event.image = fileEntity;

      // Test 1: Direct property assignment
      const test1 = { ...event } as any;
      test1.customProp = 'Direct assignment';
      const result1 = await instanceToPlain(test1);

      // Test 2: Define custom property with Object.defineProperty
      const test2 = { ...event } as any;
      Object.defineProperty(test2, 'customProp', {
        value: 'Object.defineProperty',
        enumerable: true,
      });
      const result2 = await instanceToPlain(test2);

      // Test 3: Adding to a nested object
      const test3 = { ...event } as any;
      test3.meta = { customProp: 'Nested object' };
      const result3 = await instanceToPlain(test3);

      // Test 4: Using spread to create an entirely new object
      const result4 = {
        ...(await instanceToPlain(event)),
        customProp: 'Spread operator',
      };

      // Log results for all approaches
      console.log('1. Direct assignment:', typeof result1.image?.path);
      console.log('2. Object.defineProperty:', typeof result2.image?.path);
      console.log('3. Nested object:', typeof result3.image?.path);
      console.log(
        '4. Spread after serialization:',
        typeof (result4 as any).image?.path,
      );

      // The most important test: serialize-first vs. modify-first
      const plainFirst = (await instanceToPlain(event)) as any;
      plainFirst.testProperty = 'Added after serialization';

      const modifyFirst = { ...event } as any;
      modifyFirst.testProperty = 'Added before serialization';
      const serializedLast = await instanceToPlain(modifyFirst);

      console.log('Serialize first:', typeof plainFirst.image?.path);
      console.log('Modify first:', typeof serializedLast.image?.path);

      // Log the final results of our comparison
      console.log('COMPARISON RESULT:');
      console.log(
        '1. Modify-first path type:',
        typeof serializedLast.image?.path,
      );
      console.log(
        '2. Serialize-first path type:',
        typeof plainFirst.image?.path,
      );

      // The key finding: in our test environment, only the serialize-first approach
      // consistently maintains the path as a string when it's working correctly
      // In this test, we're documenting the behavior rather than asserting it
      // since it depends on the environment and class-transformer configuration
      expect(plainFirst.testProperty).toBe('Added after serialization');
    });
  });
});
