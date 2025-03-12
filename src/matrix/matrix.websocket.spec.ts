import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatrixService } from './matrix.service';
import { Socket } from 'socket.io';

// Mock the socket.io Socket
class MockSocket {
  id = 'test-socket-id';
  data = {};
  rooms = new Set();

  emit = jest.fn();
  to = jest.fn().mockReturnValue({
    emit: jest.fn(),
  });
  join = jest.fn();
  leave = jest.fn();
}

describe('MatrixService WebSocket Integration', () => {
  let service: MatrixService;
  let mockSocket: MockSocket;

  beforeEach(async () => {
    mockSocket = new MockSocket();

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
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixService>(MatrixService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocket functionality', () => {
    it('should generate WebSocket endpoint from base URL', () => {
      const endpoint = service.getWebSocketEndpoint();
      expect(endpoint).toBe('wss://matrix.example.org/matrix');

      // Test with trailing slash
      (service as any).baseUrl = 'https://matrix.example.org/';
      expect(service.getWebSocketEndpoint()).toBe(
        'wss://matrix.example.org/matrix',
      );

      // Test with HTTP URL
      (service as any).baseUrl = 'http://localhost:3000';
      expect(service.getWebSocketEndpoint()).toBe('ws://localhost:3000/matrix');
    });

    it('should send events to WebSocket clients via sendEventToWebSocket', () => {
      // Create a mock activeClients map with our test client
      const activeClients = new Map();
      activeClients.set('@test:example.org', {
        client: {
          /* mock matrix client */
        },
        userId: '@test:example.org',
        lastActivity: new Date(),
        eventCallbacks: [],
        wsClient: mockSocket as unknown as Socket,
      });

      // Set the mock activeClients map
      (service as any).activeClients = activeClients;

      // Create an event to send
      const event = {
        type: 'm.room.message',
        room_id: 'test-room-id',
        content: { body: 'Hello world' },
        sender: '@otheruser:example.org',
      };

      // Call the private method directly
      (service as any).sendEventToWebSocket(
        '@test:example.org',
        'test-room-id',
        event,
      );

      // Verify the event was sent to the WebSocket
      expect(mockSocket.emit).toHaveBeenCalledWith('matrix-event', event);

      // Verify room broadcasting works correctly
      expect(mockSocket.to).toHaveBeenCalledWith('test-room-id');
      expect(mockSocket.to('test-room-id').emit).toHaveBeenCalledWith(
        'matrix-event',
        event,
      );
    });

    it('should handle missing users gracefully in sendEventToWebSocket', () => {
      // Set an empty activeClients map
      (service as any).activeClients = new Map();

      // Create an event to send
      const event = {
        type: 'm.room.message',
        room_id: 'test-room-id',
        content: { body: 'Hello world' },
        sender: '@otheruser:example.org',
      };

      // This should not throw an error
      (service as any).sendEventToWebSocket(
        'non-existent-user',
        'test-room-id',
        event,
      );

      // No WebSocket methods should be called
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockSocket.to).not.toHaveBeenCalled();
    });

    it('should handle missing websocket client gracefully', () => {
      // Create a mock activeClients map with our test client but without a websocket
      const activeClients = new Map();
      activeClients.set('@test:example.org', {
        client: {
          /* mock matrix client */
        },
        userId: '@test:example.org',
        lastActivity: new Date(),
        eventCallbacks: [],
        // No wsClient property
      });

      // Set the mock activeClients map
      (service as any).activeClients = activeClients;

      // Create an event to send
      const event = {
        type: 'm.room.message',
        room_id: 'test-room-id',
        content: { body: 'Hello world' },
        sender: '@otheruser:example.org',
      };

      // This should not throw an error
      (service as any).sendEventToWebSocket(
        '@test:example.org',
        'test-room-id',
        event,
      );

      // No WebSocket methods should be called
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockSocket.to).not.toHaveBeenCalled();
    });
  });
});
