// Chat-related mocks
import {
  ChatRoomEntity,
  ChatRoomType,
  ChatRoomVisibility,
} from '../../chat/infrastructure/persistence/relational/entities/chat-room.entity';

export const mockChatRoom = {
  id: 1,
  name: 'Test Event Chat Room',
  topic: 'Event Discussion',
  matrixRoomId: '!room:server',
  type: ChatRoomType.EVENT,
  visibility: ChatRoomVisibility.PUBLIC,
  settings: {
    historyVisibility: 'shared',
    guestAccess: true,
    requireInvitation: false,
    encrypted: false,
  },
  event: { id: 1 },
  group: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as ChatRoomEntity;

export const mockChatRoomGroup = {
  id: 2,
  name: 'Test Group Chat Room',
  topic: 'Group Discussion',
  matrixRoomId: '!room-group:server',
  type: ChatRoomType.GROUP,
  visibility: ChatRoomVisibility.PUBLIC,
  settings: {
    historyVisibility: 'shared',
    guestAccess: true,
    requireInvitation: false,
    encrypted: false,
  },
  event: null,
  group: { id: 1 },
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as ChatRoomEntity;

export const mockChatRoomService = {
  findChatRoomsByEventId: jest.fn().mockResolvedValue([mockChatRoom]),
  findChatRoomsByGroupId: jest.fn().mockResolvedValue([mockChatRoomGroup]),
  createEventChatRoomWithTenant: jest.fn().mockResolvedValue(mockChatRoom),
  createGroupChatRoomWithTenant: jest.fn().mockResolvedValue(mockChatRoomGroup),
  createGroupChatRoom: jest.fn().mockResolvedValue(mockChatRoomGroup),
  getOrCreateGroupChatRoom: jest.fn().mockResolvedValue(mockChatRoomGroup),
  deleteEventChatRooms: jest.fn().mockResolvedValue(undefined),
  deleteGroupChatRooms: jest.fn().mockResolvedValue(undefined),
  findAllRoomsByTenant: jest
    .fn()
    .mockResolvedValue([mockChatRoom, mockChatRoomGroup]),
};

export const mockDiscussionService = {
  cleanupEventChatRooms: jest.fn().mockResolvedValue(undefined),
  cleanupGroupChatRooms: jest.fn().mockResolvedValue(undefined),
  addMemberToEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  removeMemberFromEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  addMemberToGroupDiscussion: jest.fn().mockResolvedValue(undefined),
  removeMemberFromGroupDiscussion: jest.fn().mockResolvedValue(undefined),
  getIdsFromSlugsWithTenant: jest
    .fn()
    .mockResolvedValue({ eventId: 1, userId: 1 }),
};
