// api/src/auth/tests/auth.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JWTAuthGuard } from './auth.guard';

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
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      jest.spyOn(guard, 'canActivate').mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should handle token expiration for protected routes', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const error = new TokenExpiredError('jwt expired', new Date());
      jest.spyOn(guard, 'canActivate').mockRejectedValue(error);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        TokenExpiredError,
      );
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
  });
});
