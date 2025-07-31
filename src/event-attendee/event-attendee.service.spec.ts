import { Test, TestingModule } from '@nestjs/testing';
import { EventAttendeeService } from './event-attendee.service';
import { EventAttendeeQueryService } from './event-attendee-query.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { EventRoleService } from '../event-role/event-role.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserService } from '../user/user.service';
import { stopCleanupInterval } from '../database/data-source';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../core/constants/constant';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventRoleEntity } from '../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { NotFoundException } from '@nestjs/common';
import { EventSourceType } from '../core/constants/source-type.constant';

describe('EventAttendeeService', () => {
  let service: EventAttendeeService;
  let module: TestingModule;
  let mockUserService: jest.Mocked<UserService>;
  let mockBlueskyRsvpService: jest.Mocked<BlueskyRsvpService>;

  // Mock query builders for various methods
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
    cache: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
  };

  // Mock repository with all needed methods
  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findOneOrFail: jest.fn(),
  };

  // Sample data for tests
  const mockEvent: Partial<EventEntity> = {
    id: 1,
    slug: 'test-event',
    name: 'Test Event',
    startDate: new Date('2024-12-31T00:00:00Z'),
    endDate: new Date('2024-12-31T23:59:59Z'),
    sourceData: { rkey: 'test-rkey' },
  };

  const mockUser: Partial<UserEntity> = {
    id: 1,
    slug: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    provider: 'bluesky',
    socialId: 'did:plc:test123',
  };

  const mockConfirmedAttendee: Partial<EventAttendeesEntity> = {
    id: 1,
    user: mockUser as UserEntity,
    event: mockEvent as EventEntity,
    status: EventAttendeeStatus.Confirmed,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EventAttendeeService,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: () => mockRepository,
            }),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest.fn(),
          },
        },
        {
          provide: BlueskyRsvpService,
          useFactory: () => ({
            createRsvp: jest.fn(),
            deleteRsvp: jest.fn(),
          }),
        },
        {
          provide: UserService,
          useFactory: () => ({
            findById: jest.fn(),
            findBySlug: jest.fn(),
          }),
        },
        {
          provide: EventAttendeeQueryService,
          useValue: {
            showConfirmedEventAttendeesByEventId: jest.fn(),
            findEventAttendeeByUserId: jest.fn(),
            findEventAttendeeByUserSlug: jest.fn(),
            findEventAttendees: jest.fn(),
            showEventAttendeesCount: jest.fn(),
            showConfirmedEventAttendeesCount: jest.fn(),
            findBySourceId: jest.fn(),
            findByUserSlug: jest.fn(),
            findOne: jest.fn(),
            isUserAllowedToChat: jest.fn(),
          },
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<EventAttendeeService>(EventAttendeeService);

    // Set up the mocked services
    mockUserService = module.get(UserService) as jest.Mocked<UserService>;
    mockBlueskyRsvpService = module.get(
      BlueskyRsvpService,
    ) as jest.Mocked<BlueskyRsvpService>;

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('findEventAttendeeByUserSlug', () => {
    it('should find an attendee by user and event slugs', async () => {
      // Setup mock data
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockConfirmedAttendee);

      // Call the function
      const result = await service.findEventAttendeeByUserSlug(
        'test-event',
        'test-user',
      );

      // Verify the query was constructed correctly
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.slug = :eventSlug',
        { eventSlug: 'test-event' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.slug = :userSlug',
        { userSlug: 'test-user' },
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result).toEqual(mockConfirmedAttendee);
    });

    it('should return null when attendee not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      const result = await service.findEventAttendeeByUserSlug(
        'test-event',
        'nonexistent-user',
      );

      expect(result).toBeNull();
    });
  });

  describe('findEventAttendeeByUserId', () => {
    it('should find an attendee by user and event IDs', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockConfirmedAttendee);

      const result = await service.findEventAttendeeByUserId(1, 1);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'attendee.event.id = :eventId',
        { eventId: 1 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'attendee.user.id = :userId',
        { userId: 1 },
      );

      expect(result).toBeDefined();
      expect(result).toEqual(mockConfirmedAttendee);
    });
  });

  describe('cancelEventAttendanceBySlug', () => {
    it('should cancel an active attendance by slugs', async () => {
      // Setup mock for finding the active attendance
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(mockConfirmedAttendee) // First call for active attendance
        .mockResolvedValueOnce(null); // Not used in this case

      // Setup mock for saving the updated attendance
      const cancelledAttendee = {
        ...mockConfirmedAttendee,
        status: EventAttendeeStatus.Cancelled,
      };
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // Create mock for checking Bluesky event source condition to be true
      // This ensures the Bluesky integration code runs
      mockEvent.sourceType = EventSourceType.BLUESKY;
      mockEvent.sourceData = { rkey: 'test-rkey' };

      // Mock UserService.findBySlug to return the user
      mockUserService.findBySlug.mockResolvedValueOnce(mockUser as UserEntity);

      // Mock BlueskyRsvpService.createRsvp to return success
      mockBlueskyRsvpService.createRsvp.mockResolvedValueOnce({
        success: true,
        rsvpUri: 'at://did:plc:test123/app.bsky.feed.post/test-rsvp',
      });

      // Mock repository.findOne for getting the attendee after Bluesky sync
      mockRepository.findOne.mockResolvedValueOnce(cancelledAttendee);

      // Mock the second save after Bluesky update
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // Call the function
      const result = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );

      // Verify the query was constructed correctly for finding active attendee
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.slug = :eventSlug',
        { eventSlug: 'test-event' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.slug = :userSlug',
        { userSlug: 'test-user' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'attendee.status IN (:...statuses)',
        {
          statuses: [
            EventAttendeeStatus.Confirmed,
            EventAttendeeStatus.Pending,
            EventAttendeeStatus.Waitlist,
          ],
        },
      );

      // Verify the attendance was updated
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Cancelled,
        }),
      );

      // Verify Bluesky integration was called
      expect(mockUserService.findBySlug).toHaveBeenCalledWith(
        'test-user',
        'test-tenant',
      );
      expect(mockBlueskyRsvpService.createRsvp).toHaveBeenCalledWith(
        expect.anything(),
        'notgoing',
        'did:plc:test123',
        'test-tenant',
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.status).toBe(EventAttendeeStatus.Cancelled);
    });

    it('should handle already cancelled attendance', async () => {
      // IMPORTANT: Reset all mocks
      jest.clearAllMocks();

      // Create a copy of the cancelled attendee with all required properties
      const cancelledAttendee = {
        id: 2,
        user: mockUser as UserEntity,
        event: mockEvent as EventEntity,
        status: EventAttendeeStatus.Cancelled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Explicitly set up mockQueryBuilder.getOne to handle both calls
      mockQueryBuilder.getOne = jest
        .fn()
        .mockImplementationOnce(() => {
          // First call - no active attendance
          return Promise.resolve(null);
        })
        .mockImplementationOnce(() => {
          // Second call - return cancelled attendance
          return Promise.resolve(cancelledAttendee);
        });

      // Explicitly mock the repository.save method to ensure it's not called
      mockRepository.save = jest.fn();

      // Call the function
      const result = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.status).toBe(EventAttendeeStatus.Cancelled);

      // Verify we didn't try to update the status
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when attendance record not found', async () => {
      // IMPORTANT: Clear all previous mock implementations and reset mock repository
      jest.clearAllMocks();

      // CRITICAL: Override the create method to prevent other tests from affecting this one
      mockRepository.create = jest.fn().mockReturnValue(null);
      mockRepository.save = jest.fn().mockReturnValue(null);
      mockRepository.findOne = jest.fn().mockReturnValue(null);

      // Setup mocks to return null for both queries - be VERY explicit
      mockQueryBuilder.getOne = jest
        .fn()
        .mockResolvedValueOnce(null) // First call for active attendance
        .mockResolvedValueOnce(null); // Second call for any attendance

      // Call the function and expect it to throw
      await expect(
        service.cancelEventAttendanceBySlug('test-event', 'nonexistent-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivateEventAttendanceBySlug', () => {
    it('should reactivate a cancelled attendance by slugs', async () => {
      // IMPORTANT: Clear all previous mock implementations
      jest.clearAllMocks();

      // Create a properly structured mockCancelledAttendee with all required properties
      const cancelledAttendee = {
        id: 2,
        user: mockUser as UserEntity,
        event: mockEvent as EventEntity,
        status: EventAttendeeStatus.Cancelled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Setup mock for finding the attendance - MUST return a valid attendee
      mockQueryBuilder.getOne = jest
        .fn()
        .mockResolvedValueOnce(cancelledAttendee);

      // Setup mock for saving the updated attendance
      const reactivatedAttendee = {
        ...cancelledAttendee,
        status: EventAttendeeStatus.Confirmed,
      };
      mockRepository.save = jest
        .fn()
        .mockResolvedValueOnce(reactivatedAttendee);

      // Call the function
      const result = await service.reactivateEventAttendanceBySlug(
        'test-event',
        'test-user',
        EventAttendeeStatus.Confirmed,
      );

      // Verify the query was constructed correctly
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.slug = :eventSlug',
        { eventSlug: 'test-event' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.slug = :userSlug',
        { userSlug: 'test-user' },
      );

      // Verify the attendance was updated
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Confirmed,
        }),
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.status).toBe(EventAttendeeStatus.Confirmed);
    });

    it('should throw NotFoundException when attendance record not found', async () => {
      // Setup mock to return null
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Call the function and expect it to throw
      await expect(
        service.reactivateEventAttendanceBySlug(
          'test-event',
          'nonexistent-user',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findEventAttendeesByUserSlugBatch', () => {
    it('should find multiple attendees by user slug and event slugs', async () => {
      // Setup mock data
      const mockEventSlugs = ['event-1', 'event-2', 'event-3'];
      const mockUserSlug = 'test-user';

      const mockAttendees = [
        {
          ...mockConfirmedAttendee,
          event: { ...mockEvent, slug: 'event-1' },
        },
        {
          ...mockConfirmedAttendee,
          id: 3,
          event: { ...mockEvent, id: 2, slug: 'event-2' },
        },
      ];

      // Mock the query result
      mockQueryBuilder.getMany.mockResolvedValueOnce(mockAttendees);

      // Call the function
      const result = await service.findEventAttendeesByUserSlugBatch(
        mockEventSlugs,
        mockUserSlug,
      );

      // Verify the query was constructed correctly
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.slug IN (:...eventSlugs)',
        { eventSlugs: mockEventSlugs },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.slug = :userSlug',
        { userSlug: mockUserSlug },
      );

      // Verify the result is a Map with expected entries
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(mockEventSlugs.length);
      expect(result.get('event-1')).toBeDefined();
      expect(result.get('event-2')).toBeDefined();
      expect(result.get('event-3')).toBeNull(); // No attendance for event-3
    });

    it('should return empty Map when eventSlugs is empty', async () => {
      const result = await service.findEventAttendeesByUserSlugBatch(
        [],
        'test-user',
      );

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new attendance record', async () => {
      // Mock data for create method
      // Create a proper EventRoleEntity
      const roleEntity = new EventRoleEntity();
      roleEntity.id = 1;
      roleEntity.name = EventAttendeeRole.Participant;

      const createDto = {
        event: mockEvent as EventEntity,
        user: mockUser as UserEntity,
        status: EventAttendeeStatus.Confirmed,
        role: roleEntity,
      };

      // Mock repository.create and repository.save
      mockRepository.create.mockReturnValueOnce({ ...createDto });
      mockRepository.save.mockResolvedValueOnce({
        id: 1,
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock UserService.findBySlug for Bluesky integration
      mockUserService.findBySlug.mockResolvedValueOnce(mockUser as UserEntity);

      // Mock BlueskyRsvpService.createRsvp
      mockBlueskyRsvpService.createRsvp.mockResolvedValueOnce({
        success: true,
        rsvpUri: 'at://did:plc:test123/app.bsky.feed.post/test-rsvp',
      });

      // Mock repository.findOne for Bluesky update
      mockRepository.findOne.mockResolvedValueOnce({
        id: 1,
        ...createDto,
      });

      // Call the function
      const result = await service.create(createDto);

      // Verify repository methods were called
      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockRepository.save).toHaveBeenCalled();

      // Verify Bluesky integration
      expect(mockUserService.findBySlug).toHaveBeenCalled();
      expect(mockBlueskyRsvpService.createRsvp).toHaveBeenCalled();
      expect(mockRepository.findOne).toHaveBeenCalled(); // ID might vary in tests
      expect(mockRepository.save).toHaveBeenCalledTimes(2); // Initial save + Bluesky update

      // Verify result
      // console.log('result', result);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe(EventAttendeeStatus.Confirmed);
    });

    it('should handle duplicate key errors when creating attendance', async () => {
      // Mock data for create method
      // Create a proper EventRoleEntity
      const roleEntity = new EventRoleEntity();
      roleEntity.id = 1;
      roleEntity.name = EventAttendeeRole.Participant;

      const createDto = {
        event: mockEvent as EventEntity,
        user: mockUser as UserEntity,
        status: EventAttendeeStatus.Confirmed,
        role: roleEntity,
      };

      // Mock repository.create
      mockRepository.create.mockReturnValueOnce({ ...createDto });

      // Mock repository.save to throw duplicate key error
      mockRepository.save.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      // Call the function and expect it to throw
      await expect(service.create(createDto)).rejects.toThrow(
        'EventAttendeeService: Failed to save attendee: duplicate key value violates unique constraint',
      );
    });
  });

  describe('showEventAttendee', () => {
    it('should find an attendee by ID', async () => {
      const mockAttendee = {
        id: 1,
        user: { id: 1, name: 'Test User', slug: 'test-user' },
      };

      mockQueryBuilder.getOne.mockResolvedValueOnce(mockAttendee);
      const result = await service.showEventAttendee(1);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'eventAttendee.id = :attendeeId',
        { attendeeId: 1 },
      );

      expect(result).toBeDefined();
      expect(result?.user).toBeDefined();
    });

    it('should return null when attendee not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      const result = await service.showEventAttendee(999);
      expect(result).toBeNull();
    });
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopCleanupInterval();
  });
});
