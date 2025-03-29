// Test mock for matrix-js-sdk

// Create a mock client implementation that will be returned by createClient
const mockClient = {
  startClient: jest.fn().mockResolvedValue(undefined),
  stopClient: jest.fn(),
  createRoom: jest.fn().mockResolvedValue({ room_id: '!mock-room:matrix.org' }),
  sendEvent: jest
    .fn()
    .mockResolvedValue({ event_id: '$mock-event-id:matrix.org' }),
  getStateEvent: jest.fn().mockResolvedValue({}),
  sendStateEvent: jest.fn().mockResolvedValue({}),
  invite: jest.fn().mockResolvedValue({}),
  kick: jest.fn().mockResolvedValue({}),
  joinRoom: jest.fn().mockResolvedValue({}),
  getProfileInfo: jest.fn().mockResolvedValue({ displayname: 'Mock User' }),
  setDisplayName: jest.fn().mockResolvedValue({}),
  getJoinedRooms: jest.fn().mockResolvedValue({ joined_rooms: [] }),
  getRoom: jest.fn().mockReturnValue(null),
  getAccessToken: jest.fn().mockReturnValue('mock-token'),
  getUserId: jest.fn().mockReturnValue('@mock-user:matrix.org'),
  on: jest.fn(),
  removeListener: jest.fn(),
  roomState: jest.fn().mockResolvedValue([]),
  sendTyping: jest.fn().mockResolvedValue({}),
};

// Create a createClient function that returns the mockClient
const createClient = jest.fn().mockImplementation(() => mockClient);

// Export the mocked matrix SDK with createClient properly implemented
const matrixSdk = {
  // This is the key line - make sure createClient is a function
  createClient: createClient,
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
  __mockClient: mockClient,
};

// Export as default for ESM style imports
export default matrixSdk;

// Also export individually for CommonJS style imports
export const __mockClient = mockClient;
export { createClient };
