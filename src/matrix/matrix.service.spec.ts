import { Test, TestingModule } from '@nestjs/testing';
import { MatrixService } from './matrix.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import axios from 'axios';
import * as sdk from 'matrix-js-sdk';
import { Direction } from 'matrix-js-sdk';

jest.mock('axios');
jest.mock('matrix-js-sdk');

describe('MatrixService', () => {
  let service: MatrixService;

  const mockRequest = {
    tenantId: 'test-tenant',
  };

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => {
      // Return the key itself instead of hardcoded values
      // This simulates getting values from environment variables
      return key || defaultValue;
    }),
  };

  const mockUserService = {
    addMatrixCredentialsToUser: jest.fn(),
    findOneByMatrixUserId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixService,
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = module.get<MatrixService>(MatrixService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAdminAccessToken', () => {
    it('should return cached token if available', async () => {
      // Set private property for testing
      Object.defineProperty(service, 'adminAccessToken', {
        value: 'cached-token',
        writable: true,
      });

      const result = await service.getAdminAccessToken();
      expect(result).toBe('cached-token');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should fetch new token if not cached', async () => {
      // Reset private property for testing
      Object.defineProperty(service, 'adminAccessToken', {
        value: null,
        writable: true,
      });

      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: { access_token: 'new-token' },
      });

      const result = await service.getAdminAccessToken();

      expect(result).toBe('new-token');
      expect(axios.post).toHaveBeenCalledWith(
        'MATRIX_SERVER_URL/_matrix/client/r0/login',
        {
          type: 'm.login.password',
          user: 'MATRIX_ADMIN_USERNAME',
          password: 'MATRIX_ADMIN_PASSWORD',
        },
      );
    });

    it('should throw error if login fails', async () => {
      // Reset private property for testing
      Object.defineProperty(service, 'adminAccessToken', {
        value: null,
        writable: true,
      });

      (axios.post as jest.Mock).mockRejectedValueOnce(
        new Error('Login failed'),
      );

      await expect(service.getAdminAccessToken()).rejects.toThrow(
        'Failed to authenticate with Matrix server',
      );
    });
  });

  describe('getAdminClient', () => {
    it('should create a client with admin credentials', async () => {
      // Mock getAdminAccessToken
      jest
        .spyOn(service, 'getAdminAccessToken')
        .mockResolvedValueOnce('admin-token');
      
      // Set the matrixServerUrl property for testing
      Object.defineProperty(service, 'matrixServerUrl', {
        value: 'https://matrix.example.com',
        writable: true,
      });

      // Set the matrixAdminUsername property
      Object.defineProperty(service, 'matrixAdminUsername', {
        value: 'admin',
        writable: true,
      });

      (sdk.createClient as jest.Mock).mockReturnValueOnce('admin-client');

      const result = await service.getAdminClient();
      
      expect(result).toBe('admin-client');
      expect(sdk.createClient).toHaveBeenCalledWith({
        baseUrl: 'https://matrix.example.com',
        accessToken: 'admin-token',
        userId: '@admin:matrix.example.com',
      });
    });
  });

  describe('getInitializedClient', () => {
    it('should return client with existing credentials', async () => {
      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix-dev.openmeet.net',
        matrixAccessToken: 'existing-token',
        matrixDeviceId: 'device-id',
      };

      (sdk.createClient as jest.Mock).mockReturnValueOnce('matrix-client');

      const result = await service.getInitializedClient(mockUser as any);

      expect(result).toBe('matrix-client');
      expect(sdk.createClient).toHaveBeenCalledWith({
        baseUrl: 'MATRIX_SERVER_URL',
        accessToken: 'existing-token',
        userId: '@test:matrix-dev.openmeet.net',
        deviceId: 'device-id',
      });
    });

    it('should create new user if no Matrix credentials exist', async () => {
      const mockUser = {
        id: 1,
        ulid: 'user-ulid',
        firstName: 'Test',
        lastName: 'User',
      };

      // Mock the createUser method
      jest
        .spyOn(service, 'createUser')
        .mockResolvedValueOnce(
          '@tenant_test-tenant__user-ulid:matrix-dev.openmeet.net',
        );

      // Mock axios post for login
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {
          access_token: 'new-token',
          device_id: 'new-device',
        },
      });

      // Mock userService.addMatrixCredentialsToUser
      mockUserService.addMatrixCredentialsToUser.mockResolvedValueOnce({
        ...mockUser,
        matrixUserId: '@tenant_test-tenant__user-ulid:matrix-dev.openmeet.net',
        matrixAccessToken: 'new-token',
        matrixDeviceId: 'new-device',
      });

      // Mock sdk.createClient
      (sdk.createClient as jest.Mock).mockReturnValueOnce('new-matrix-client');

      const result = await service.getInitializedClient(mockUser as any);

      expect(result).toBe('new-matrix-client');
      expect(service.createUser).toHaveBeenCalledWith({
        username: 'tenant_test-tenant__user-ulid',
        password: expect.any(String),
        displayName: 'Test User',
      });
      expect(mockUserService.addMatrixCredentialsToUser).toHaveBeenCalledWith(
        1,
        {
          matrixUserId:
            '@tenant_test-tenant__user-ulid:matrix-dev.openmeet.net',
          matrixAccessToken: 'new-token',
          matrixDeviceId: 'new-device',
        },
      );
    });

    it('should throw error if user update fails', async () => {
      const mockUser = {
        id: 1,
        ulid: 'user-ulid',
        firstName: 'Test',
        lastName: 'User',
      };

      // Mock the createUser method
      jest
        .spyOn(service, 'createUser')
        .mockResolvedValueOnce(
          '@tenant_test-tenant__user-ulid:matrix-dev.openmeet.net',
        );

      // Mock axios post for login
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {
          access_token: 'new-token',
          device_id: 'new-device',
        },
      });

      // Mock userService.addMatrixCredentialsToUser to return null (update failed)
      mockUserService.addMatrixCredentialsToUser.mockResolvedValueOnce(null);

      await expect(service.getInitializedClient(mockUser as any)).rejects.toThrow(
        'Failed to update user with Matrix credentials',
      );
    });
  });

  describe('createUser', () => {
    it('should create a new Matrix user', async () => {
      // Set the matrixServerUrl property for testing
      Object.defineProperty(service, 'matrixServerUrl', {
        value: 'https://matrix.example.com',
        writable: true,
      });

      // Mock getAdminAccessToken
      jest
        .spyOn(service, 'getAdminAccessToken')
        .mockResolvedValueOnce('admin-token');

      // Mock axios put with a successful response
      (axios.put as jest.Mock).mockResolvedValueOnce({
        data: {},
        status: 200,
      });

      const result = await service.createUser({
        username: 'test-user',
        password: 'test-password',
        displayName: 'Test User',
      });

      expect(result).toBe('@test-user:matrix.example.com');
      expect(axios.put).toHaveBeenCalledWith(
        'https://matrix.example.com/_synapse/admin/v2/users/%40test-user%3Amatrix.example.com',
        {
          password: 'test-password',
          displayname: 'Test User',
          admin: false,
          deactivated: false,
        },
        {
          headers: {
            Authorization: 'Bearer admin-token',
          },
        },
      );
    });

    it('should throw error if user creation fails', async () => {
      // Set the matrixServerUrl property for testing
      Object.defineProperty(service, 'matrixServerUrl', {
        value: 'https://matrix.example.com',
        writable: true,
      });

      // Mock getAdminAccessToken
      jest
        .spyOn(service, 'getAdminAccessToken')
        .mockResolvedValueOnce('admin-token');

      // Mock axios put to throw an error
      (axios.put as jest.Mock).mockRejectedValueOnce(
        new Error('User creation failed'),
      );

      await expect(
        service.createUser({
          username: 'test-user',
          password: 'test-password',
          displayName: 'Test User',
        }),
      ).rejects.toThrow('Failed to create Matrix user');
    });
  });

  describe('deleteUser', () => {
    it('should delete a Matrix user', async () => {
      // Set the matrixServerUrl property for testing
      Object.defineProperty(service, 'matrixServerUrl', {
        value: 'https://matrix.example.com',
        writable: true,
      });

      // Mock getAdminAccessToken
      jest
        .spyOn(service, 'getAdminAccessToken')
        .mockResolvedValueOnce('admin-token');

      // Mock axios post with a successful response
      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {},
        status: 200,
      });

      await service.deleteUser('@test-user:matrix.example.com');

      expect(axios.post).toHaveBeenCalledWith(
        'https://matrix.example.com/_synapse/admin/v1/deactivate/%40test-user%3Amatrix.example.com',
        {
          erase: true,
        },
        {
          headers: {
            Authorization: 'Bearer admin-token',
          },
        },
      );
    });

    it('should throw error if user deletion fails', async () => {
      // Set the matrixServerUrl property for testing
      Object.defineProperty(service, 'matrixServerUrl', {
        value: 'https://matrix.example.com',
        writable: true,
      });

      // Mock getAdminAccessToken
      jest
        .spyOn(service, 'getAdminAccessToken')
        .mockResolvedValueOnce('admin-token');

      // Mock axios post to throw an error
      (axios.post as jest.Mock).mockRejectedValueOnce(
        new Error('User deletion failed'),
      );

      await expect(
        service.deleteUser('@test-user:matrix.example.com'),
      ).rejects.toThrow('Failed to delete Matrix user');
    });
  });

  describe('createRoom', () => {
    it('should create a new Matrix room using admin client', async () => {
      // Mock getAdminClient
      const mockClient = {
        createRoom: jest
          .fn()
          .mockResolvedValueOnce({ room_id: '!room:matrix-dev.openmeet.net' }),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      const result = await service.createRoom({
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: true,
      });

      expect(result).toBe('!room:matrix-dev.openmeet.net');
      expect(mockClient.createRoom).toHaveBeenCalledWith({
        visibility: 'public',
        name: 'Test Room',
        topic: 'Test Topic',
        preset: 'public_chat',
      });
    });

    it('should create a private room when isPublic is false', async () => {
      // Mock getAdminClient
      const mockClient = {
        createRoom: jest
          .fn()
          .mockResolvedValueOnce({ room_id: '!room:matrix-dev.openmeet.net' }),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      const result = await service.createRoom({
        name: 'Private Room',
        isPublic: false,
      });

      expect(result).toBe('!room:matrix-dev.openmeet.net');
      expect(mockClient.createRoom).toHaveBeenCalledWith({
        visibility: 'private',
        name: 'Private Room',
        topic: undefined,
        preset: 'private_chat',
      });
    });

    it('should use specific creator if provided', async () => {
      // Mock getClientForUserId (the private method)
      const mockClient = {
        createRoom: jest
          .fn()
          .mockResolvedValueOnce({ room_id: '!room:matrix-dev.openmeet.net' }),
      };

      // Need to spy on private method
      const getClientForUserIdSpy = jest.spyOn(
        service as any,
        'getClientForUserId',
      ).mockResolvedValueOnce(mockClient as any);

      const result = await service.createRoom({
        name: 'Test Room',
        creatorId: '@creator:matrix.example.com',
      });

      expect(result).toBe('!room:matrix-dev.openmeet.net');
      expect(getClientForUserIdSpy).toHaveBeenCalledWith('@creator:matrix.example.com');
    });

    it('should throw error if room creation fails', async () => {
      // Mock getAdminClient
      const mockClient = {
        createRoom: jest.fn().mockRejectedValueOnce(new Error('Room creation failed')),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await expect(
        service.createRoom({
          name: 'Test Room',
        }),
      ).rejects.toThrow('Failed to create Matrix room');
    });
  });

  describe('inviteUserToRoom', () => {
    it('should invite a user to a room using admin client', async () => {
      // Mock getAdminClient
      const mockClient = {
        invite: jest.fn().mockResolvedValueOnce({}),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await service.inviteUserToRoom(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
      );

      expect(mockClient.invite).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
      );
    });

    it('should use specific inviter if provided', async () => {
      // Mock getClientForUserId (the private method)
      const mockClient = {
        invite: jest.fn().mockResolvedValueOnce({}),
      };

      // Need to spy on private method
      const getClientForUserIdSpy = jest.spyOn(
        service as any,
        'getClientForUserId',
      ).mockResolvedValueOnce(mockClient as any);

      await service.inviteUserToRoom(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        '@inviter:matrix.example.com',
      );

      expect(getClientForUserIdSpy).toHaveBeenCalledWith('@inviter:matrix.example.com');
      expect(mockClient.invite).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
      );
    });

    it('should throw error if invitation fails', async () => {
      // Mock getAdminClient
      const mockClient = {
        invite: jest.fn().mockRejectedValueOnce(new Error('Invitation failed')),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await expect(
        service.inviteUserToRoom(
          '!room:matrix.example.com',
          '@user:matrix.example.com',
        ),
      ).rejects.toThrow('Failed to invite user to room');
    });
  });

  describe('kickUserFromRoom', () => {
    it('should kick a user from a room using admin client', async () => {
      // Mock getAdminClient
      const mockClient = {
        kick: jest.fn().mockResolvedValueOnce({}),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await service.kickUserFromRoom(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
      );

      expect(mockClient.kick).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        'Removed from room',
      );
    });

    it('should use custom reason if provided', async () => {
      // Mock getAdminClient
      const mockClient = {
        kick: jest.fn().mockResolvedValueOnce({}),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await service.kickUserFromRoom(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        'Custom reason',
      );

      expect(mockClient.kick).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        'Custom reason',
      );
    });

    it('should use specific kicker if provided', async () => {
      // Mock getClientForUserId (the private method)
      const mockClient = {
        kick: jest.fn().mockResolvedValueOnce({}),
      };

      // Need to spy on private method
      const getClientForUserIdSpy = jest.spyOn(
        service as any,
        'getClientForUserId',
      ).mockResolvedValueOnce(mockClient as any);

      await service.kickUserFromRoom(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        'Custom reason',
        '@kicker:matrix.example.com',
      );

      expect(getClientForUserIdSpy).toHaveBeenCalledWith('@kicker:matrix.example.com');
      expect(mockClient.kick).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '@user:matrix.example.com',
        'Custom reason',
      );
    });

    it('should throw error if kick fails', async () => {
      // Mock getAdminClient
      const mockClient = {
        kick: jest.fn().mockRejectedValueOnce(new Error('Kick failed')),
      };
      jest
        .spyOn(service, 'getAdminClient')
        .mockResolvedValueOnce(mockClient as any);

      await expect(
        service.kickUserFromRoom(
          '!room:matrix.example.com',
          '@user:matrix.example.com',
        ),
      ).rejects.toThrow('Failed to kick user from room');
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a room', async () => {
      // Create a mock client with the sendEvent method
      const mockClient = {
        sendEvent: jest.fn().mockResolvedValueOnce({
          event_id: '$event:matrix.example.com',
        }),
      };

      // Mock the getInitializedClient method to return our mock client
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.sendMessage(
        mockUser as any,
        '!room:matrix.example.com',
        'Hello, world!',
      );

      expect(result).toEqual({ eventId: '$event:matrix.example.com' });
      expect(mockClient.sendEvent).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        'm.room.message',
        {
          msgtype: 'm.text',
          body: 'Hello, world!',
        },
        '',
      );
    });

    it('should send a message with custom type and additional content', async () => {
      // Create a mock client with the sendEvent method
      const mockClient = {
        sendEvent: jest.fn().mockResolvedValueOnce({
          event_id: '$event:matrix.example.com',
        }),
      };

      // Mock the getInitializedClient method to return our mock client
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.sendMessage(
        mockUser as any,
        '!room:matrix.example.com',
        'Hello, world!',
        'custom.message.type',
        { format: 'org.matrix.custom.html', formatted_body: '<b>Hello, world!</b>' },
      );

      expect(result).toEqual({ eventId: '$event:matrix.example.com' });
      expect(mockClient.sendEvent).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        'custom.message.type',
        {
          msgtype: 'm.text',
          body: 'Hello, world!',
          format: 'org.matrix.custom.html',
          formatted_body: '<b>Hello, world!</b>',
        },
        '',
      );
    });

    it('should throw error if sending fails', async () => {
      // Create a mock client with the sendEvent method that fails
      const mockClient = {
        sendEvent: jest.fn().mockRejectedValueOnce(new Error('Send failed')),
      };

      // Mock the getInitializedClient method to return our mock client
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.sendMessage(
          mockUser as any,
          '!room:matrix.example.com',
          'Hello, world!',
        ),
      ).rejects.toThrow('Failed to send message');
    });
  });

  describe('getMessages', () => {
    it('should get messages from a room', async () => {
      // Create a mock client
      const mockClient = {
        createMessagesRequest: jest.fn().mockResolvedValueOnce({
          chunk: [{ event_id: 'event1' }, { event_id: 'event2' }],
          start: 'start_token',
          end: 'end_token',
        }),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.getMessages(
        mockUser as any,
        '!room:matrix.example.com',
      );

      expect(result).toEqual({
        chunk: [{ event_id: 'event1' }, { event_id: 'event2' }],
        start: 'start_token',
        end: 'end_token',
      });
      expect(mockClient.createMessagesRequest).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        null,
        50,
        Direction.Forward,
      );
    });

    it('should get messages with custom limit and from token', async () => {
      // Create a mock client
      const mockClient = {
        createMessagesRequest: jest.fn().mockResolvedValueOnce({
          chunk: [{ event_id: 'event1' }],
          start: 'custom_start',
          end: 'custom_end',
        }),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.getMessages(
        mockUser as any,
        '!room:matrix.example.com',
        10,
        'start_token',
      );

      expect(result).toEqual({
        chunk: [{ event_id: 'event1' }],
        start: 'custom_start',
        end: 'custom_end',
      });
      expect(mockClient.createMessagesRequest).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        'start_token',
        10,
        Direction.Forward,
      );
    });

    it('should handle empty response', async () => {
      // Create a mock client
      const mockClient = {
        createMessagesRequest: jest.fn().mockResolvedValueOnce({}),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.getMessages(
        mockUser as any,
        '!room:matrix.example.com',
      );

      expect(result).toEqual({
        chunk: [],
        start: '',
        end: '',
      });
    });

    it('should throw error if getting messages fails', async () => {
      // Create a mock client
      const mockClient = {
        createMessagesRequest: jest.fn().mockRejectedValueOnce(new Error('Get failed')),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.getMessages(
          mockUser as any,
          '!room:matrix.example.com',
        ),
      ).rejects.toThrow('Failed to get messages');
    });
  });

  describe('updateMessage', () => {
    it('should update a message in a room', async () => {
      // Create a mock client
      const mockClient = {
        sendEvent: jest.fn().mockResolvedValueOnce({
          event_id: '$updated:matrix.example.com',
        }),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.updateMessage(
        mockUser as any,
        '!room:matrix.example.com',
        '$original:matrix.example.com',
        'Updated content',
      );

      expect(result).toEqual({ eventId: '$updated:matrix.example.com' });
      expect(mockClient.sendEvent).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        'm.room.message',
        {
          msgtype: 'm.text',
          body: 'Updated content',
          'm.new_content': {
            msgtype: 'm.text',
            body: 'Updated content',
          },
          'm.relates_to': {
            rel_type: 'm.replace',
            event_id: '$original:matrix.example.com',
          },
        },
      );
    });

    it('should throw error if update fails', async () => {
      // Create a mock client
      const mockClient = {
        sendEvent: jest.fn().mockRejectedValueOnce(new Error('Update failed')),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.updateMessage(
          mockUser as any,
          '!room:matrix.example.com',
          '$original:matrix.example.com',
          'Updated content',
        ),
      ).rejects.toThrow('Failed to update message');
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message from a room', async () => {
      // Create a mock client
      const mockClient = {
        redactEvent: jest.fn().mockResolvedValueOnce({
          event_id: '$redaction:matrix.example.com',
        }),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.deleteMessage(
        mockUser as any,
        '!room:matrix.example.com',
        '$original:matrix.example.com',
      );

      expect(result).toEqual({ eventId: '$redaction:matrix.example.com' });
      expect(mockClient.redactEvent).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '$original:matrix.example.com',
        undefined,
      );
    });

    it('should use custom reason if provided', async () => {
      // Create a mock client
      const mockClient = {
        redactEvent: jest.fn().mockResolvedValueOnce({
          event_id: '$redaction:matrix.example.com',
        }),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await service.deleteMessage(
        mockUser as any,
        '!room:matrix.example.com',
        '$original:matrix.example.com',
        'Removed inappropriate content',
      );

      expect(mockClient.redactEvent).toHaveBeenCalledWith(
        '!room:matrix.example.com',
        '$original:matrix.example.com',
        'Removed inappropriate content',
      );
    });

    it('should throw error if deletion fails', async () => {
      // Create a mock client
      const mockClient = {
        redactEvent: jest.fn().mockRejectedValueOnce(new Error('Delete failed')),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.deleteMessage(
          mockUser as any,
          '!room:matrix.example.com',
          '$original:matrix.example.com',
        ),
      ).rejects.toThrow('Failed to delete message');
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark a message as read', async () => {
      // Create a mock client
      const mockClient = {
        sendReadReceipt: jest.fn().mockResolvedValueOnce({}),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await service.markMessagesAsRead(
        mockUser as any,
        '!room:matrix.example.com',
        '$event:matrix.example.com',
      );

      expect(mockClient.sendReadReceipt).toHaveBeenCalledWith(expect.objectContaining({
        getRoomId: expect.any(Function),
        getId: expect.any(Function),
        getTs: expect.any(Function),
      }));

      // Verify the event object properties work as expected
      const eventArg = mockClient.sendReadReceipt.mock.calls[0][0];
      expect(eventArg.getRoomId()).toBe('!room:matrix.example.com');
      expect(eventArg.getId()).toBe('$event:matrix.example.com');
      expect(typeof eventArg.getTs()).toBe('number');
    });

    it('should throw error if marking as read fails', async () => {
      // Create a mock client
      const mockClient = {
        sendReadReceipt: jest.fn().mockRejectedValueOnce(new Error('Read receipt failed')),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.markMessagesAsRead(
          mockUser as any,
          '!room:matrix.example.com',
          '$event:matrix.example.com',
        ),
      ).rejects.toThrow('Failed to mark messages as read');
    });
  });

  describe('getUserRooms', () => {
    it('should get rooms for a user', async () => {
      // Create a mock room
      const mockRoom = {
        roomId: '!room:matrix.example.com',
        name: 'Test Room',
        currentState: {
          getStateEvents: jest.fn().mockReturnValue([{
            getContent: jest.fn().mockReturnValue({ topic: 'Test Topic' }),
          }]),
        },
        getJoinRule: jest.fn().mockReturnValue('public'),
        getJoinedMemberCount: jest.fn().mockReturnValue(5),
        getAvatarUrl: jest.fn().mockReturnValue('https://matrix.example.com/_matrix/media/r0/avatar.jpg'),
      };

      // Create a mock client
      const mockClient = {
        startClient: jest.fn(),
        stopClient: jest.fn(),
        getRooms: jest.fn().mockReturnValue([mockRoom]),
        on: jest.fn((event, callback) => {
          // Simulate the sync event
          if (event === 'sync') {
            setTimeout(() => callback('PREPARED'), 10);
          }
        }),
        removeListener: jest.fn(),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.getUserRooms(mockUser as any);

      expect(mockClient.startClient).toHaveBeenCalledWith({ initialSyncLimit: 0 });
      expect(mockClient.getRooms).toHaveBeenCalled();
      expect(mockClient.stopClient).toHaveBeenCalled();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '!room:matrix.example.com',
        name: 'Test Room',
        topic: 'Test Topic',
        avatarUrl: 'https://matrix.example.com/_matrix/media/r0/avatar.jpg',
        isPublic: true,
        memberCount: 5,
      });
    });

    it('should handle empty topic correctly', async () => {
      // Create a mock room with no topic
      const mockRoom = {
        roomId: '!room:matrix.example.com',
        name: 'Test Room',
        currentState: {
          getStateEvents: jest.fn().mockReturnValue([]), // No topic events
        },
        getJoinRule: jest.fn().mockReturnValue('private'),
        getJoinedMemberCount: jest.fn().mockReturnValue(2),
        getAvatarUrl: jest.fn().mockReturnValue(null),
      };

      // Create a mock client
      const mockClient = {
        startClient: jest.fn(),
        stopClient: jest.fn(),
        getRooms: jest.fn().mockReturnValue([mockRoom]),
        on: jest.fn((event, callback) => {
          // Simulate the sync event
          if (event === 'sync') {
            setTimeout(() => callback('PREPARED'), 10);
          }
        }),
        removeListener: jest.fn(),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      const result = await service.getUserRooms(mockUser as any);
      
      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe('');
      expect(result[0].isPublic).toBe(false);
    });

    it('should throw error if getting rooms fails', async () => {
      // Create a mock client that throws an error
      const mockClient = {
        startClient: jest.fn().mockRejectedValueOnce(new Error('Client start failed')),
      };

      // Mock the getInitializedClient method
      jest
        .spyOn(service, 'getInitializedClient')
        .mockResolvedValueOnce(mockClient as any);

      const mockUser = {
        id: 1,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'token',
      };

      await expect(
        service.getUserRooms(mockUser as any),
      ).rejects.toThrow('Failed to get user rooms');
    });
  });
});
