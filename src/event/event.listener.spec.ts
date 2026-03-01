import { Test, TestingModule } from '@nestjs/testing';
import { EventListener } from './event.listener';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { EventAttendeeStatus } from '../core/constants/constant';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserService } from '../user/user.service';

describe('EventListener - Event-Driven Matrix Invitation Flow', () => {
  let listener: EventListener;
  let mockEventAttendeeService: {
    findOne: jest.Mock;
    findByUserSlug: jest.Mock;
  };
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mockUserService: { findById: jest.Mock };
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };

  // Mock data
  const mockEvent: Partial<EventEntity> = {
    id: 1,
    slug: 'test-event-slug',
    name: 'Test Event',
  };

  const mockUser: Partial<UserEntity> = {
    id: 1,
    slug: 'test-user-slug',
    name: 'Test User',
  };

  const mockAttendee: Partial<EventAttendeesEntity> = {
    id: 1,
    event: mockEvent as EventEntity,
    user: mockUser as UserEntity,
    status: EventAttendeeStatus.Confirmed,
  };

  beforeEach(async () => {
    mockEventAttendeeService = {
      findOne: jest.fn(),
      findByUserSlug: jest.fn(),
    };

    mockUserService = {
      findById: jest.fn(),
    };

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass) => {
        if (serviceClass === EventAttendeeService) {
          return Promise.resolve(mockEventAttendeeService);
        }
        if (serviceClass === UserService) {
          return Promise.resolve(mockUserService);
        }
        return Promise.resolve({});
      }),
    };

    // Spy on ContextIdFactory.create to verify it's called
    jest.spyOn(ContextIdFactory, 'create').mockReturnValue({
      id: 1,
      getParent: () => undefined,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventListener,
        {
          provide: EventEmitter2,
          useFactory: () => ({
            emit: jest.fn(),
          }),
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    listener = module.get<EventListener>(EventListener);
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Dynamic service resolution via ModuleRef', () => {
    it('should resolve EventAttendeeService and UserService dynamically via ModuleRef (not constructor-injected)', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      await listener.handleEventAttendeeCreatedEvent({
        eventId: 1,
        userId: 1,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });

      // Verify ContextIdFactory.create() was called
      expect(ContextIdFactory.create).toHaveBeenCalled();

      // Verify registerRequestByContextId was called with synthetic request containing tenantId
      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
        }),
        expect.anything(),
      );

      // Verify resolve was called for EventAttendeeService
      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        EventAttendeeService,
        expect.anything(),
        { strict: false },
      );
    });

    it('should include x-tenant-id header in synthetic request', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      await listener.handleEventAttendeeCreatedEvent({
        eventId: 1,
        userId: 1,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'my-tenant',
      });

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'my-tenant',
          headers: { 'x-tenant-id': 'my-tenant' },
        }),
        expect.anything(),
      );
    });

    it('should resolve services for handleEventAttendeeUpdatedEvent when slugs need lookup', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      const params = {
        eventId: 1,
        userId: 1,
        newStatus: EventAttendeeStatus.Confirmed,
        previousStatus: EventAttendeeStatus.Pending,
        // No slugs provided - forces service resolution for lookup
        tenantId: 'test-tenant',
      };

      await listener.handleEventAttendeeUpdatedEvent(params);

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'test-tenant' }),
        expect.anything(),
      );
    });

    it('should resolve services for handleEventAttendeeDeletedEvent', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      await listener.handleEventAttendeeDeletedEvent({
        eventId: 1,
        userId: 1,
        tenantId: 'test-tenant',
      });

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'test-tenant' }),
        expect.anything(),
      );
    });

    it('should resolve UserService for handleMatrixHandleRegistered', async () => {
      mockUserService.findById.mockResolvedValue({
        ...mockUser,
        slug: 'test-user-slug',
      });
      mockEventAttendeeService.findByUserSlug.mockResolvedValue([]);

      await listener.handleMatrixHandleRegistered({
        userId: 1,
        tenantId: 'test-tenant',
        handle: 'test-handle',
      });

      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        UserService,
        expect.anything(),
        { strict: false },
      );
    });
  });

  describe('handleEventAttendeeUpdatedEvent', () => {
    it('should emit chat.event.member.add when attendee status changes to confirmed', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        newStatus: EventAttendeeStatus.Confirmed,
        previousStatus: EventAttendeeStatus.Pending,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should fetch attendee data when slugs are not provided', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(mockEventAttendeeService.findOne).toHaveBeenCalledWith({
        where: {
          event: { id: 1 },
          user: { id: 1 },
        },
        relations: ['event', 'user'],
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should emit chat.event.member.remove when status changes from confirmed', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Cancelled,
        previousStatus: EventAttendeeStatus.Confirmed,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.event.member.remove',
        {
          eventSlug: 'test-event-slug',
          userSlug: 'test-user-slug',
          tenantId: 'test-tenant',
        },
      );
    });

    it('should return early when tenantId is missing from params', async () => {
      // Arrange - no tenantId in params, and no request context anymore
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
      };

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert - should not emit because tenantId is required
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should not emit any events when slugs cannot be resolved', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(null);

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should log and continue when eventAttendeeService throws error', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test-tenant',
      };

      const error = new Error('Database connection failed');
      mockEventAttendeeService.findOne.mockRejectedValue(error);

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert - Should not throw, just log error
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle missing eventSlug but present userSlug', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(mockEventAttendeeService.findOne).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should handle missing userSlug but present eventSlug', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        eventSlug: 'test-event-slug',
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(mockEventAttendeeService.findOne).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });
  });

  describe('handleEventAttendeeAddedEvent', () => {
    it('should emit chat.event.member.add when status is confirmed', () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      // Act
      listener.handleEventAttendeeAddedEvent(params);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should not emit events when status is not confirmed', () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Pending,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      // Act
      listener.handleEventAttendeeAddedEvent(params);

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleEventAttendeeCreatedEvent', () => {
    it('should emit chat.event.member.add when attendee is confirmed', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeCreatedEvent(params);

      // Assert
      expect(mockEventAttendeeService.findOne).toHaveBeenCalledWith({
        where: {
          event: { id: 1 },
          user: { id: 1 },
        },
        relations: ['event', 'user'],
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should not emit events when attendee is not confirmed', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      };

      const pendingAttendee = {
        ...mockAttendee,
        status: EventAttendeeStatus.Pending,
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        pendingAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeCreatedEvent(params);

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleEventAttendeeDeletedEvent', () => {
    it('should emit chat.event.member.remove when attendee is deleted', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeDeletedEvent(params);

      // Assert
      expect(mockEventAttendeeService.findOne).toHaveBeenCalledWith({
        where: {
          event: { id: 1 },
          user: { id: 1 },
        },
        relations: ['event', 'user'],
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'chat.event.member.remove',
        {
          eventSlug: 'test-event-slug',
          userSlug: 'test-user-slug',
          tenantId: 'test-tenant',
        },
      );
    });

    it('should log warning when attendee cannot be found', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        tenantId: 'test-tenant',
      };

      mockEventAttendeeService.findOne.mockResolvedValue(null);

      // Act
      await listener.handleEventAttendeeDeletedEvent(params);

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleMatrixHandleRegistered', () => {
    it('should re-emit chat.event.member.add for eligible attendances', async () => {
      mockUserService.findById.mockResolvedValue({
        ...mockUser,
        slug: 'test-user-slug',
      });

      mockEventAttendeeService.findByUserSlug.mockResolvedValue([
        {
          event: { slug: 'event-1' },
          status: EventAttendeeStatus.Confirmed,
        },
        {
          event: { slug: 'event-2' },
          status: EventAttendeeStatus.Cancelled,
        },
      ]);

      await listener.handleMatrixHandleRegistered({
        userId: 1,
        tenantId: 'test-tenant',
        handle: 'test-handle',
      });

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'event-1',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'event-2',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should not emit when user is not found', async () => {
      mockUserService.findById.mockResolvedValue(null);

      await listener.handleMatrixHandleRegistered({
        userId: 1,
        tenantId: 'test-tenant',
        handle: 'test-handle',
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
