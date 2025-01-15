// api/src/tenant/tests/tenant.guard.spec.ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantGuard } from './tenant.guard';
import { Request } from 'express';
import { HttpArgumentsHost } from '@nestjs/common/interfaces';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  const mockExecutionContext = (request: Partial<Request>): ExecutionContext => {
    const http: HttpArgumentsHost = {
      getRequest<T = any>(): T {
        return {
          ...request,
          route: request.route || { path: '/api/some-endpoint' }
        } as T;
      },
      getResponse<T = any>(): T {
        return {} as T;
      },
      getNext<T = any>(): T {
        return (() => {}) as T;
      }
    };

    return {
      switchToHttp: () => http,
      getHandler: () => jest.fn() as Function,
      getClass: () => TenantGuard as any,
      getType: () => 'http' as const,
      getArgs: () => [] as any[],
      getArgByIndex: () => undefined,
      switchToRpc: () => { throw new Error('Not implemented'); },
      switchToWs: () => { throw new Error('Not implemented'); }
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue(false)
          },
        },
      ],
    }).compile();

    guard = module.get<TenantGuard>(TenantGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('canActivate', () => {
    it('should allow access to metrics endpoint', () => {
      const context = mockExecutionContext({
        route: { path: '/metrics' },
        headers: {}
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when tenant ID is missing', () => {
      const context = mockExecutionContext({
        headers: {}
      });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Tenant ID is required')
      );
    });

    it('should throw UnauthorizedException when tenant ID is empty', () => {
      const context = mockExecutionContext({
        headers: { 'x-tenant-id': '' }
      });

      expect(() => guard.canActivate(context)).toThrow(
        new UnauthorizedException('Tenant ID is required')
      );
    });

    it('should allow access when valid tenant ID is provided', () => {
      const context = mockExecutionContext({
        headers: { 'x-tenant-id': 'valid-tenant' }
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow access when endpoint is marked as public', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      
      const context = mockExecutionContext({
        headers: {}
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should use tenantId from query params if header is missing', () => {
      const context = mockExecutionContext({
        headers: {},
        query: { tenantId: 'query-tenant' }
      });

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
