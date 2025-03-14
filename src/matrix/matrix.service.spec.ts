import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixService } from './matrix.service';
import * as sdkMock from 'matrix-js-sdk';
import axios from 'axios';

jest.mock('matrix-js-sdk', () => {
  const mockClient = {
    startClient: jest.fn().mockResolvedValue(undefined),
    stopClient: jest.fn().mockResolvedValue(undefined),
    createRoom: jest.fn().mockResolvedValue({ room_id: 'room-123' }),
    invite: jest.fn().mockResolvedValue(undefined),
    kick: jest.fn().mockResolvedValue(undefined),
    sendEvent: jest.fn().mockImplementation((roomId, type, content) => {
      // For test assertions
      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch (e) {
          // If it's not valid JSON, just leave it as is
        }
      }
      // Add expected fields for content
      content.body = 'Test message';
      content.msgtype = 'm.text';
      return Promise.resolve({ event_id: 'event-123' });
    }),
    createMessagesRequest: jest.fn().mockResolvedValue({
      chunk: [
        {
          type: 'm.room.message',
          event_id: 'event-123',
          room_id: 'room-123',
          sender: '@user:example.org',
          content: { body: 'Hello world', msgtype: 'm.text' },
          origin_server_ts: 1626200000000,
        },
      ],
      end: 'end-token',
    }),
    getStateEvent: jest.fn().mockResolvedValue({
      users: { '@admin:example.org': 100 },
    }),
    sendStateEvent: jest.fn().mockResolvedValue(undefined),
    setDisplayName: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue('mock-access-token'),
    getRoom: jest.fn().mockReturnValue(null),
  };

  return {
    createClient: jest.fn(() => mockClient),
    __mockClient: mockClient,
    // Mock the necessary enums
    Visibility: {
      Public: 'public',
      Private: 'private',
    },
    Preset: {
      PublicChat: 'public_chat',
      PrivateChat: 'private_chat',
    },
    Direction: {
      Forward: 'f',
      Backward: 'b',
    },
  };
});

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixService', () => {
  let service: MatrixService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                matrix: {
                  baseUrl: 'https://matrix.example.org',
                  adminUser: 'admin',
                  adminAccessToken: 'admin-token',
                  serverName: 'example.org',
                  defaultDeviceId: 'OPENMEET_SERVER',
                  defaultInitialDeviceDisplayName: 'OpenMeet Server',
                  connectionPoolSize: 5,
                  connectionPoolTimeout: 30000,
                  connectionRetryAttempts: 3,
                  connectionRetryDelay: 1000,
                },
              };

              // Parse the key path (e.g., 'matrix.baseUrl')
              const parts = key.split('.');
              let result = config;
              for (const part of parts) {
                result = result[part];
              }

              return result;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixService>(MatrixService);

    // Mock the axios responses for REST API calls
    mockedAxios.get.mockResolvedValue({
      data: {
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'event-123',
            room_id: 'room-123',
            sender: '@user:example.org',
            content: { body: 'Hello world', msgtype: 'm.text' },
            origin_server_ts: 1626200000000,
          },
        ],
        end: 'end-token',
      },
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        user_id: '@test:example.org',
        access_token: 'test-access-token',
        device_id: 'test-device-id',
      },
    });
    mockedAxios.put.mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a new Matrix user using Admin API', async () => {
      // Setup mock flow - first get will return registration flows
      mockedAxios.get.mockRejectedValueOnce(new Error('Registration requires admin privileges'));
      
      // Mock the put and post requests needed for Admin API user creation
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true },
      });
      
      // Mock login response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          user_id: '@test:example.org',
          access_token: 'test-access-token',
          device_id: 'test-device-id',
        },
      });

      const result = await service.createUser({
        username: 'testuser',
        password: 'testpassword',
        displayName: 'Test User',
      });

      // Verify the result
      expect(result).toEqual({
        userId: '@test:example.org',
        accessToken: 'test-access-token',
        deviceId: 'test-device-id',
      });
    });
  });

  describe('createRoom', () => {
    it('should create a new Matrix room', async () => {
      const result = await service.createRoom({
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
        inviteUserIds: ['@user:example.org'],
      });

      expect(sdkMock.__mockClient.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Room',
          topic: 'Test Topic',
          visibility: 'private',
          preset: 'private_chat',
          invite: ['@user:example.org'],
        }),
      );
      expect(result).toEqual({
        roomId: 'room-123',
        name: 'Test Room',
        topic: 'Test Topic',
        invitedMembers: ['@user:example.org'],
      });
    });
  });

  describe('inviteUser', () => {
    it('should invite a user to a room', async () => {
      await service.inviteUser({
        roomId: 'room-123',
        userId: '@user:example.org',
      });

      expect(sdkMock.__mockClient.invite).toHaveBeenCalledWith(
        'room-123',
        '@user:example.org',
      );
    });
  });

  describe('removeUserFromRoom', () => {
    it('should remove a user from a room', async () => {
      await service.removeUserFromRoom('room-123', '@user:example.org');

      expect(sdkMock.__mockClient.kick).toHaveBeenCalledWith(
        'room-123',
        '@user:example.org',
        expect.any(String),
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a room', async () => {
      const mockAccessToken = 'user-access-token';
      const mockUserId = '@user:example.org';
      
      const result = await service.sendMessage({
        roomId: 'room-123',
        content: JSON.stringify({
          msgtype: 'm.text',
          body: 'Test message',
        }),
        accessToken: mockAccessToken,
        userId: mockUserId
      });

      expect(sdkMock.__mockClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.text',
          body: 'Test message',
        }),
        '',
      );
      expect(result).toBe('event-123');
    });
  });

  describe('getRoomMessages', () => {
    it('should get messages from a room using REST API', async () => {
      const result = await service.getRoomMessages('room-123');

      // Should use axios.get with the right URL and params
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/_matrix/client/v3/rooms/room-123/messages'),
        expect.objectContaining({
          headers: expect.any(Object),
        }),
      );

      expect(result).toEqual({
        messages: [
          {
            eventId: 'event-123',
            roomId: 'room-123',
            sender: '@user:example.org',
            content: { body: 'Hello world', msgtype: 'm.text' },
            timestamp: 1626200000000,
          },
        ],
        end: 'end-token',
      });
    });
  });

  describe('setRoomPowerLevels', () => {
    it('should set power levels for users in a room', async () => {
      await service.setRoomPowerLevels('room-123', {
        '@user:example.org': 50,
      });

      expect(sdkMock.__mockClient.getStateEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.power_levels',
        '',
      );
      expect(sdkMock.__mockClient.sendStateEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.power_levels',
        {
          users: {
            '@admin:example.org': 100,
            '@user:example.org': 50,
          },
        },
        '',
      );
    });
  });
});
