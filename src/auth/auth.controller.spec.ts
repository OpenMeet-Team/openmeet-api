import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { AtprotoServiceAuthService } from './services/atproto-service-auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Record<string, jest.Mock>;
  let mockAtprotoServiceAuthService: { verifyAndExchange: jest.Mock };

  beforeEach(async () => {
    mockAuthService = {
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
      createLoginLink: jest.fn(),
      exchangeLoginLink: jest.fn(),
    };

    mockAtprotoServiceAuthService = {
      verifyAndExchange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
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

      const result = await controller.atprotoServiceAuth(dto, request);

      expect(result).toEqual(mockLoginResponse);
      expect(
        mockAtprotoServiceAuthService.verifyAndExchange,
      ).toHaveBeenCalledWith('pds-signed-jwt', 'test-tenant');
    });

    it('should propagate errors from verifyAndExchange', async () => {
      mockAtprotoServiceAuthService.verifyAndExchange.mockRejectedValue(
        new Error('Invalid signature'),
      );

      const dto = { token: 'bad-token' };
      const request = { tenantId: 'test-tenant' };

      await expect(controller.atprotoServiceAuth(dto, request)).rejects.toThrow(
        'Invalid signature',
      );
    });
  });

  describe('createLoginLink', () => {
    it('should call service.createLoginLink with userId and tenantId', async () => {
      const mockResponse = {
        url: 'https://platform.openmeet.net/auth/token-login?code=abc&redirect=%2Fevents%2Ftest',
        expiresIn: 60,
      };
      mockAuthService.createLoginLink.mockResolvedValue(mockResponse);

      const request = {
        user: { id: 42 },
        tenantId: 'test-tenant',
      };
      const dto = { redirectPath: '/events/test' };

      const result = await controller.createLoginLink(dto, request);

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.createLoginLink).toHaveBeenCalledWith(
        42,
        'test-tenant',
        '/events/test',
      );
    });
  });

  describe('exchangeLoginLink', () => {
    it('should call service.exchangeLoginLink with code and tenantId', async () => {
      const mockLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { id: 42 },
        sessionId: 'test-session-id',
      };
      mockAuthService.exchangeLoginLink.mockResolvedValue(mockLoginResponse);

      const request = { tenantId: 'test-tenant' };
      const dto = { code: 'a'.repeat(64) };
      const response = { cookie: jest.fn() } as any;

      const result = await controller.exchangeLoginLink(dto, response, request);

      expect(result).toEqual(mockLoginResponse);
      expect(mockAuthService.exchangeLoginLink).toHaveBeenCalledWith(
        'a'.repeat(64),
        'test-tenant',
      );
    });

    it('should set OIDC session cookies when sessionId is present', async () => {
      const mockLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: { id: 42 },
        sessionId: 'test-session-id',
      };
      mockAuthService.exchangeLoginLink.mockResolvedValue(mockLoginResponse);

      const request = { tenantId: 'test-tenant' };
      const dto = { code: 'a'.repeat(64) };
      const response = { cookie: jest.fn() } as any;

      await controller.exchangeLoginLink(dto, response, request);

      expect(response.cookie).toHaveBeenCalledWith(
        'oidc_session',
        'test-session-id',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'oidc_tenant',
        'test-tenant',
        expect.any(Object),
      );
    });
  });
});
