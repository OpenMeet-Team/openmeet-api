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

    // Check if the route is marked as public and should bypass the guard
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // Skip guard for public routes
    }

    // Check for tenant ID in the headers
    const tenantId = request.headers['tenant-id'];
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required');
    }
    // You can add additional validation logic for tenant ID here if needed

    // Optionally store tenant ID in the request object for further use
    request['tenantId'] = tenantId;
    return true;
  }
}
