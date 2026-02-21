import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { AtprotoServiceAuthService } from './services/atproto-service-auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAtprotoServiceAuthService: { verifyAndExchange: jest.Mock };
  let mockResponse: { cookie: jest.Mock };

  beforeEach(async () => {
    mockAtprotoServiceAuthService = {
      verifyAndExchange: jest.fn(),
    };

    mockResponse = {
      cookie: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateLogin: jest.fn(),
            register: jest.fn(),
            confirmEmail: jest.fn(),
            confirmNewEmail: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            me: jest.fn(),
            update: jest.fn(),
            logout: jest.fn(),
            refreshToken: jest.fn(),
            softDelete: jest.fn(),
            quickRsvp: jest.fn(),
            verifyEmailCode: jest.fn(),
            requestLoginCode: jest.fn(),
          },
        },
        {
          provide: ShadowAccountService,
          useValue: {
            claimShadowAccount: jest.fn(),
          },
        },
        {
          provide: AtprotoServiceAuthService,
          useValue: mockAtprotoServiceAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('atprotoServiceAuth', () => {
    it('should call verifyAndExchange with token and tenantId', async () => {
      const mockLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { id: 1, ulid: 'user-ulid' },
      };
      mockAtprotoServiceAuthService.verifyAndExchange.mockResolvedValue(
        mockLoginResponse,
      );

      const dto = { token: 'pds-signed-jwt' };
      const request = { tenantId: 'test-tenant' };

      const result = await controller.atprotoServiceAuth(
        dto,
        mockResponse as any,
        request,
      );

      expect(result).toEqual(mockLoginResponse);
      expect(
        mockAtprotoServiceAuthService.verifyAndExchange,
      ).toHaveBeenCalledWith('pds-signed-jwt', 'test-tenant');
    });

    it('should set oidc cookies when sessionId is present', async () => {
      const mockLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        sessionId: 'session-id-123',
        user: { id: 1, ulid: 'user-ulid' },
      };
      mockAtprotoServiceAuthService.verifyAndExchange.mockResolvedValue(
        mockLoginResponse,
      );

      const dto = { token: 'pds-signed-jwt' };
      const request = { tenantId: 'test-tenant' };

      await controller.atprotoServiceAuth(dto, mockResponse as any, request);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'oidc_session',
        'session-id-123',
        expect.any(Object),
      );
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'oidc_tenant',
        'test-tenant',
        expect.any(Object),
      );
    });

    it('should propagate errors from verifyAndExchange', async () => {
      mockAtprotoServiceAuthService.verifyAndExchange.mockRejectedValue(
        new Error('Invalid signature'),
      );

      const dto = { token: 'bad-token' };
      const request = { tenantId: 'test-tenant' };

      await expect(
        controller.atprotoServiceAuth(dto, mockResponse as any, request),
      ).rejects.toThrow('Invalid signature');
    });
  });
});
