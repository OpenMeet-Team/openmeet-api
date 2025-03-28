import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import {
  mockEvent,
  mockEvents,
  mockTenantConnectionService,
  mockRepository,
  mockUser,
  mockEventAttendeeService,
  mockMatrixService,
  mockGroupMemberService,
} from '../../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { MatrixChatProviderAdapter } from '../../chat/adapters/matrix-chat-provider.adapter';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';

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
      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents);
      const result = await service.findEventsForGroup(1, 3);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(mockEvent);
      const result = await service.editEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('showEvent', () => {
    it('should return event with details', async () => {
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(mockEvent);
      const result = await service.showEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('getHomePageFeaturedEvents', () => {
    it('should return featured events', async () => {
      jest.spyOn(eventRepository, 'createQueryBuilder').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.getHomePageFeaturedEvents();
      expect(result).toBeTruthy();
    });
  });
});
