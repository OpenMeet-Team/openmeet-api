// api/src/auth/tests/auth.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JWTAuthGuard } from './auth.guard';
import { AuthGuard } from '@nestjs/passport';

describe('JWTAuthGuard', () => {
  let guard: JWTAuthGuard;
  let reflector: Reflector;

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        user: null,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        JWTAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = moduleRef.get<JWTAuthGuard>(JWTAuthGuard);
    reflector = moduleRef.get<Reflector>(Reflector);
  });

  describe('canActivate', () => {
    it('should return true for public routes', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should pass through authentication result for protected routes', async () => {
      const contextWithAuth = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer token' },
            user: null,
          }),
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockResolvedValue(true);

      const result = await guard.canActivate(contextWithAuth);
      expect(result).toBe(true);
    });

    it('should handle token expiration for protected routes', async () => {
      const contextWithAuth = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer expired-token' },
            user: null,
          }),
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockRejectedValue(new TokenExpiredError('jwt expired', new Date()));

      await expect(guard.canActivate(contextWithAuth)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should attempt token validation when auth header exists, for public route', async () => {
      const contextWithAuth = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer token' },
            user: null,
          }),
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true); // mocking public route

      // Mock the parent class's canActivate
      const superCanActivateSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockResolvedValue(true);

      await guard.canActivate(contextWithAuth);

      expect(superCanActivateSpy).toHaveBeenCalled();
    });

    it('should clear auth header and throw when token is expired on public route', async () => {
      const request = {
        headers: { authorization: 'Bearer expired-token' },
        user: null,
      };
      const contextWithExpiredToken = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true); // public route

      // Mock the parent class's canActivate method
      jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockRejectedValueOnce(
          new TokenExpiredError('jwt expired', new Date()),
        );

      await expect(guard.canActivate(contextWithExpiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(request.headers.authorization).toBeUndefined();
    });

    it('should skip token validation when no auth header exists on public route', async () => {
      const contextWithoutAuth = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            user: null,
          }),
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const superCanActivateSpy = jest.spyOn(
        AuthGuard('jwt').prototype,
        'canActivate',
      );

      const result = await guard.canActivate(contextWithoutAuth);

      expect(result).toBe(true);
      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleRequest', () => {
    it('should allow null user for public routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const request = mockContext.switchToHttp().getRequest();

      const result = guard.handleRequest(null, null, null, mockContext);

      expect(result).toBeNull();
      expect(request.user).toBeNull();
    });

    it('should throw on expired token for protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const tokenError = new TokenExpiredError('jwt expired', new Date());

      expect(() =>
        guard.handleRequest(null, null, tokenError, mockContext),
      ).toThrow(UnauthorizedException);
    });

    it('should throw on missing user for protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() => guard.handleRequest(null, null, null, mockContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('should clear auth and return null for public routes with invalid token', () => {
      const request = {
        headers: { authorization: 'Bearer invalid-token' },
        user: null,
      };
      const contextWithInvalidToken = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.handleRequest(
        new Error(),
        null,
        null,
        contextWithInvalidToken,
      );

      expect(result).toBeNull();
      expect(request.headers.authorization).toBeUndefined();
      expect(request.user).toBeNull();
    });

    it('should preserve valid token and user for public routes', () => {
      const user = { id: 1 };
      const request = {
        headers: { authorization: 'Bearer valid-token' },
        user: null,
      };
      const contextWithValidToken = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as ExecutionContext;

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.handleRequest(
        null,
        user,
        null,
        contextWithValidToken,
      );

      expect(result).toBe(user);
      expect(request.headers.authorization).toBe('Bearer valid-token');
      expect(request.user).toBe(user);
    });
  });
});
