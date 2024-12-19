import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventRecommendationService } from './event-recommendation.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

describe('EventRecommendationService', () => {
  let service: EventRecommendationService;
  let eventRepository: Repository<EventEntity>;

  const mockEvent = {
    id: 1,
    slug: 'test-event',
    name: 'Test Event',
    startDate: new Date(),
    categories: [],
    // ... other required properties
  } as unknown as EventEntity;

  const mockUser = {
    id: 1,
    name: 'Test User',
    // ... other required properties
  } as UserEntity;

  const mockEventRepository = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockEvent]),
    })),
    findOne: jest.fn().mockResolvedValue(mockEvent),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRecommendationService,
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockEventRepository,
        },
      ],
    }).compile();

    service = module.get<EventRecommendationService>(EventRecommendationService);
    eventRepository = module.get<Repository<EventEntity>>(
      getRepositoryToken(EventEntity),
    );
  });

  describe('getRecommendedEvents', () => {
    it('should return recommended events for user', async () => {
      const result = await service.getRecommendedEvents(mockUser);
      expect(result).toEqual([mockEvent]);
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getSimilarEvents', () => {
    it('should return similar events', async () => {
      const result = await service.getSimilarEvents(1);
      expect(result).toEqual([mockEvent]);
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return empty array if event not found', async () => {
      jest.spyOn(eventRepository, 'findOne').mockResolvedValueOnce(null);
      const result = await service.getSimilarEvents(999);
      expect(result).toEqual([]);
    });
  });

  describe('getTrendingEvents', () => {
    it('should return trending events', async () => {
      const result = await service.getTrendingEvents();
      expect(result).toEqual([mockEvent]);
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('findRecommendedEventsForGroup', () => {
    it('should return recommended events for group', async () => {
      const result = await service.findRecommendedEventsForGroup(1);
      expect(result).toEqual([mockEvent]);
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('findRandomEventsForGroup', () => {
    it('should return random events for group', async () => {
      const result = await service.findRandomEventsForGroup(1);
      expect(result).toEqual([mockEvent]);
      expect(eventRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });
}); 