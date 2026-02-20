import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AtprotoServiceAuthService } from './atproto-service-auth.service';
import { UserAtprotoIdentityService } from '../../user-atproto-identity/user-atproto-identity.service';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';

// Mock @atproto/identity
jest.mock('@atproto/identity', () => ({
  IdResolver: jest.fn().mockImplementation(() => ({
    did: {
      resolveAtprotoData: jest.fn(),
    },
  })),
}));

// Mock @atproto/crypto
jest.mock('@atproto/crypto', () => ({
  verifySignature: jest.fn(),
}));

describe('AtprotoServiceAuthService', () => {
  let service: AtprotoServiceAuthService;
  let mockConfigService: { get: jest.Mock };
  let mockIdentityService: { findByDid: jest.Mock };
  let mockAuthService: { createLoginSession: jest.Mock };
  let mockUserService: { findByUlid: jest.Mock };

  // Helper: create a JWT with given claims
  function makeJwt(
    header: object,
    payload: object,
    signature = 'fakesig',
  ): string {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = Buffer.from(signature).toString('base64url');
    return `${h}.${p}.${s}`;
  }

  const validHeader = { alg: 'ES256K', typ: 'JWT' };
  const validPayload = {
    iss: 'did:plc:testuser123',
    aud: 'did:web:api.openmeet.net',
    lxm: 'net.openmeet.auth',
    exp: Math.floor(Date.now() / 1000) + 300, // 5 min in future
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
        if (key === 'DID_PLC_URL') return undefined;
        return undefined;
      }),
    };

    mockIdentityService = {
      findByDid: jest.fn(),
    };

    mockAuthService = {
      createLoginSession: jest.fn(),
    };

    mockUserService = {
      findByUlid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoServiceAuthService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockIdentityService,
        },
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<AtprotoServiceAuthService>(AtprotoServiceAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyAndExchange', () => {
    it('should reject a malformed JWT (not 3 parts)', async () => {
      await expect(
        service.verifyAndExchange('not-a-jwt', 'tenant1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a JWT with invalid base64 payload', async () => {
      await expect(
        service.verifyAndExchange('a.!!!.c', 'tenant1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a JWT with wrong audience', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        aud: 'did:web:wrong-service.com',
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a JWT with wrong lxm', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        lxm: 'com.atproto.wrong.method',
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an expired JWT', async () => {
      const token = makeJwt(validHeader, {
        ...validPayload,
        exp: Math.floor(Date.now() / 1000) - 60, // 1 min in past
      });

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a JWT missing iss claim', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { iss: _iss, ...noIss } = validPayload;
      const token = makeJwt(validHeader, noIss);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when DID resolution fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      IdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest
            .fn()
            .mockRejectedValue(new Error('DID not found')),
        },
      }));

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject when signature verification fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      IdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifySignature } = require('@atproto/crypto');
      verifySignature.mockResolvedValue(false);

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return 404 when no user found for DID', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      IdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifySignature } = require('@atproto/crypto');
      verifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue(null);

      const token = makeJwt(validHeader, validPayload);

      await expect(service.verifyAndExchange(token, 'tenant1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should pass DID_PLC_URL to IdResolver when configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SERVICE_DID') return 'did:web:api.openmeet.net';
        if (key === 'DID_PLC_URL') return 'https://plc.private.example.com';
        return undefined;
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      IdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifySignature } = require('@atproto/crypto');
      verifySignature.mockResolvedValue(true);

      mockIdentityService.findByDid.mockResolvedValue({
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      });

      mockUserService.findByUlid.mockResolvedValue({
        id: 1,
        ulid: 'user-ulid-123',
        slug: 'testuser',
        role: { id: 2 },
      });

      mockAuthService.createLoginSession.mockResolvedValue({
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: {},
      });

      const token = makeJwt(validHeader, validPayload);
      await service.verifyAndExchange(token, 'tenant1');

      expect(IdResolver).toHaveBeenCalledWith({
        plcUrl: 'https://plc.private.example.com',
      });
    });

    it('should return login tokens when JWT is valid and user exists', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      IdResolver.mockImplementation(() => ({
        did: {
          resolveAtprotoData: jest.fn().mockResolvedValue({
            did: 'did:plc:testuser123',
            signingKey: 'did:key:z1234mockkey',
            handle: 'test.bsky.social',
            pds: 'https://pds.example.com',
          }),
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifySignature } = require('@atproto/crypto');
      verifySignature.mockResolvedValue(true);

      const mockUser = {
        id: 1,
        ulid: 'user-ulid-123',
        slug: 'testuser',
        role: { id: 2 },
      };

      mockIdentityService.findByDid.mockResolvedValue({
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      });

      mockUserService.findByUlid.mockResolvedValue(mockUser);

      const expectedLoginResponse = {
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        tokenExpires: 12345,
        user: mockUser,
      };
      mockAuthService.createLoginSession.mockResolvedValue(
        expectedLoginResponse,
      );

      const token = makeJwt(validHeader, validPayload);
      const result = await service.verifyAndExchange(token, 'tenant1');

      expect(result).toEqual(expectedLoginResponse);
      expect(mockIdentityService.findByDid).toHaveBeenCalledWith(
        'tenant1',
        'did:plc:testuser123',
      );
      expect(mockUserService.findByUlid).toHaveBeenCalledWith(
        'user-ulid-123',
        'tenant1',
      );
      expect(mockAuthService.createLoginSession).toHaveBeenCalledWith(
        mockUser,
        'atproto-service',
        null,
        'tenant1',
      );
    });
  });
});
