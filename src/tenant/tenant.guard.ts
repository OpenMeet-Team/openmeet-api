import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_TENANT_PUBLIC_KEY } from '../core/constants/constant';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();

    const isTenantPublic = this.reflector.getAllAndOverride<boolean>(
      IS_TENANT_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isTenantPublic) {
      return true;
    }

    const path = request.route.path;
    // Allow access to the metrics endpoint
    if (path === '/metrics') {
      return true;
    }
    // Check for tenant ID in the headers
    const tenantId = request.headers['x-tenant-id'];
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required');
    }

    request['tenantId'] = tenantId;
    return true;
  }
}
