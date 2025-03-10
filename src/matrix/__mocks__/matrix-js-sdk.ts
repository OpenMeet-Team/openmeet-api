// Mock implementation of matrix-js-sdk
const matrixJsSdk = {
  createClient: jest.fn().mockReturnValue({
    createRoom: jest.fn().mockResolvedValue({ room_id: '!room:matrix-dev.openmeet.net' }),
    invite: jest.fn().mockResolvedValue({}),
    joinRoom: jest.fn().mockResolvedValue({}),
    setRoomName: jest.fn().mockResolvedValue({}),
    setRoomTopic: jest.fn().mockResolvedValue({}),
    getRooms: jest.fn().mockReturnValue([]),
    getRoom: jest.fn().mockReturnValue({}),
    start: jest.fn().mockResolvedValue({}),
    createMessagesRequest: jest.fn().mockResolvedValue({
      chunk: [],
      start: '',
      end: '',
    }),
    sendEvent: jest.fn().mockResolvedValue({ event_id: '$event:matrix.example.com' }),
    redactEvent: jest.fn().mockResolvedValue({ event_id: '$redaction:matrix.example.com' }),
    sendReadReceipt: jest.fn().mockResolvedValue({}),
    startClient: jest.fn(),
    stopClient: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    kick: jest.fn().mockResolvedValue({}),
  }),
  Preset: {
    TrustedPrivateChat: 'trusted_private_chat',
    PrivateChat: 'private_chat',
    PublicChat: 'public_chat',
  },
  Visibility: {
    Public: 'public',
    Private: 'private',
  },
  Direction: {
    Forward: 'f',
    Backward: 'b',
  },
};

export = matrixJsSdk; 