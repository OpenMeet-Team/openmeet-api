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
