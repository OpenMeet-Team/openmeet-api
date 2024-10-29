import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../src/core/constants/constant';
import { EventAttendeesEntity } from '../src/event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventEntity } from '../src/event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from 'src/group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { SubCategoryEntity } from 'src/sub-category/infrastructure/persistence/relational/entities/sub-category.entity';

// Mock for UserEntity
export const mockUser = {
  id: 1,
  email: 'test@example.com',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: new Date(),
  updatedAt: new Date(),
} as UserEntity;

// Mock for GroupEntity
export const mockGroup = {
  id: 1,
  name: 'Test Group',
} as GroupEntity;

// Mock for EventEntity
export const mockEvent = {
  id: 1,
  name: 'Test Event',
  attendeesCount: 1,
} as EventEntity;

export const mockEventAttendee = {
  id: 1,
  status: EventAttendeeStatus.Confirmed,
  role: EventAttendeeRole.Participant,
  event: mockEvent,
  user: mockUser,
  eventId: 1,
  userId: 1,
} as EventAttendeesEntity;

export const mockGroupMember = {
  id: 1,
  group: mockGroup,
} as GroupMemberEntity;

export const mockCategory = {
  id: 1,
  name: 'Test Category',
} as CategoryEntity;

export const mockSubCategory = {
  id: 1,
  title: 'Test Sub Category',
} as SubCategoryEntity;

export const mockSubCategories = [mockSubCategory];

export const mockGroupMembers = [mockGroupMember];
export const mockEvents = [mockEvent];
export const mockGroups = [mockGroup];

export const mockGroupService = {
  getHomePageFeaturedGroups: jest.fn().mockResolvedValue([]),
  getHomePageUserCreatedGroups: jest.fn().mockResolvedValue([]),
  getHomePageUserParticipatedGroups: jest.fn().mockResolvedValue([]),
};

export const mockCategoryService = {
  getHomePageFeaturedCategories: jest.fn().mockResolvedValue([]),
};

export const mockSubCategoryService = {
  getHomePageFeaturedSubCategories: jest.fn().mockResolvedValue([]),
  getHomePageUserInterests: jest.fn().mockResolvedValue([]),
};

export const mockConfigService = {
  getOrThrow: jest.fn().mockResolvedValue('test'),
};

export const mockEventService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getEventsByCreator: jest.fn(),
  getEventsByAttendee: jest.fn(),
  getRecommendedEventsByEventId: jest.fn(),
  getHomePageUserNextHostedEvent: jest.fn().mockResolvedValue(null),
  getHomePageUserRecentEventDrafts: jest.fn().mockResolvedValue([]),
  getHomePageFeaturedEvents: jest.fn().mockResolvedValue([]),
  getHomePageUserUpcomingEvents: jest.fn().mockResolvedValue(mockEvents),
  getNextHostedEvent: jest.fn().mockResolvedValue(mockEvent),
  getRecentEventDrafts: jest.fn().mockResolvedValue([]),
  getUpcomingEvents: jest.fn().mockResolvedValue([]),
  findEventDetails: jest.fn().mockResolvedValue(mockEvent),
  findEventAttendees: jest.fn().mockResolvedValue([]),
  findEventDetailsAttendees: jest.fn().mockResolvedValue([]),
  findUserUpcomingEvents: jest.fn().mockResolvedValue([]),
};

export const mockDashboardService = {
  getMyEvents: jest.fn(),
  getMyGroups: jest.fn(),
};
