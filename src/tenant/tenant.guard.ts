import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

// Define a custom decorator key to mark routes to bypass the guard
export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();

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
    // You can add additional validation logic for tenant ID here if needed

    // Optionally store tenant ID in the request object for further use
    request['tenantId'] = tenantId;
    return true;
  }
}
