// Mock for EventOccurrenceService
export const mockEventOccurrenceService = {
  initializeRepository: jest.fn().mockResolvedValue(undefined),
  generateOccurrences: jest.fn().mockResolvedValue([]),
  getOccurrencesInRange: jest.fn().mockResolvedValue([]),
  createExceptionOccurrence: jest.fn().mockResolvedValue({}),
  excludeOccurrence: jest.fn().mockResolvedValue(true),
  includeOccurrence: jest.fn().mockResolvedValue(true),
  deleteAllOccurrences: jest.fn().mockResolvedValue(0),
};
