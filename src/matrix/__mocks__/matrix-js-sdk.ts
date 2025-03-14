// Mock for matrix-js-sdk

const createClient = jest.fn().mockImplementation(() => ({
  registerGuest: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org'
  }),
  login: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org'
  }),
  createRoom: jest.fn().mockResolvedValue({
    room_id: '!mock-room:matrix.org'
  }),
  joinRoom: jest.fn().mockResolvedValue({
    room_id: '!mock-room:matrix.org'
  }),
  getRooms: jest.fn().mockReturnValue([
    { roomId: '!mock-room:matrix.org', name: 'Mock Room' }
  ]),
  getRoom: jest.fn().mockReturnValue({
    roomId: '!mock-room:matrix.org',
    name: 'Mock Room',
    getMembers: jest.fn().mockReturnValue([
      { userId: '@mock-user:matrix.org', name: 'Mock User' }
    ])
  }),
  sendMessage: jest.fn().mockResolvedValue({
    event_id: '$mock-event-id'
  }),
  roomInitialSync: jest.fn().mockResolvedValue({
    messages: {
      chunk: [
        {
          content: { body: 'Mock message' },
          sender: '@mock-user:matrix.org',
          event_id: '$mock-event-id',
          origin_server_ts: Date.now()
        }
      ]
    }
  }),
  startClient: jest.fn(),
  stopClient: jest.fn(),
  setGuest: jest.fn(),
  getAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  isGuest: jest.fn().mockReturnValue(false),
  setNotifTimelineSet: jest.fn(),
  publicRooms: jest.fn().mockResolvedValue({
    chunk: [{ room_id: '!mock-room:matrix.org', name: 'Mock Room' }]
  }),
  invite: jest.fn().mockResolvedValue({}),
  ban: jest.fn().mockResolvedValue({}),
  kick: jest.fn().mockResolvedValue({}),
  leave: jest.fn().mockResolvedValue({}),
  createAlias: jest.fn().mockResolvedValue({}),
  getRoomIdForAlias: jest.fn().mockResolvedValue({ room_id: '!mock-room:matrix.org' }),
  getStateEvent: jest.fn().mockResolvedValue({}),
  sendStateEvent: jest.fn().mockResolvedValue({}),
  setPowerLevel: jest.fn().mockResolvedValue({}),
  registerRequest: jest.fn().mockResolvedValue({
    access_token: 'mock-access-token',
    device_id: 'mock-device-id',
    user_id: '@mock-user:matrix.org'
  }),
  createFilter: jest.fn().mockResolvedValue({ filter_id: 'mock-filter-id' }),
  searchUserDirectory: jest.fn().mockResolvedValue({
    results: [{ user_id: '@mock-user:matrix.org', display_name: 'Mock User' }]
  }),
  sendEvent: jest.fn().mockResolvedValue({ event_id: '$mock-event-id' }),
  sendReadReceipt: jest.fn().mockResolvedValue({}),
  getRoomMessages: jest.fn().mockResolvedValue({
    chunk: [
      {
        content: { body: 'Mock message' },
        sender: '@mock-user:matrix.org',
        event_id: '$mock-event-id',
        origin_server_ts: Date.now()
      }
    ],
    end: 'mock-end-token'
  }),
  sendTyping: jest.fn().mockResolvedValue({}),
  setRoomName: jest.fn().mockResolvedValue({}),
  setRoomTopic: jest.fn().mockResolvedValue({}),
  redactEvent: jest.fn().mockResolvedValue({ event_id: '$mock-redaction-id' }),
  uploadContent: jest.fn().mockResolvedValue({ content_uri: 'mxc://mock-content-uri' }),
  getEventTimeline: jest.fn().mockReturnValue({
    getEvents: jest.fn().mockReturnValue([])
  }),
  getSyncState: jest.fn().mockReturnValue('SYNCING'),
  getJoinedRooms: jest.fn().mockResolvedValue({ joined_rooms: ['!mock-room:matrix.org'] }),
}));

const matrixSdk = {
  createClient,
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
    FullyRead: 'm.fully_read'
  },
  HistoryVisibility: {
    Invited: 'invited',
    Joined: 'joined',
    Shared: 'shared',
    WorldReadable: 'world_readable'
  },
  JoinRule: {
    Public: 'public',
    Invite: 'invite',
    Private: 'private'
  },
  Visibility: {
    Public: 'public',
    Private: 'private'
  },
  PushRuleKind: {
    Override: 'override',
    Underride: 'underride',
    RoomSpecific: 'room',
    SenderSpecific: 'sender',
    Content: 'content'
  },
  PushRuleActionName: {
    Notify: 'notify',
    DontNotify: 'dont_notify',
    Coalesce: 'coalesce'
  },
  ContentHelpers: {
    makeEmoteMessage: jest.fn(),
    makeHtmlMessage: jest.fn(),
    makeHtmlEmote: jest.fn(),
    makeTextMessage: jest.fn()
  }
};

module.exports = matrixSdk;