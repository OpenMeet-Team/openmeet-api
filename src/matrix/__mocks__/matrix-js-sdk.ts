// Mock for matrix-js-sdk

// Create a mock client implementation that will be returned by createClient
const mockClient = {
  registerGuest: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org',
  }),
  login: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org',
  }),
  createRoom: jest.fn().mockResolvedValue({
    room_id: '!mock-room:matrix.org',
  }),
  joinRoom: jest.fn().mockResolvedValue({
    room_id: '!mock-room:matrix.org',
  }),
  getRooms: jest
    .fn()
    .mockReturnValue([{ roomId: '!mock-room:matrix.org', name: 'Mock Room' }]),
  getRoom: jest.fn().mockReturnValue({
    roomId: '!mock-room:matrix.org',
    name: 'Mock Room',
    getMembers: jest
      .fn()
      .mockReturnValue([
        { userId: '@mock-user:matrix.org', name: 'Mock User' },
      ]),
  }),
  sendMessage: jest.fn().mockResolvedValue({
    event_id: '$mock-event-id',
  }),
  roomInitialSync: jest.fn().mockResolvedValue({
    messages: {
      chunk: [
        {
          content: { body: 'Mock message' },
          sender: '@mock-user:matrix.org',
          event_id: '$mock-event-id',
          origin_server_ts: Date.now(),
        },
      ],
    },
  }),
  startClient: jest.fn(),
  stopClient: jest.fn(),
  setGuest: jest.fn(),
  getAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  isGuest: jest.fn().mockReturnValue(false),
  setNotifTimelineSet: jest.fn(),
  publicRooms: jest.fn().mockResolvedValue({
    chunk: [{ room_id: '!mock-room:matrix.org', name: 'Mock Room' }],
  }),
  invite: jest.fn().mockResolvedValue({}),
  ban: jest.fn().mockResolvedValue({}),
  kick: jest.fn().mockResolvedValue({}),
  leave: jest.fn().mockResolvedValue({}),
  createAlias: jest.fn().mockResolvedValue({}),
  getRoomIdForAlias: jest
    .fn()
    .mockResolvedValue({ room_id: '!mock-room:matrix.org' }),
  getStateEvent: jest.fn().mockResolvedValue({
    users: { '@admin:example.org': 100 }, // Add default power levels
  }),
  sendStateEvent: jest.fn().mockResolvedValue({}),
  setPowerLevel: jest.fn().mockResolvedValue({}),
  registerRequest: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org',
  }),
  createFilter: jest.fn().mockResolvedValue({ filter_id: 'mock-filter-id' }),
  searchUserDirectory: jest.fn().mockResolvedValue({
    results: [{ user_id: '@mock-user:matrix.org', display_name: 'Mock User' }],
  }),
  sendEvent: jest.fn().mockImplementation((roomId, type, content) => {
    // For test assertions
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        // If it's not valid JSON, just leave it as is
      }
    }
    // Add expected fields for content
    content.body = content.body || 'Test message';
    content.msgtype = content.msgtype || 'm.text';
    return Promise.resolve({ event_id: 'event-123' });
  }),
  sendReadReceipt: jest.fn().mockResolvedValue({}),
  getRoomMessages: jest.fn().mockResolvedValue({
    chunk: [
      {
        content: { body: 'Mock message' },
        sender: '@mock-user:matrix.org',
        event_id: '$mock-event-id',
        origin_server_ts: Date.now(),
      },
    ],
    end: 'mock-end-token',
  }),
  sendTyping: jest.fn().mockResolvedValue({}),
  setRoomName: jest.fn().mockResolvedValue({}),
  setRoomTopic: jest.fn().mockResolvedValue({}),
  redactEvent: jest.fn().mockResolvedValue({ event_id: '$mock-redaction-id' }),
  uploadContent: jest
    .fn()
    .mockResolvedValue({ content_uri: 'mxc://mock-content-uri' }),
  getEventTimeline: jest.fn().mockReturnValue({
    getEvents: jest.fn().mockReturnValue([]),
  }),
  getSyncState: jest.fn().mockReturnValue('SYNCING'),
  getJoinedRooms: jest
    .fn()
    .mockResolvedValue({ joined_rooms: ['!mock-room:matrix.org'] }),
  getProfileInfo: jest.fn().mockResolvedValue({
    displayname: 'Mock User',
    avatar_url: 'mxc://mock-avatar-url',
  }),
  setDisplayName: jest.fn().mockResolvedValue({}),
  getClientWellKnown: jest.fn().mockReturnValue({}),
};

// Create a createClient function that returns the mockClient
const createClient = jest.fn().mockImplementation(() => mockClient);

// Export the mocked matrix SDK with createClient properly implemented
const matrixSdk = {
  // This is the key line - make sure createClient is a function
  createClient: createClient,
  IndexedDBStore: jest.fn().mockImplementation(() => ({})),
  MemoryStore: jest.fn().mockImplementation(() => ({})),
  MatrixHttpApi: jest.fn().mockImplementation(() => ({})),
  Room: class MockRoom {},
  RoomMember: class MockRoomMember {},
  RoomState: class MockRoomState {},
  RoomEvent: class MockRoomEvent {},
  EventTimeline: class MockEventTimeline {},
  MatrixEvent: class MockMatrixEvent {},
  eventTypes: {
    RoomMember: 'm.room.member',
    RoomName: 'm.room.name',
    RoomTopic: 'm.room.topic',
    RoomAvatar: 'm.room.avatar',
    RoomMessage: 'm.room.message',
    Typing: 'm.typing',
    Receipt: 'm.receipt',
    Presence: 'm.presence',
    FullyRead: 'm.fully_read',
  },
  HistoryVisibility: {
    Invited: 'invited',
    Joined: 'joined',
    Shared: 'shared',
    WorldReadable: 'world_readable',
  },
  JoinRule: {
    Public: 'public',
    Invite: 'invite',
    Private: 'private',
  },
  Visibility: {
    Public: 'public',
    Private: 'private',
  },
  Preset: {
    PublicChat: 'public_chat',
    PrivateChat: 'private_chat',
    TrustedPrivateChat: 'trusted_private_chat',
  },
  Direction: {
    Forward: 'f',
    Backward: 'b',
  },
  PushRuleKind: {
    Override: 'override',
    Underride: 'underride',
    RoomSpecific: 'room',
    SenderSpecific: 'sender',
    Content: 'content',
  },
  PushRuleActionName: {
    Notify: 'notify',
    DontNotify: 'dont_notify',
    Coalesce: 'coalesce',
  },
  ContentHelpers: {
    makeEmoteMessage: jest.fn(),
    makeHtmlMessage: jest.fn(),
    makeHtmlEmote: jest.fn(),
    makeTextMessage: jest.fn(),
  },
  // Add this for test access to the mock client
  __mockClient: mockClient,
};

// Set the mock client's properties to have the correct functions
mockClient.sendEvent.mockClear();

// Export as a function that returns the SDK
const sdkFactory = () => Promise.resolve(matrixSdk);

// Handle both ESM and CommonJS export patterns
module.exports = matrixSdk;
module.exports.createClient = createClient;
module.exports.__mockClient = mockClient;
module.exports.default = sdkFactory;
