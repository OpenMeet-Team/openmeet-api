import { mockEvents } from './event-mocks';

export const mockEventRecommendationService = {
  showRandomEvents: jest.fn().mockResolvedValue(mockEvents),
  findRecommendedEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  findRandomEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  findRandom: jest.fn().mockResolvedValue(mockEvents),
};
