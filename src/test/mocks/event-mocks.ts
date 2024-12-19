import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { mockUser } from './user-mocks';
import { mockZulipMessage } from './zulip-mocks';
import { mockZulipMessageResponse } from './zulip-mocks';
import { EventRoleEntity } from '../../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { mockGroup } from './group-mocks';
import { mockCategory } from './mocks';

export const mockEventRole = {
  id: 1,
  name: EventAttendeeRole.Participant,
} as EventRoleEntity;

export const mockEvent = {
  id: 1,
  slug: 'test-event',
  name: 'Test Event',
  attendeesCount: 1,
  group: mockGroup,
  categories: [mockCategory],
} as EventEntity;

export const mockEventAttendee = {
  id: 1,
  status: EventAttendeeStatus.Confirmed,
  role: {
    id: 1,
  },
  approvalAnswer: 'test',
  event: mockEvent,
  user: mockUser,
} as EventAttendeesEntity;

export const mockEventAttendees = [mockEventAttendee];

export const mockEvents = [mockEvent];

export const mockEventAttendeeService = {
  attendEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  getEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  leaveEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  findEventDetailsAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  create: jest.fn().mockResolvedValue(mockEventAttendee),
  showEventAttendeesCount: jest.fn().mockResolvedValue(1),
};

export const mockEventRoleService = {
  findOne: jest.fn().mockResolvedValue(mockEventRole),
  findByName: jest.fn().mockResolvedValue(mockEventRole),
};

export const mockEventService = {
  create: jest.fn().mockResolvedValue(mockEvent),
  findAll: jest.fn().mockResolvedValue(mockEvents),
  findOne: jest.fn().mockResolvedValue(mockEvent),
  update: jest.fn().mockResolvedValue(mockEvent),
  remove: jest.fn().mockResolvedValue(mockEvent),
  getEventsByCreator: jest.fn().mockResolvedValue(mockEvents),
  getEventsByAttendee: jest.fn().mockResolvedValue(mockEvents),
  showRecommendedEvents: jest.fn().mockResolvedValue(mockEvents),
  getHomePageUserNextHostedEvent: jest.fn().mockResolvedValue(mockEvent),
  getHomePageUserRecentEventDrafts: jest.fn().mockResolvedValue(mockEvents),
  getHomePageFeaturedEvents: jest.fn().mockResolvedValue(mockEvents),
  getHomePageUserUpcomingEvents: jest.fn().mockResolvedValue(mockEvents),
  getNextHostedEvent: jest.fn().mockResolvedValue(mockEvent),
  getRecentEventDrafts: jest.fn().mockResolvedValue(mockEvents),
  getUpcomingEvents: jest.fn().mockResolvedValue(mockEvents),
  findEventDetails: jest.fn().mockResolvedValue(mockEvent),
  findEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  findEventDetailsAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  findUserUpcomingEvents: jest.fn().mockResolvedValue(mockEvents),
  findRecommendedEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  findRandomEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  showGroupEvents: jest.fn().mockResolvedValue(mockEvents),
  deleteEventsByGroup: jest.fn().mockResolvedValue(undefined),
  findEventsForGroup: jest.fn().mockResolvedValue(mockEvents),
  showEvent: jest.fn().mockResolvedValue(mockEvent),
  editEvent: jest.fn().mockResolvedValue(mockEvent),
  attendEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  cancelAttendingEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  getEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  showRecommendedEventsByEventSlug: jest.fn().mockResolvedValue(mockEvents),
  showAllEvents: jest.fn().mockResolvedValue(mockEvents),
  showEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  sendEventDiscussionMessage: jest
    .fn()
    .mockResolvedValue(mockZulipMessageResponse),
  updateEventDiscussionMessage: jest.fn().mockResolvedValue(mockZulipMessage),
  deleteEventDiscussionMessage: jest
    .fn()
    .mockResolvedValue(mockZulipMessageResponse),
  showRandomEvents: jest.fn().mockResolvedValue(mockEvents),
  searchAllEvents: jest.fn().mockResolvedValue(mockEvents),
  showDashboardEvents: jest.fn().mockResolvedValue(mockEvents),
  getEventAttendeesCount: jest.fn().mockResolvedValue(1),
};

export const mockEventMailService = {
  sendMailAttendeeGuestJoined: jest.fn().mockResolvedValue(undefined),
  sendMailAttendeeStatusChanged: jest.fn().mockResolvedValue(undefined),
};
