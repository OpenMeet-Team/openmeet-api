import { Test, TestingModule } from '@nestjs/testing';
import { MatrixChatProviderAdapter } from './matrix-chat-provider.adapter';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import {
  CreateRoomOptions,
  SendMessageOptions,
} from '../interfaces/chat-provider.interface';
// Create simplified tests focused on correct behavior, not mocking

describe('MatrixChatProviderAdapter', () => {
  let adapter: MatrixChatProviderAdapter;

  // Mock the Logger class
  jest.mock('@nestjs/common', () => {
    const original = jest.requireActual('@nestjs/common');
    return {
      ...original,
      Logger: jest.fn().mockImplementation(() => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      })),
    };
  });

  const mockMatrixUserService = {
    createUser: jest.fn(),
    setUserDisplayName: jest.fn(),
    getUserDisplayName: jest.fn(),
    getClientForUser: jest.fn(),
    releaseClientForUser: jest.fn(),
  };

  const mockMatrixRoomService = {
    createRoom: jest.fn(),
    inviteUser: jest.fn(),
    joinRoom: jest.fn(),
    removeUserFromRoom: jest.fn(),
    setRoomPowerLevels: jest.fn(),
  };

  const mockMatrixMessageService = {
    sendMessage: jest.fn(),
    getRoomMessages: jest.fn(),
    sendTypingNotification: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixChatProviderAdapter,
        {
          provide: MatrixUserService,
          useValue: mockMatrixUserService,
        },
        {
          provide: MatrixRoomService,
          useValue: mockMatrixRoomService,
        },
        {
          provide: MatrixMessageService,
          useValue: mockMatrixMessageService,
        },
      ],
    }).compile();

    adapter = module.get<MatrixChatProviderAdapter>(MatrixChatProviderAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('createRoom', () => {
    it('should call MatrixService.createRoom with correct parameters', async () => {
      // Arrange
      const options: CreateRoomOptions = {
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
        inviteUserIds: ['@user1:matrix.org'],
      };

      const mockResponse = {
        roomId: '!roomId:matrix.org',
        name: 'Test Room',
        topic: 'Test Topic',
      };

      mockMatrixRoomService.createRoom.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.createRoom(options);

      // Assert
      expect(mockMatrixRoomService.createRoom).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResponse);
    });

    it('should handle errors from MatrixService.createRoom', async () => {
      // Arrange
      const options: CreateRoomOptions = {
        name: 'Test Room',
        topic: 'Test Topic',
      };

      const error = new Error('Failed to create room');
      mockMatrixRoomService.createRoom.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(adapter.createRoom(options)).rejects.toThrow(
        'Failed to create chat room',
      );
    });
  });

  describe('getRoomMessages', () => {
    it('should call MatrixService.getRoomMessages with correct parameters', async () => {
      // Arrange
      const roomId = '!roomId:matrix.org';
      const limit = 50;
      const from = 'token123';
      const userId = '@user1:matrix.org';

      const mockResponse = {
        messages: [{ id: 'msg1' }],
        end: 'token456',
      };

      mockMatrixMessageService.getRoomMessages.mockResolvedValueOnce(
        mockResponse,
      );

      // Act
      const result = await adapter.getRoomMessages(roomId, limit, from, userId);

      // Assert
      expect(mockMatrixMessageService.getRoomMessages).toHaveBeenCalledWith(
        roomId,
        limit,
        from,
        userId,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle errors from MatrixService.getRoomMessages', async () => {
      // Arrange
      const roomId = '!roomId:matrix.org';
      const limit = 50;

      const error = new Error('Failed to get messages');
      mockMatrixMessageService.getRoomMessages.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(adapter.getRoomMessages(roomId, limit)).rejects.toThrow(
        'Failed to get messages',
      );
    });
  });

  describe('sendMessage', () => {
    it('should call MatrixService.sendMessage with correct parameters', async () => {
      // Arrange
      const options: SendMessageOptions = {
        roomId: '!roomId:matrix.org',
        content: 'Hello world',
        userId: '@user1:matrix.org',
        accessToken: 'access_token_123',
        body: 'Hello world',
      };

      const mockResponse = '$eventId1:matrix.org';
      mockMatrixMessageService.sendMessage.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await adapter.sendMessage(options);

      // Assert
      expect(mockMatrixMessageService.sendMessage).toHaveBeenCalledWith(
        options,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle errors from MatrixService.sendMessage', async () => {
      // Arrange
      const options: SendMessageOptions = {
        roomId: '!roomId:matrix.org',
        content: 'Hello world',
        userId: '@user1:matrix.org',
        accessToken: 'access_token_123',
      };

      const error = new Error('Failed to send message');
      mockMatrixMessageService.sendMessage.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(adapter.sendMessage(options)).rejects.toThrow(
        'Failed to send message',
      );
    });
  });

  // Additional tests can be added in a similar pattern for the remaining methods
});
