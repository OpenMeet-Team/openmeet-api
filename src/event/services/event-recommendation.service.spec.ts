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
  mockGroup,
  mockEventAttendeeService,
} from '../../test/mocks';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventRecommendationService } from './event-recommendation.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';

describe('EventRecommendationService', () => {
  let service: EventRecommendationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRecommendationService,
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
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = await module.resolve<EventRecommendationService>(
      EventRecommendationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findRandom', () => {
    it('should return random events', async () => {
      jest.spyOn(mockRepository, 'find').mockResolvedValue(mockEvents);
      const result = await service.findRandom();
      expect(result).toBeTruthy();
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('showRandomEvents', () => {
    it('should return random published events', async () => {
      jest.spyOn(mockRepository, 'find').mockResolvedValue(mockEvents);
      const result = await service.showRandomEvents(3);
      expect(result).toBeTruthy();
    });
  });

  describe('showRecommendedEventsByEventSlug', () => {
    it('should return recommended events by event slug', async () => {
      jest.spyOn(mockRepository, 'findOne').mockResolvedValue(mockEvent);
      jest
        .spyOn(service, 'findRecommendedEventsForEvent')
        .mockResolvedValue(mockEvents);
      const result = await service.showRecommendedEventsByEventSlug(
        mockEvent.slug,
      );
      expect(result).toBeTruthy();
    });

    it('should return random events if event not found', async () => {
      jest.spyOn(mockRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(service, 'showRandomEvents').mockResolvedValue(mockEvents);

      const result =
        await service.showRecommendedEventsByEventSlug('non-existent');
      expect(result).toBeTruthy();
    });
  });

  describe('findRecommendedEventsForEvent', () => {
    it('should return recommended events for an event', async () => {
      jest.spyOn(mockRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.findRecommendedEventsForEvent(1, [1, 2], 3);
      expect(result).toBeTruthy();
    });
  });

  describe('findRecommendedEventsForGroup', () => {
    it('should return recommended events for a group', async () => {
      jest.spyOn(mockRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.findRecommendedEventsForGroup(1, [1, 2], 3);
      expect(result).toBeTruthy();
    });
  });

  describe('findRandomEventsForGroup', () => {
    it('should return random events for a group', async () => {
      jest.spyOn(mockRepository, 'createQueryBuilder').mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.findRandomEventsForGroup(mockGroup.id, 3, 5);
      expect(result).toBeTruthy();
    });
  });
});
