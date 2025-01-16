import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_TENANT_PUBLIC_KEY } from '../core/constants/constant';
import { tenantStorage } from '../tracing/tenant-span-processor';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_TENANT_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.route.path;

    // Skip tenant check for metrics endpoint
    if (path === '/metrics') {
      return true;
    }

    const tenantId = String(
      request.headers['x-tenant-id'] || request.query?.tenantId || '',
    ).trim();

    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required');
    }

    // Set the tenantId on the request object
    (request as any).tenantId = tenantId;

    // Store tenant ID in the AsyncLocalStorage for tracing
    tenantStorage.run(tenantId, () => {
      return true;
    });

    return true;
  }
}
