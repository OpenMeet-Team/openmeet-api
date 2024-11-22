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
    let userPermissions;
    if (groupSlug) {
      userPermissions = await this.getGroupPermissions(user.id, groupSlug);
    } else if (eventSlug) {
      userPermissions = await this.getEventPermissions(user.id, eventSlug);
    } else {
      userPermissions = await this.getUserPermissions(user.id);
    }

    // Check if user has all required permissions
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private async getUserPermissions(userId: number): Promise<Set<string>> {
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

    if (!groupMember) {
      // User is not a member of the group
      return groupPermissions;
    }

    // Fetch user-specific group permissions
    const userGroupPermissions =
      await this.authService.getGroupMemberPermissions(userId, group.id);

    // Map of permission name to granted status
    const userGroupPermissionsMap = new Map<string, boolean>();
    userGroupPermissions.forEach((ugp) => {
      userGroupPermissionsMap.set(ugp.groupPermission.name, true);
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

    if (!eventAttendee) {
      return eventPermissions;
    }
    const attendeePermissions = await this.authService.getAttendeePermissions(
      eventAttendee.id,
    );

    const attendeePermissionsMap = new Map<string, boolean>();
    attendeePermissions.forEach((ap) => {
      attendeePermissionsMap.set(ap.role.permission.name, true);
    });

    attendeePermissionsMap.forEach((granted, permNane) => {
      if (granted) {
        eventPermissions.add(permNane);
      } else {
        eventPermissions.delete(permNane);
      }
    });
    return eventPermissions;
  }
}
