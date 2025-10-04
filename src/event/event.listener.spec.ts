import { Test, TestingModule } from '@nestjs/testing';
import { EventListener } from './event.listener';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { EventAttendeeStatus } from '../core/constants/constant';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserService } from '../user/user.service';

describe('EventListener - Event-Driven Matrix Invitation Flow', () => {
  let listener: EventListener;
  let eventAttendeeService: jest.Mocked<EventAttendeeService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mockRequest: any;

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
    mockRequest = {
      tenantId: 'test-tenant',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventListener,
        {
          provide: EventAttendeeService,
          useFactory: () => ({
            findOne: jest.fn(),
            findByUserSlug: jest.fn(),
          }),
        },
        {
          provide: EventEmitter2,
          useFactory: () => ({
            emit: jest.fn(),
          }),
        },
        {
          provide: UserService,
          useFactory: () => ({
            findById: jest.fn(),
          }),
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    listener = module.get<EventListener>(EventListener);
    eventAttendeeService = module.get(
      EventAttendeeService,
    ) as jest.Mocked<EventAttendeeService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
    userService = module.get(UserService) as jest.Mocked<UserService>;

    jest.clearAllMocks();
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

      eventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventAttendeeService.findOne).toHaveBeenCalledWith({
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

    it('should use tenantId from request context when not provided in params', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        // tenantId not provided
      };

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant', // Should come from request context
      });
    });

    it('should not emit any events when slugs cannot be resolved', async () => {
      // Arrange
      const params = {
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test-tenant',
      };

      eventAttendeeService.findOne.mockResolvedValue(null);

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
      eventAttendeeService.findOne.mockRejectedValue(error);

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

      eventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventAttendeeService.findOne).toHaveBeenCalled();
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

      eventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeUpdatedEvent(params);

      // Assert
      expect(eventAttendeeService.findOne).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });
  });

  describe('handleEventAttendeeAddedEvent', () => {
    it('should emit chat.event.member.add when status is confirmed', async () => {
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
      await listener.handleEventAttendeeAddedEvent(params);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should not emit events when status is not confirmed', async () => {
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
      await listener.handleEventAttendeeAddedEvent(params);

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

      eventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeCreatedEvent(params);

      // Assert
      expect(eventAttendeeService.findOne).toHaveBeenCalledWith({
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

      eventAttendeeService.findOne.mockResolvedValue(
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

      eventAttendeeService.findOne.mockResolvedValue(
        mockAttendee as EventAttendeesEntity,
      );

      // Act
      await listener.handleEventAttendeeDeletedEvent(params);

      // Assert
      expect(eventAttendeeService.findOne).toHaveBeenCalledWith({
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

      eventAttendeeService.findOne.mockResolvedValue(null);

      // Act
      await listener.handleEventAttendeeDeletedEvent(params);

      // Assert
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
