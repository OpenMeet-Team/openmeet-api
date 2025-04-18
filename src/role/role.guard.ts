import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    console.log('RolesGuard canActivate');
    const roles = this.reflector.getAllAndOverride<(number | string)[]>(
      'roles',
      [context.getClass(), context.getHandler()],
    );
    console.log('roles', roles);
    if (!roles.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    console.log(
      '[DEBUG] RolesGuard - Full user object:',
      JSON.stringify(request.user),
    );
    console.log(
      '[DEBUG] RolesGuard - User role type:',
      typeof request.user?.role,
    );
    console.log('[DEBUG] RolesGuard - User role value:', request.user?.role);

    // Handle role as an object
    if (request.user?.role && typeof request.user.role === 'object') {
      const roleId = String(request.user.role.id);
      const roleName = String(request.user.role.name);

      console.log('[DEBUG] RolesGuard - Checking if roles includes:', {
        roleId,
        roleName,
      });
      console.log('[DEBUG] RolesGuard - Available roles:', roles);

      // Check if either the ID or name matches any of the required roles
      const idMatch = roles.map(String).includes(roleId);
      const nameMatch = roles.map(String).includes(roleName);

      console.log('[DEBUG] RolesGuard - ID match:', idMatch);
      console.log('[DEBUG] RolesGuard - Name match:', nameMatch);

      return idMatch || nameMatch;
    }

    // Original check as fallback
    console.log(
      'roles.map(String).includes(String(request.user?.role?.id))',
      roles.map(String).includes(String(request.user?.role?.id)),
    );
    return roles.map(String).includes(String(request.user?.role?.id));
  }
}
