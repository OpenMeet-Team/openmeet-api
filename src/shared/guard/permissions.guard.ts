// permissions.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );
    if (!requiredPermissions) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const groupId = request.params.groupId || request.body.groupId;

    // Fetch user's permissions
    const userPermissions = await this.getUserPermissions(user.id, groupId);

    // Check if user has all required permissions
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private async getUserPermissions(
    userId: number,
    groupId?: number,
  ): Promise<Set<string>> {
    const permissions = new Set<string>();

    // Fetch user-specific permissions
    const userPermissions = await this.authService.getUserPermissions(userId);

    // Map of permission name to granted status
    const userPermissionsMap = new Map<string, boolean>();
    userPermissions.forEach((up) => {
      userPermissionsMap.set(up.permission.name, true);
    });

    // Apply user-specific permissions
    userPermissionsMap.forEach((granted, permName) => {
      if (granted) {
        permissions.add(permName);
      } else {
        permissions.delete(permName);
      }
    });

    // If groupId is provided, fetch group permissions
    if (groupId) {
      // Fetch group-specific permissions
      const groupPermissions = await this.getGroupPermissions(userId, groupId);
      groupPermissions.forEach((perm) => permissions.add(perm));
    }

    return permissions;
  }

  private async getGroupPermissions(
    userId: number,
    groupId: number,
  ): Promise<Set<string>> {
    const groupPermissions = new Set<string>();

    // Fetch the user's group membership
    const groupMember = await this.authService.getGroupMembers(userId, groupId);

    if (!groupMember) {
      // User is not a member of the group
      return groupPermissions;
    }

    // Fetch user-specific group permissions
    const userGroupPermissions =
      await this.authService.getGroupMemberPermissions(userId, groupId);

    // Map of permission name to granted status
    const userGroupPermissionsMap = new Map<string, boolean>();
    userGroupPermissions.forEach((ugp) => {
      userGroupPermissionsMap.set(ugp.groupPermission.name, ugp.granted);
    });

    // Apply user-specific group permissions
    userGroupPermissionsMap.forEach((granted, permName) => {
      if (granted) {
        groupPermissions.add(permName);
      } else {
        groupPermissions.delete(permName);
      }
    });

    return groupPermissions;
  }
}
