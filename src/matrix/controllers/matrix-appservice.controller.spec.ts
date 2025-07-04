import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixAppServiceController } from './matrix-appservice.controller';

describe('MatrixAppServiceController', () => {
  let controller: MatrixAppServiceController;

  const mockMatrixConfig = {
    appservice: {
      token: 'test-as-token',
      hsToken: 'test-hs-token',
      id: 'test-appservice-id',
      url: 'http://test.example.com/appservice',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatrixAppServiceController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockMatrixConfig),
          },
        },
      ],
    }).compile();

    controller = module.get<MatrixAppServiceController>(
      MatrixAppServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('token validation', () => {
    it('should accept valid homeserver token', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should reject invalid tokens', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer invalid-token',
      );
      expect(result).toEqual({ error: 'Invalid token' });
    });
  });

  describe('namespace validation', () => {
    it('should accept openmeet users', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should reject users outside namespace', async () => {
      const result = await controller.queryUser(
        '@regular-user:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({ error: 'User not in namespace' });
    });
  });

  describe('transaction handling', () => {
    it('should process valid transactions', async () => {
      const events = [{ type: 'm.room.message', sender: '@user:example.com' }];
      const result = await controller.handleTransaction(
        'txn123',
        events,
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });
  });
});
