import { mockDiscussions, mockFile, mockGroupAboutResponse } from './mocks';
import { GroupMemberEntity } from '../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { mockUser } from './user-mocks';
import { GroupUserPermissionEntity } from '../../group/infrastructure/persistence/relational/entities/group-user-permission.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { mockCategory } from './mocks';
import { mockEvents } from './event-mocks';
import { GroupRole } from '../../core/constants/constant';
import { GroupRoleEntity } from '../../group-role/infrastructure/persistence/relational/entities/group-role.entity';

export const mockGroupRole = {
  id: 1,
  name: GroupRole.Guest,
} as GroupRoleEntity;

export const mockGroupRoleService = {
  findOne: jest.fn().mockResolvedValue(mockGroupRole),
};

export const mockGroup = {
  id: 1,
  slug: 'test-group',
  name: 'Test Group',
  image: mockFile,
  categories: [mockCategory],
  createdBy: mockUser,
} as GroupEntity;

export const mockGroupUserPermission = {
  id: 1,
  user: mockUser,
  group: mockGroup,
} as GroupUserPermissionEntity;

export const mockGroupMember = {
  id: 1,
  user: mockUser,
  group: {
    id: 1,
    slug: 'test-group',
    name: 'Test Group',
  },
} as GroupMemberEntity;

export const mockGroupMembers = [mockGroupMember];
export const mockGroups = [mockGroup];

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
  createGroupMember: jest.fn().mockResolvedValue(mockGroupMember),
  getGroupMembersCount: jest.fn().mockResolvedValue(1),
  getMailServiceGroupMembersByPermission: jest
    .fn()
    .mockResolvedValue(mockGroupMembers),
  getMailServiceGroupMember: jest.fn().mockResolvedValue(mockGroupMember),
  showGroupDetailsMember: jest.fn().mockResolvedValue(mockGroupMember),
};

export const mockGroupMemberQueryService = {
  isUserMemberOfGroup: jest.fn().mockResolvedValue(false),
  findMemberByUserAndGroup: jest.fn().mockResolvedValue(null),
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
  joinGroup: jest.fn().mockResolvedValue(mockGroupMember),
  leaveGroup: jest.fn().mockResolvedValue(mockGroupMember),
  showGroupMembers: jest.fn().mockResolvedValue(mockGroupMembers),
  showGroupEvents: jest.fn().mockResolvedValue(mockEvents),
  showRecommendedEvents: jest.fn().mockResolvedValue(mockEvents),
  showGroupRecommendedEvents: jest.fn().mockResolvedValue(mockEvents),
  rejectMember: jest.fn().mockResolvedValue(mockGroupMember),
  approveMember: jest.fn().mockResolvedValue(mockGroupMember),
  removeGroupMember: jest.fn().mockResolvedValue(mockGroupMember),
  updateGroupMemberRole: jest.fn().mockResolvedValue(mockGroupMember),
  deleteGroupDiscussionMessage: jest
    .fn()
    .mockResolvedValue({ id: 'msg_123456' }),
  updateGroupDiscussionMessage: jest
    .fn()
    .mockResolvedValue({ id: 'msg_123456' }),
  sendGroupDiscussionMessage: jest.fn().mockResolvedValue({ id: 'msg_123456' }),
  showGroupAbout: jest.fn().mockResolvedValue(mockGroupAboutResponse),
  showGroupDiscussions: jest.fn().mockResolvedValue(mockDiscussions),
  searchAllGroups: jest.fn().mockResolvedValue(mockGroups),
  showDashboardGroups: jest.fn().mockResolvedValue(mockGroups),
};

export const mockGroupMailService = {
  sendGroupGuestJoined: jest.fn().mockResolvedValue(mockGroupMember),
  sendGroupMemberRoleUpdated: jest.fn().mockResolvedValue(mockGroupMember),
  sendAdminMessageToMembers: jest.fn().mockResolvedValue({
    success: true,
    deliveredCount: 1,
    failedCount: 0,
    messageId: 'test_msg_123',
  }),
  previewAdminMessage: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'preview_msg_123',
  }),
};
