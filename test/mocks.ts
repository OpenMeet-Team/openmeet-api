import { EventEntity } from 'src/event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from 'src/group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

// Mock for UserEntity
export const mockUser = {
  id: 1,
  email: 'test@openmeet.net',
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
} as EventEntity;

export const mockGroupMember = {
  id: 1,
  group: mockGroup,
} as GroupMemberEntity;

export const mockGroupMembers = [mockGroupMember];
export const mockEvents = [mockEvent];

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

export const mockUserService = {
  getUserById: jest.fn().mockResolvedValue(mockUser),
  findOne: jest.fn().mockResolvedValue(mockUser),
};

export const mockTenantConnectionService = {
  getTenantConnection: jest.fn().mockResolvedValue({
    getRepository: jest.fn().mockReturnValue({
      find: jest.fn().mockResolvedValue(mockEvents),
      findOne: jest.fn().mockResolvedValue(mockEvent),
      save: jest.fn().mockResolvedValue(mockEvent),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockEvent),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      }),
    }),
  }),
};

export const mockEventAttendeeService = {
  findEventAttendeeByUserId: jest.fn().mockResolvedValue(null),
  showConfirmedEventAttendeesCount: jest.fn().mockResolvedValue(5),
  findEventIdsByUserId: jest.fn().mockResolvedValue([1]),
  showEventAttendees: jest.fn().mockResolvedValue({ data: [], meta: {} }),
};

export const mockMatrixService = {
  createRoom: jest.fn().mockResolvedValue('!room123:matrix.org'),
  sendMessage: jest.fn().mockResolvedValue({ eventId: 'event123', id: 1 }),
  getMessages: jest.fn().mockResolvedValue({ chunk: [] }),
};

export const mockGroupMemberService = {
  findGroupMemberByUserId: jest.fn().mockResolvedValue(null),
};
