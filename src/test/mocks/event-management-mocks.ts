import { mockEvent } from './event-mocks';

export const mockEventManagementService = {
  deleteEventsByGroup: jest.fn().mockResolvedValue(undefined),
  create: jest.fn().mockResolvedValue(mockEvent),
  update: jest.fn().mockResolvedValue(mockEvent),
  remove: jest.fn().mockResolvedValue(undefined),
};
