import { Test, TestingModule } from '@nestjs/testing';
import { MatrixUserService } from './matrix-user.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixMessageService } from './matrix-message.service';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';
import { ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('Matrix Token Refresh Integration', () => {
  let userService: MatrixUserService;
  let messageService: MatrixMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixUserService,
        MatrixMessageService,
        {
          provide: MatrixCoreService,
          useValue: {
            acquireClient: jest.fn(),
            releaseClient: jest.fn(),
          },
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            validateUserAccess: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              switch (key) {
                case 'MATRIX_HOMESERVER_URL':
                  return 'https://matrix.example.com';
                case 'MATRIX_ACCESS_TOKEN':
                  return 'admin-access-token';
                default:
                  return undefined;
              }
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

    userService = module.get<MatrixUserService>(MatrixUserService);
    messageService = module.get<MatrixMessageService>(MatrixMessageService);
  });

  describe('Token Refresh Integration', () => {
    it('should have deprecated message service and active user service', () => {
      expect(messageService).toBeDefined();
      expect(userService).toBeDefined();

      // The message service should be a deprecated stub
      expect((messageService as any).sendMessage).toBeUndefined();

      // The user service should still be functional for user management
      expect(typeof userService.createUser).toBe('function');
    });

    it('should note that token refresh is now handled client-side', () => {
      // This test serves as documentation that token refresh is now handled
      // by the Matrix JS SDK on the client side, not server-side
      expect(true).toBe(true);
    });
  });
});
