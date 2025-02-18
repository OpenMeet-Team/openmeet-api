import { mockEvent, mockEvents, mockEventAttendees } from './event-mocks';

export const mockEventQueryService = {
  findEventBySlug: jest.fn().mockResolvedValue(mockEvent),
  showEvent: jest.fn().mockResolvedValue(mockEvent),
  editEvent: jest.fn().mockResolvedValue(mockEvent),
  showAllEvents: jest.fn().mockResolvedValue(mockEvents),
  searchAllEvents: jest.fn().mockResolvedValue(mockEvents),
  getEventsByCreator: jest.fn().mockResolvedValue(mockEvents),
  getEventsByAttendee: jest.fn().mockResolvedValue(mockEvents),
  findEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  findUpcomingEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  showDashboardEvents: jest.fn().mockResolvedValue(mockEvents),
  getHomePageFeaturedEvents: jest.fn().mockResolvedValue(mockEvents),
  getHomePageUserNextHostedEvent: jest.fn().mockResolvedValue(mockEvent),
  getHomePageUserRecentEventDrafts: jest.fn().mockResolvedValue(mockEvents),
  getHomePageUserUpcomingEvents: jest.fn().mockResolvedValue(mockEvents),
  findEventTopicsByEventId: jest.fn().mockResolvedValue([]),
  showEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
};
