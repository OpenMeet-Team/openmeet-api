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

    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );

    if (!requiredPermissions) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user && isPublic) {
      return true;
    }

    const groupSlug = request.headers['x-group-slug'];
    const eventSlug = request.headers['x-event-slug'];
    let userPermissions: Set<string>;

    if (groupSlug) {
      console.log('groupSlug', groupSlug);
      userPermissions = await this.getGroupPermissions(user.id, groupSlug);
    } else if (eventSlug) {
      console.log('eventSlug', eventSlug);
      userPermissions = await this.getEventPermissions(user.id, eventSlug);
    } else {
      console.log('no groupSlug or eventSlug');
      userPermissions = await this.getRolePermissions(user.id);
    }

    // Check if user has all required permissions
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );
    console.log(
      'userPermissions',
      userPermissions,
      'has permissions',
      hasPermission,
      'requires permissions',
      requiredPermissions,
    );
    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private async getRolePermissions(userId: number): Promise<Set<string>> {
    const permissions = new Set<string>();

    // Get user with role and role permissions
    const user = await this.authService.getUserWithRolePermissions(userId);

    if (!user?.role?.permissions) {
      return permissions;
    }

    user.role.permissions.forEach((permission) => {
      permissions.add(permission.name);
    });

    return permissions;
  }

  private async getGroupPermissions(
    userId: number,
    groupSlug: string,
  ): Promise<Set<string>> {
    const groupPermissions = new Set<string>();

    const group = await this.authService.getGroup(groupSlug);

    // Fetch the user's group membership
    const groupMember = await this.authService.getGroupMembers(
      userId,
      group.id,
    );

    if (!groupMember?.[0]?.groupRole?.groupPermissions) {
      return groupPermissions;
    }

    // Add role permissions to set
    groupMember[0].groupRole.groupPermissions.forEach((permission) => {
      groupPermissions.add(permission.name);
    });

    return groupPermissions;
  }

  private async getEventPermissions(
    userId: number,
    eventSlug: string,
  ): Promise<Set<string>> {
    const eventPermissions = new Set<string>();
    const event = await this.authService.getEvent(eventSlug);

    const eventAttendee = await this.authService.getEventAttendees(
      event.id,
      userId,
    );

    if (!eventAttendee?.role?.permissions) {
      return eventPermissions;
    }

    // Add role permissions to set
    eventAttendee.role.permissions.forEach((permission) => {
      eventPermissions.add(permission.name);
    });

    return eventPermissions;
  }
}
