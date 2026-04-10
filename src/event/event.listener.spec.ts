import { Test, TestingModule } from '@nestjs/testing';
import { EventListener } from './event.listener';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { EventAttendeeStatus } from '../core/constants/constant';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserService } from '../user/user.service';
import { AttendanceChangedEvent } from '../attendance/types';

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
  const mockUser: Partial<UserEntity> = {
    id: 1,
    slug: 'test-user-slug',
    name: 'Test User',
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

  describe('handleAttendanceChanged', () => {
    const baseEvent: AttendanceChangedEvent = {
      status: 'going',
      previousStatus: null,
      eventUri: null,
      eventId: 1,
      eventSlug: 'test-event-slug',
      userUlid: 'user-ulid-123',
      userDid: 'did:plc:abc',
      tenantId: 'test-tenant',
    };

    beforeEach(() => {
      mockUserService.findById = jest.fn();
      (mockUserService as any).findByUlid = jest
        .fn()
        .mockResolvedValue(mockUser);
    });

    it('should emit chat.event.member.add when status is going and eventId is set', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should emit chat.event.member.add when status is maybe and eventId is set', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'maybe',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.event.member.add', {
        eventSlug: 'test-event-slug',
        userSlug: 'test-user-slug',
        tenantId: 'test-tenant',
      });
    });

    it('should emit chat.event.member.remove when status is notgoing and eventId is set', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'notgoing',
        previousStatus: 'going',
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

    it('should skip foreign events (eventId is null)', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should not throw on errors', async () => {
      (mockUserService as any).findByUlid = jest
        .fn()
        .mockRejectedValue(new Error('boom'));

      await expect(
        listener.handleAttendanceChanged(baseEvent),
      ).resolves.not.toThrow();
    });
  });
});
