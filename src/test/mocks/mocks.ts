import { CategoryEntity } from '../../category/infrastructure/persistence/relational/entities/categories.entity';
import { SubCategoryEntity } from '../../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import {
  mockEvent,
  mockEvents,
  mockEventService,
  mockEventAttendee,
  mockEventAttendeeService,
  mockEventAttendees,
  mockEventRoleService,
  mockEventMailService,
  mockEventRole,
} from './event-mocks';
import { mockUser, mockUserService } from './user-mocks';
import {
  mockGroupMember,
  mockGroups,
  mockGroupMailService,
} from './group-mocks';
import { mockEventQueryService } from './event-query-mocks';
import { mockEventManagementService } from './event-management-mocks';
import { mockEventRecommendationService } from './event-recommendation-mocks';

export {
  mockEventQueryService,
  mockEventManagementService,
  mockEventRecommendationService,
  mockEventService,
  mockEvent,
  mockEvents,
  mockEventAttendee,
  mockEventAttendeeService,
  mockEventAttendees,
  mockEventRoleService,
  mockEventMailService,
  mockEventRole,
  mockGroupMailService,
  mockUserService,
};

export const mockCategory = {
  id: 1,
  name: 'Test Category',
} as CategoryEntity;

export const mockFile = {
  id: 1,
  fileName: 'test.png',
  fileSize: 100,
  mimeType: 'image/png',
  path: 'test/path',
} as FileEntity;

export const mockSubCategory = {
  id: 1,
  title: 'Test Sub Category',
} as SubCategoryEntity;

export const mockEventTopic = {
  id: 1,
  name: 'test',
};

export const mockChatRoom = {
  id: 1,
  name: 'test-room',
  matrixRoomId: '!roomid:matrix.example.org',
  members: [mockUser],
};

export const mockDiscussions = {
  messages: [],
  end: '',
  roomId: '!roomid:matrix.example.org',
};

export const mockSubCategories = [mockSubCategory];

export const mockGroupAboutResponse = {
  events: [mockEvent],
  groupMembers: [mockGroupMember],
  messages: [],
  roomId: '!roomid:matrix.example.org',
};

export const mockMailService = {
  renderTemplate: jest.fn().mockResolvedValue('test'),
  groupMemberRoleUpdated: jest.fn().mockResolvedValue(undefined),
  groupGuestJoined: jest.fn().mockResolvedValue(undefined),
  sendMailChatNewMessage: jest.fn().mockResolvedValue(undefined),
};

export const mockDiscussionService = {
  getEventDiscussionMessages: jest.fn().mockResolvedValue(mockDiscussions),
  getGroupDiscussionMessages: jest.fn().mockResolvedValue(mockDiscussions),
  sendEventDiscussionMessage: jest.fn().mockResolvedValue({ id: 'msg_123456' }),
  sendGroupDiscussionMessage: jest.fn().mockResolvedValue({ id: 'msg_123456' }),
  addMemberToEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  removeMemberFromEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  cleanupGroupChatRooms: jest.fn().mockResolvedValue(undefined),
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
  findOne: jest.fn().mockResolvedValue(mockSubCategory),
};

export const mockConfigService = {
  getOrThrow: jest.fn().mockResolvedValue('test'),
};

export const mockFilesS3PresignedService = {
  uploadFile: jest.fn(),
  findById: jest.fn().mockResolvedValue(mockFile),
};

export const mockRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
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
  findOneOrFail: jest.fn(),
  findOneByOrFail: jest.fn(),
  merge: jest.fn(),
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getRawMany: jest.fn(),
  softDelete: jest.fn(),
  findAndCount: jest.fn(),
  update: jest.fn(),
  getOne: jest.fn(),
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

export const mockHomeQuery = {
  search: '',
  userId: 1,
  location: '',
  categories: [],
};

export const mockMailerService = {
  sendMjmlMail: jest.fn().mockResolvedValue(undefined),
};

export const mockRecurrenceService = {
  addExceptionDate: jest.fn().mockResolvedValue(true),
  processExceptionDates: jest.fn().mockResolvedValue([]),
  getUpcomingOccurrences: jest.fn().mockResolvedValue([]),
  getOccurrencesBetweenDates: jest.fn().mockResolvedValue([]),
  materializeOccurrences: jest.fn().mockResolvedValue([]),
  createOccurrenceFromEvent: jest.fn().mockResolvedValue({}),
  getEventOccurrenceDate: jest
    .fn()
    .mockImplementation((event) => event.startDate),
  getRecurrenceDescription: jest.fn().mockReturnValue('Every week on Monday'),
  generateOccurrences: jest.fn().mockReturnValue([new Date()]),
  splitSeries: jest.fn().mockResolvedValue({
    originalSeries: {},
    newSeries: {},
  }),
};
