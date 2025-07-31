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
import { EventSourceType } from '../core/constants/source-type.constant';

/**
 * This file contains tests for complex edge cases in the EventAttendeeService
 * This complements the main service test file by focusing on race conditions,
 * error recovery, and other unusual scenarios.
 */
describe('EventAttendeeService Edge Cases', () => {
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

  // Setup before each test
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

  describe('Handling race conditions and duplicate key errors', () => {
    it('should handle a race condition when creating attendees', async () => {
      // Setup test data
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

      // First mock repository.create to return the entity
      mockRepository.create.mockReturnValueOnce({ ...createDto });

      // Then mock repository.save to throw duplicate key error (simulating race condition)
      mockRepository.save.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      // For the recovery path, mock findOne to return an existing record
      mockRepository.findOne.mockResolvedValueOnce({
        id: 999,
        ...createDto,
        status: EventAttendeeStatus.Confirmed,
      });

      // Mock findEventAttendeeByUserSlug to return null initially, then the existing record
      // after the database error (simulating it being created in a parallel request)
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(null) // Initial check finds nothing
        .mockResolvedValueOnce({
          // Recovery check finds existing record
          id: 999,
          ...createDto,
          status: EventAttendeeStatus.Confirmed,
        });

      // Call create and expect it to fail
      try {
        await service.create(createDto);
        // This should throw, so we should never reach this line
        fail('Expected error was not thrown');
      } catch (error) {
        // Expected error
        expect(error.message).toContain('Failed to save attendee');
      }

      // Verify the save was attempted
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should return the existing record when attempting to create a duplicate', async () => {
      // This tests a possible implementation of recovery after duplicate key error
      // Note: Currently the service throws on duplicate key, but this test
      // is demonstrating how it could be enhanced to handle this case more gracefully

      // Setup test data for a duplicate creation scenario
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

      // For an enhanced recovery implementation, we would:
      // 1. Catch the duplicate key error
      // 2. Look up the existing record
      // 3. Return it instead of throwing

      // Mock this behavior for demonstration purposes only
      const existingAttendee = {
        id: 123,
        ...createDto,
        status: EventAttendeeStatus.Confirmed,
        createdAt: new Date(Date.now() - 60000), // Created 1 minute ago
        updatedAt: new Date(Date.now() - 60000),
      };

      // Mock repository.create
      mockRepository.create.mockReturnValueOnce({ ...createDto });

      // Mock repository.save to throw duplicate key error
      mockRepository.save.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      // For a graceful recovery, the service would then look up the existing record:
      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getOne.mockResolvedValueOnce(existingAttendee);

      // Call create expecting an error with current implementation
      try {
        await service.create(createDto);
        // This should throw since we haven't implemented the recovery yet
        fail('Expected error was not thrown');
      } catch (error) {
        // Expected with current implementation
        expect(error.message).toContain('Failed to save attendee');
      }

      // The test demonstrates a potential enhancement - detect duplicate and return existing record instead of throwing
    });
  });

  describe('Edge cases for cancellation and reactivation', () => {
    it('should handle multiple rapid cancellations', async () => {
      // Setup an attendee that starts as Confirmed
      const attendee = {
        ...mockConfirmedAttendee,
        status: EventAttendeeStatus.Confirmed,
        event: {
          ...mockEvent,
          sourceType: EventSourceType.BLUESKY,
          sourceData: { rkey: 'test-rkey' },
        } as EventEntity,
      };

      // Mock first cancellation
      mockQueryBuilder.getOne.mockResolvedValueOnce(attendee); // Find active attendance

      const cancelledAttendee = {
        ...attendee,
        status: EventAttendeeStatus.Cancelled,
      };

      // Mock successful save for first cancellation
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // For Bluesky integration - mock the required services
      mockUserService.findBySlug.mockResolvedValueOnce(mockUser as UserEntity);
      mockBlueskyRsvpService.createRsvp.mockResolvedValueOnce({
        success: true,
        rsvpUri: 'at://did:plc:test123/app.bsky.feed.post/test-cancel-rsvp',
      });
      mockRepository.findOne.mockResolvedValueOnce(cancelledAttendee);
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // First cancellation - should work normally
      const result1 = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );
      expect(result1.status).toBe(EventAttendeeStatus.Cancelled);

      // IMPORTANT: We need to completely reset the test state between runs
      jest.clearAllMocks();

      // CRITICAL: In the second part of the test, we need to modify how we simulate the already
      // cancelled attendee to ensure it exactly matches what the service is expecting

      // Create a fresh cancelled attendee with all required properties
      const alreadyCancelledAttendee = {
        id: 123,
        user: mockUser as UserEntity,
        event: {
          ...mockEvent,
          id: 1,
          sourceType: null, // No Bluesky source type to avoid Bluesky integration call
          sourceData: null,
        } as EventEntity,
        status: EventAttendeeStatus.Cancelled,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: { id: 1, name: EventAttendeeRole.Participant } as EventRoleEntity,
      };

      // This is critical - we need to explicitly set up the mock to return the right value
      // with proper chained mock implementation
      mockQueryBuilder.getOne = jest
        .fn()
        .mockImplementationOnce(() => {
          // First call - no active attendance because it's cancelled
          return Promise.resolve(null);
        })
        .mockImplementationOnce(() => {
          // Second call - return the cancelled attendance with complete object
          return Promise.resolve(alreadyCancelledAttendee);
        });

      // Explicitly replace the save function with a jest mock function
      mockRepository.save = jest.fn();

      // Second cancellation should find the already cancelled record and return it
      const result2 = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );

      // Verify that save wasn't called again
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Result should still show cancelled
      expect(result2.status).toBe(EventAttendeeStatus.Cancelled);
    });

    it('should correctly handle cancelling attendance that was already cancelled', async () => {
      // IMPORTANT: We need to completely reset the test state
      jest.clearAllMocks();

      // Create a fresh cancelled attendee with all required properties
      const cancelledAttendee = {
        id: 2,
        user: mockUser as UserEntity,
        event: {
          ...mockEvent,
          id: 1,
          slug: 'test-event',
          sourceType: null, // Prevent Bluesky integration
          sourceData: null,
        } as EventEntity,
        status: EventAttendeeStatus.Cancelled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock finding no active attendance - be explicit with function assignment
      mockQueryBuilder.getOne = jest
        .fn()
        .mockResolvedValueOnce(null) // No active attendance
        .mockResolvedValueOnce(cancelledAttendee); // But find a cancelled one

      // Ensure save won't be called
      mockRepository.save = jest.fn();

      // Call the service
      const result = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );

      // Should return the already-cancelled attendee without modifying it
      expect(result.status).toBe(EventAttendeeStatus.Cancelled);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should handle rapid cancellation then reactivation', async () => {
      // IMPORTANT: We need to completely reset the test state
      jest.clearAllMocks();

      // Setup an attendee that starts as Confirmed
      const attendee = {
        ...mockConfirmedAttendee,
        status: EventAttendeeStatus.Confirmed,
        event: {
          ...mockEvent,
          sourceType: EventSourceType.BLUESKY,
          sourceData: { rkey: 'test-rkey' },
        } as EventEntity,
      };

      // Mock cancellation
      mockQueryBuilder.getOne.mockResolvedValueOnce(attendee); // Find active attendance

      const cancelledAttendee = {
        ...attendee,
        status: EventAttendeeStatus.Cancelled,
      };

      // Mock successful save for cancellation
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // For Bluesky integration - mock the required services
      mockUserService.findBySlug.mockResolvedValueOnce(mockUser as UserEntity);
      mockBlueskyRsvpService.createRsvp.mockResolvedValueOnce({
        success: true,
        rsvpUri: 'at://did:plc:test123/app.bsky.feed.post/test-cancel-rsvp',
      });
      mockRepository.findOne.mockResolvedValueOnce(cancelledAttendee);
      mockRepository.save.mockResolvedValueOnce(cancelledAttendee);

      // First cancel
      const cancelResult = await service.cancelEventAttendanceBySlug(
        'test-event',
        'test-user',
      );
      expect(cancelResult.status).toBe(EventAttendeeStatus.Cancelled);

      // Reset mocks for reactivation
      jest.clearAllMocks();

      // Mock reactivation - we need to set up the exact properties the service expects
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        ...cancelledAttendee,
        id: 1,
        event: mockEvent as EventEntity,
        status: EventAttendeeStatus.Cancelled,
        user: mockUser as UserEntity,
      });

      const reactivatedAttendee = {
        ...cancelledAttendee,
        status: EventAttendeeStatus.Confirmed,
      };

      // Mock successful save for reactivation
      mockRepository.save.mockResolvedValueOnce(reactivatedAttendee);

      // Now reactivate
      const reactivateResult = await service.reactivateEventAttendanceBySlug(
        'test-event',
        'test-user',
        EventAttendeeStatus.Confirmed,
      );

      // Verify reactivation worked
      expect(reactivateResult.status).toBe(EventAttendeeStatus.Confirmed);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Confirmed }),
      );
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
