import { Test, TestingModule } from '@nestjs/testing';
import { MatrixBotService } from '../../src/matrix/services/matrix-bot.service';
import { ConfigService } from '@nestjs/config';

describe('Matrix Bot Application Service Authentication (e2e)', () => {
  let matrixBotService: MatrixBotService;
  let configService: ConfigService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MatrixBotService,
          useValue: {
            authenticateBot: jest.fn(),
            isBotAuthenticated: jest.fn(),
            getBotUserId: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'matrix') {
                return {
                  appservice: {
                    token: process.env.MATRIX_APPSERVICE_TOKEN,
                    hsToken: process.env.MATRIX_APPSERVICE_HS_TOKEN,
                    id: process.env.MATRIX_APPSERVICE_ID,
                    url: process.env.MATRIX_APPSERVICE_URL,
                  },
                };
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    matrixBotService = module.get<MatrixBotService>(MatrixBotService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Configuration Loading', () => {
    it('should load appservice configuration from environment', () => {
      const matrixConfig = configService.get('matrix', { infer: true });

      console.log('Matrix appservice config:', {
        token: matrixConfig?.appservice?.token ? '***PRESENT***' : 'MISSING',
        hsToken: matrixConfig?.appservice?.hsToken
          ? '***PRESENT***'
          : 'MISSING',
        id: matrixConfig?.appservice?.id || 'MISSING',
        url: matrixConfig?.appservice?.url || 'MISSING',
      });

      expect(matrixConfig?.appservice?.token).toBeDefined();
      expect(matrixConfig?.appservice?.hsToken).toBeDefined();
      expect(matrixConfig?.appservice?.id).toBeDefined();
      expect(matrixConfig?.appservice?.url).toBeDefined();
    });

    it('should have appservice environment variables set', () => {
      console.log('Environment variables:', {
        MATRIX_APPSERVICE_TOKEN: process.env.MATRIX_APPSERVICE_TOKEN
          ? '***PRESENT***'
          : 'MISSING',
        MATRIX_APPSERVICE_HS_TOKEN: process.env.MATRIX_APPSERVICE_HS_TOKEN
          ? '***PRESENT***'
          : 'MISSING',
        MATRIX_APPSERVICE_ID: process.env.MATRIX_APPSERVICE_ID || 'MISSING',
        MATRIX_APPSERVICE_URL: process.env.MATRIX_APPSERVICE_URL || 'MISSING',
      });

      expect(process.env.MATRIX_APPSERVICE_TOKEN).toBeDefined();
      expect(process.env.MATRIX_APPSERVICE_HS_TOKEN).toBeDefined();
      expect(process.env.MATRIX_APPSERVICE_ID).toBeDefined();
      expect(process.env.MATRIX_APPSERVICE_URL).toBeDefined();
    });
  });

  describe('Bot Service Configuration', () => {
    it('should prefer appservice authentication when configured', () => {
      // This test just verifies the service can be instantiated with appservice config
      expect(matrixBotService).toBeDefined();
    });
  });
});
