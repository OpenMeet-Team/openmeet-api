import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../../shared/guard/permissions.decorator';
import { UserService } from '../../user/user.service';

export interface PermissionRequirement {
  context: 'event' | 'group' | 'user';
  permissions: string[];
}

/**
 * MessagingPermissionsGuard - A permissions guard for messaging that doesn't depend on AuthService
 * to avoid circular dependencies between MessagingModule and AuthModule
 */
@Injectable()
export class MessagingPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private userService: UserService, // Use UserService instead of AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.get<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!requirements) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Get user with permissions from UserService instead of AuthService
    const userWithPermissions = await this.userService.findById(user.id);
    if (!userWithPermissions) {
      throw new UnauthorizedException('User not found');
    }

    // Check permissions using the same logic as original PermissionsGuard
    for (const requirement of requirements) {
      const hasRequiredPermissions = await this.checkPermissions(
        userWithPermissions,
        requirement,
        request,
      );

      if (!hasRequiredPermissions) {
        throw new ForbiddenException(
          `Missing required permissions: ${requirement.permissions.join(', ')} for context: ${requirement.context}`,
        );
      }
    }

    return true;
  }

  private async checkPermissions(
    user: any,
    requirement: PermissionRequirement,
    _request: Request,
  ): Promise<boolean> {
    // This is a simplified version - you may need to implement the full permission logic
    // based on your specific permission system

    // For now, return true if user has any admin role
    // You can enhance this to match your specific permission checking logic
    const userPermissions = user.role?.permissions || [];

    return await requirement.permissions.some((permission) =>
      userPermissions.includes(permission),
    );
  }
}
