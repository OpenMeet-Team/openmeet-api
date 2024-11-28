// api/src/tenant/tests/tenant.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantGuard } from './tenant.guard';
import { Request } from 'express';

describe('TenantGuard', () => {
  let guard: TenantGuard;
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<TenantGuard>(TenantGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const mockExecutionContext = (request: Partial<Request>) => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  };

  describe('canActivate', () => {
    it('should allow access to metrics endpoint', () => {
      const mockRequest = {
        route: { path: '/metrics' },
        headers: {},
      };

      const context = mockExecutionContext(mockRequest);
      const result = guard.canActivate({
        ...mockContext,
        ...context,
      });

      expect(result).toBe(true);
    });

    it('should allow access when valid tenant ID is provided', () => {
      const mockRequest = {
        route: { path: '/api/some-endpoint' },
        headers: {
          'x-tenant-id': 'test-tenant',
        },
      };

      const context = mockExecutionContext(mockRequest);
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest['tenantId']).toBe('test-tenant');
    });

    it('should throw UnauthorizedException when tenant ID is missing', () => {
      const mockRequest = {
        route: { path: '/api/some-endpoint' },
        headers: {},
      };

      const context = mockExecutionContext(mockRequest);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when tenant ID is empty', () => {
      const mockRequest = {
        route: { path: '/api/some-endpoint' },
        headers: {
          'x-tenant-id': '',
        },
      };

      const context = mockExecutionContext(mockRequest);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should attach tenant ID to request object', () => {
      const mockRequest = {
        route: { path: '/api/some-endpoint' },
        headers: {
          'x-tenant-id': 'test-tenant-123',
        },
      };

      const context = mockExecutionContext(mockRequest);
      guard.canActivate(context);

      expect(mockRequest['tenantId']).toBe('test-tenant-123');
    });

    it('should handle different route paths correctly', () => {
      const paths = ['/api/events', '/api/groups', '/some/other/path'];

      paths.forEach((path) => {
        const mockRequest = {
          route: { path },
          headers: {
            'x-tenant-id': 'test-tenant',
          },
        };

        const context = mockExecutionContext(mockRequest);
        const result = guard.canActivate(context);

        expect(result).toBe(true);
        expect(mockRequest['tenantId']).toBe('test-tenant');
      });
    });

    describe('error cases', () => {
      it('should throw UnauthorizedException with proper message', () => {
        const mockRequest = {
          route: { path: '/api/some-endpoint' },
          headers: {},
        };

        const context = mockExecutionContext(mockRequest);

        try {
          guard.canActivate(context);
          fail('Should have thrown UnauthorizedException');
        } catch (error) {
          expect(error).toBeInstanceOf(UnauthorizedException);
          expect(error.message).toBe('Tenant ID is required');
        }
      });
    });

    describe('tenant public decorator', () => {
      it('should allow access to public routes', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
        const result = guard.canActivate(mockContext);
        expect(result).toBe(true);
      });
    });
  });
});
