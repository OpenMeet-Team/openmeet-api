import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../core/constants/constant';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { SubCategoryEntity } from '../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupUserPermissionEntity } from '../group/infrastructure/persistence/relational/entities/group-user-permission.entity';

export const mockCategory = {
  id: 1,
  name: 'Test Category',
} as CategoryEntity;

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

export const mockFile = {
  id: 1,
  fileName: 'test.png',
  fileSize: 100,
  mimeType: 'image/png',
  path: 'test/path',
} as FileEntity;

// Mock for GroupEntity
export const mockGroup = {
  id: 1,
  name: 'Test Group',
  image: mockFile,
  categories: [mockCategory],
  createdBy: mockUser,
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

export const mockGroupUserPermission = {
  id: 1,
  user: mockUser,
  group: mockGroup,
} as GroupUserPermissionEntity;

export const mockEventAttendees = [mockEventAttendee];

export const mockGroupMember = {
  id: 1,
  user: mockUser,
  group: mockGroup,
} as GroupMemberEntity;

export const mockSubCategory = {
  id: 1,
  title: 'Test Sub Category',
} as SubCategoryEntity;

export const mockSubCategories = [mockSubCategory];

export const mockGroupMembers = [mockGroupMember];
export const mockEvents = [mockEvent];
export const mockGroups = [mockGroup];

export const mockEventAttendeeService = {
  attendEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  getEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
  leaveEvent: jest.fn().mockResolvedValue(mockEventAttendee),
  findEventDetailsAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
};

export const mockGroupMemberService = {
  findGroupMemberByUserId: jest.fn().mockResolvedValue(mockGroupMember),
  rejectMember: jest.fn().mockResolvedValue(mockGroupMember),
  approveMember: jest.fn().mockResolvedValue(mockGroupMember),
  removeMember: jest.fn().mockResolvedValue(mockGroupMember),
  addMember: jest.fn().mockResolvedValue(mockGroupMember),
  updateRole: jest.fn().mockResolvedValue(mockGroupMember),
  joinGroup: jest.fn().mockResolvedValue(mockGroupMember),
  createGroupOwner: jest.fn().mockResolvedValue(mockGroupMember),
  removeGroupMember: jest.fn().mockResolvedValue(mockGroupMember),
  leaveGroup: jest.fn().mockResolvedValue(mockGroupMember),
  findGroupDetailsMembers: jest.fn().mockResolvedValue(mockGroupMembers),
  updateGroupMemberRole: jest.fn().mockResolvedValue(mockGroupMember),
};

export const mockGroupService = {
  getHomePageFeaturedGroups: jest.fn().mockResolvedValue(mockGroups),
  getHomePageUserCreatedGroups: jest.fn().mockResolvedValue(mockGroups),
  getHomePageUserParticipatedGroups: jest.fn().mockResolvedValue(mockGroups),
  getRecommendedEvents: jest.fn().mockResolvedValue(mockEvents),
  findGroupDetails: jest.fn().mockResolvedValue(mockGroup),
  getGroupMembers: jest.fn().mockResolvedValue(mockGroupMembers),
  findGroupDetailsMembers: jest.fn().mockResolvedValue(mockGroupMembers),
  getGroupMemberPermissions: jest.fn().mockResolvedValue(mockGroupMember),
  create: jest.fn().mockResolvedValue(mockGroup),
  update: jest.fn().mockResolvedValue(mockGroup),
  remove: jest.fn().mockResolvedValue(mockGroup),
  showGroup: jest.fn().mockResolvedValue(mockGroup),
  editGroup: jest.fn().mockResolvedValue(mockGroup),
  findAll: jest.fn().mockResolvedValue(mockGroups),
  getGroupsWhereUserCanCreateEvents: jest.fn().mockResolvedValue(mockGroups),
};

export const mockCategoryService = {
  getHomePageFeaturedCategories: jest.fn().mockResolvedValue([mockCategory]),
  findOne: jest.fn().mockResolvedValue(mockCategory),
  findByIds: jest.fn().mockResolvedValue([mockCategory]),
};

export const mockSubCategoryService = {
  getHomePageFeaturedSubCategories: jest
    .fn()
    .mockResolvedValue(mockSubCategories),
  getHomePageUserInterests: jest.fn().mockResolvedValue(mockSubCategories),
};

export const mockConfigService = {
  getOrThrow: jest.fn().mockResolvedValue('test'),
};

export const mockEventService = {
  create: jest.fn().mockResolvedValue(mockEvent),
  findAll: jest.fn().mockResolvedValue(mockEvents),
  findOne: jest.fn().mockResolvedValue(mockEvent),
  update: jest.fn().mockResolvedValue(mockEvent),
  remove: jest.fn().mockResolvedValue(mockEvent),
  getEventsByCreator: jest.fn().mockResolvedValue(mockEvents),
  getEventsByAttendee: jest.fn().mockResolvedValue(mockEvents),
  getRecommendedEventsByEventId: jest.fn().mockResolvedValue(mockEvents),
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
};

export const mockFilesS3PresignedService = {
  uploadFile: jest.fn(),
  findById: jest.fn().mockResolvedValue(mockFile),
};

export const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  softRemove: jest.fn(),
  recover: jest.fn(),
  findAll: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn(),
  innerJoin: jest.fn().mockReturnThis(),
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn(),
  create: jest.fn(),
  getRawAndEntities: jest.fn(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  remove: jest.fn(),
};

export const mockDashboardService = {
  getMyEvents: jest.fn().mockResolvedValue(mockEvents),
  getMyGroups: jest.fn().mockResolvedValue(mockGroups),
};

export const mockPagination = {
  page: 1,
  limit: 10,
};

// TODO fix this mock
export const mockGroupsQuery = {
  search: '',
  userId: 1,
  location: '',
  categories: [],
};

export const mockTenantConnectionService = {
  getTenantConnection: jest.fn().mockResolvedValue({
    getRepository: jest.fn().mockImplementation(() => {
      // if (entity === EventAttendeesEntity) {
      //   return mockEventAttendeeRepository;
      // }
      return mockRepository;
    }),
  }),
};
