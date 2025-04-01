import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import { EventStatus } from '../../core/constants/constant';
import {
  mockEvent,
  mockEvents,
  mockTenantConnectionService,
  mockRepository,
  mockUser,
  mockEventAttendeeService,
  mockMatrixService,
  mockGroupMemberService,
  mockRecurrenceService,
} from '../../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { MatrixChatProviderAdapter } from '../../chat/adapters/matrix-chat-provider.adapter';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { RecurrenceService } from '../../recurrence/recurrence.service';

describe('EventQueryService', () => {
  let service: EventQueryService;
  let eventRepository: Repository<EventEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventQueryService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: MatrixChatProviderAdapter,
          useValue: mockMatrixService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: RecurrenceService,
          useValue: mockRecurrenceService,
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(EventAttendeesEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = await module.resolve<EventQueryService>(EventQueryService);
    eventRepository = module.get<Repository<EventEntity>>(
      getRepositoryToken(EventEntity),
    );
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
      const mockRepositoryFind = jest.fn().mockResolvedValue([mockEvent]);
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
      ).toHaveBeenCalledWith(mockEvent.id);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(mockEvent),
          }),
        } as any);
      const result = await service.editEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('showEvent', () => {
    it('should return event with details', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(mockEvent),
          }),
        } as any);
      const result = await service.showEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
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

      // Mock the recurrence service for addRecurrenceInformation
      jest
        .spyOn(service['recurrenceService'], 'getRecurrenceDescription')
        .mockReturnValue('Every week on Monday');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
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
});
