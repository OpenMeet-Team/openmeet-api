import { Test, TestingModule } from '@nestjs/testing';
import { ChatRoomService } from './chat-room.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

// Create mocks for all dependencies
// This avoids importing the actual MatrixService which has ESM import issues with Jest
jest.mock('../matrix/matrix.service', () => {
  return {
    MatrixService: jest.fn().mockImplementation(() => {
      return {
        createUser: jest.fn(),
        startClient: jest.fn(),
        getRoomMessages: jest.fn(),
        sendMessage: jest.fn(),
      };
    }),
  };
});

// Import the mocked service
import { MatrixService } from '../matrix/matrix.service';

describe('ChatRoomService', () => {
  let service: ChatRoomService;
  // These services are injected but used through the service being tested
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userService: UserService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let matrixService: MatrixService;

  // Create mocks directly without typing them to avoid TS errors
  const mockUserWithoutMatrix: any = {
    id: 1,
    ulid: 'USER123',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    matrixUserId: null,
    matrixAccessToken: null,
    matrixDeviceId: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockUserWithMatrix: any = {
    ...mockUserWithoutMatrix,
    matrixUserId: '@test_user123:matrix.openmeet.net',
    matrixAccessToken: 'matrix_token_abc123',
    matrixDeviceId: 'DEVICE_XYZ',
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockMatrixUserInfo = {
    userId: '@test_user123:matrix.openmeet.net',
    accessToken: 'matrix_token_abc123',
    deviceId: 'DEVICE_XYZ',
  };

  const mockChatRoom = {
    id: 123,
    matrixRoomId: '!room123:matrix.openmeet.net',
    name: 'Test Room',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRoomService,
        {
          provide: UserService,
          useValue: {
            getUserById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: MatrixService,
          useValue: {
            createUser: jest.fn(),
            startClient: jest.fn(),
            getRoomMessages: jest.fn(),
            sendMessage: jest.fn(),
            createRoom: jest.fn(),
            getRoomById: jest.fn(),
            joinRoom: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
        {
          // Mock ChatRoomEntity repository token
          provide: 'ChatRoomEntityRepository',
          useValue: {
            findOne: jest.fn(() => Promise.resolve(mockChatRoom)),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChatRoomService>(ChatRoomService);
    userService = module.get<UserService>(UserService);
    matrixService = module.get<MatrixService>(MatrixService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // The rest of the tests would be here
});
