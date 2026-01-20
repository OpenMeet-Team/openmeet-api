import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, AxiosHeaders } from 'axios';
import { PdsAccountService } from './pds-account.service';
import { PdsApiError } from './pds.errors';

describe('PdsAccountService', () => {
  let service: PdsAccountService;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  const mockConfig = {
    'pds.url': 'https://pds-dev.openmeet.net',
    'pds.adminPassword': 'admin-secret',
    'pds.serviceHandleDomains': '.dev.opnmt.me',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => mockConfig[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = mockConfig[key];
        if (!value) throw new Error(`Config ${key} not found`);
        return value;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdsAccountService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PdsAccountService>(PdsAccountService);
    httpService = module.get(HttpService) as jest.Mocked<HttpService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('createAccount()', () => {
    it('should create account successfully', async () => {
      const successResponse: AxiosResponse = {
        data: {
          did: 'did:plc:abc123',
          handle: 'alice.dev.opnmt.me',
          accessJwt: 'access-token-here',
          refreshJwt: 'refresh-token-here',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      httpService.post.mockReturnValue(of(successResponse));

      const result = await service.createAccount({
        email: 'alice@example.com',
        handle: 'alice.dev.opnmt.me',
        password: 'secret-password',
      });

      expect(result).toEqual({
        did: 'did:plc:abc123',
        handle: 'alice.dev.opnmt.me',
        accessJwt: 'access-token-here',
        refreshJwt: 'refresh-token-here',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://pds-dev.openmeet.net/xrpc/com.atproto.server.createAccount',
        {
          email: 'alice@example.com',
          handle: 'alice.dev.opnmt.me',
          password: 'secret-password',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
    });

    it('should handle duplicate handle error (InvalidHandle)', async () => {
      const errorResponse: AxiosError = {
        isAxiosError: true,
        response: {
          data: {
            error: 'InvalidHandle',
            message: 'Handle already taken',
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      httpService.post.mockReturnValue(throwError(() => errorResponse));

      await expect(
        service.createAccount({
          email: 'alice@example.com',
          handle: 'taken.dev.opnmt.me',
          password: 'secret-password',
        }),
      ).rejects.toThrow(PdsApiError);

      await expect(
        service.createAccount({
          email: 'alice@example.com',
          handle: 'taken.dev.opnmt.me',
          password: 'secret-password',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        atError: 'InvalidHandle',
      });
    });
  });

  describe('createSession()', () => {
    it('should create session successfully', async () => {
      const successResponse: AxiosResponse = {
        data: {
          did: 'did:plc:abc123',
          handle: 'alice.dev.opnmt.me',
          accessJwt: 'access-token-here',
          refreshJwt: 'refresh-token-here',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      httpService.post.mockReturnValue(of(successResponse));

      const result = await service.createSession(
        'alice.dev.opnmt.me',
        'secret-password',
      );

      expect(result).toEqual({
        did: 'did:plc:abc123',
        handle: 'alice.dev.opnmt.me',
        accessJwt: 'access-token-here',
        refreshJwt: 'refresh-token-here',
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://pds-dev.openmeet.net/xrpc/com.atproto.server.createSession',
        {
          identifier: 'alice.dev.opnmt.me',
          password: 'secret-password',
        },
        expect.any(Object),
      );
    });

    it('should handle wrong password error (AuthenticationRequired)', async () => {
      const errorResponse: AxiosError = {
        isAxiosError: true,
        response: {
          data: {
            error: 'AuthenticationRequired',
            message: 'Invalid identifier or password',
          },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 401',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      httpService.post.mockReturnValue(throwError(() => errorResponse));

      await expect(
        service.createSession('alice.dev.opnmt.me', 'wrong-password'),
      ).rejects.toThrow(PdsApiError);

      await expect(
        service.createSession('alice.dev.opnmt.me', 'wrong-password'),
      ).rejects.toMatchObject({
        statusCode: 401,
        atError: 'AuthenticationRequired',
      });
    });
  });

  describe('isHandleAvailable()', () => {
    it('should return true when handle not found (400)', async () => {
      const errorResponse: AxiosError = {
        isAxiosError: true,
        response: {
          data: {
            error: 'InvalidRequest',
            message: 'Unable to resolve handle',
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      httpService.get.mockReturnValue(throwError(() => errorResponse));

      const result = await service.isHandleAvailable('available.dev.opnmt.me');

      expect(result).toBe(true);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://pds-dev.openmeet.net/xrpc/com.atproto.identity.resolveHandle',
        expect.objectContaining({
          params: { handle: 'available.dev.opnmt.me' },
        }),
      );
    });

    it('should return false when handle exists', async () => {
      const successResponse: AxiosResponse = {
        data: {
          did: 'did:plc:existing123',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      httpService.get.mockReturnValue(of(successResponse));

      const result = await service.isHandleAvailable('taken.dev.opnmt.me');

      expect(result).toBe(false);
    });
  });

  describe('retry behavior', () => {
    it('should retry on 5xx errors', async () => {
      const serverError: AxiosError = {
        isAxiosError: true,
        response: {
          data: { error: 'InternalServerError' },
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 500',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      const successResponse: AxiosResponse = {
        data: {
          did: 'did:plc:abc123',
          handle: 'alice.dev.opnmt.me',
          accessJwt: 'access-token',
          refreshJwt: 'refresh-token',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      // Fail twice, then succeed
      httpService.post
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(throwError(() => serverError))
        .mockReturnValueOnce(of(successResponse));

      const result = await service.createSession('alice.dev.opnmt.me', 'pass');

      expect(result.did).toBe('did:plc:abc123');
      expect(httpService.post).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should not retry on 4xx errors (except 429)', async () => {
      const clientError: AxiosError = {
        isAxiosError: true,
        response: {
          data: {
            error: 'InvalidRequest',
            message: 'Bad request',
          },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 400',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      httpService.post.mockReturnValue(throwError(() => clientError));

      await expect(
        service.createSession('alice.dev.opnmt.me', 'pass'),
      ).rejects.toThrow(PdsApiError);

      // Should only be called once (no retry)
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 rate limit errors', async () => {
      const rateLimitError: AxiosError = {
        isAxiosError: true,
        response: {
          data: {
            error: 'RateLimitExceeded',
            message: 'Rate limit exceeded',
          },
          status: 429,
          statusText: 'Too Many Requests',
          headers: {},
          config: { headers: new AxiosHeaders() },
        },
        message: 'Request failed with status code 429',
        name: 'AxiosError',
        config: { headers: new AxiosHeaders() },
        toJSON: () => ({}),
      };

      const successResponse: AxiosResponse = {
        data: {
          did: 'did:plc:abc123',
          handle: 'alice.dev.opnmt.me',
          accessJwt: 'access-token',
          refreshJwt: 'refresh-token',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      httpService.post
        .mockReturnValueOnce(throwError(() => rateLimitError))
        .mockReturnValueOnce(of(successResponse));

      const result = await service.createSession('alice.dev.opnmt.me', 'pass');

      expect(result.did).toBe('did:plc:abc123');
      expect(httpService.post).toHaveBeenCalledTimes(2);
    }, 10000);
  });
});
