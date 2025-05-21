// permissions.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { Request } from 'express';
import { PERMISSIONS_KEY } from './permissions.decorator';

export interface PermissionRequirement {
  context: 'event' | 'group' | 'user';
  permissions: string[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // get permissions as decorated on the controller function
    const requirements = this.reflector.get<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    // if no permissions are required, allow access
    if (!requirements) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    if (!user) {
      // throw new ForbiddenException('PermissionsGuard: User not authenticated');
      throw new UnauthorizedException(
        'PermissionsGuard: User not authenticated',
      );
    }

    // Check each requirement - ALL must pass
    for (const requirement of requirements) {
      await this.checkContextPermissions(requirement, user, request);
      // If checkContextPermissions doesn't throw, this requirement passed
    }

    // Only return true if ALL requirements have been checked and passed
    return true;
  }

  private async checkContextPermissions(
    requirement: PermissionRequirement,
    user: any,
    request: Request,
  ): Promise<void> {
    const { context, permissions } = requirement;

    switch (context) {
      case 'event': {
        const eventSlug = (request.headers['x-event-slug'] ||
          request.params.slug) as string;

        // Get the event first to check if it's associated with a group
        const event = await this.authService.getEvent(eventSlug);
        if (!event) {
          throw new ForbiddenException('Event not found');
        }

        // Check if the user is an attendee with necessary permissions
        const eventAttendee = await this.authService.getEventAttendeeBySlug(
          user.id,
          eventSlug,
        );

        // Check attendee permissions if the user is an attendee
        if (eventAttendee) {
          const hasAttendeePermissions = this.hasRequiredPermissions(
            eventAttendee.role?.permissions || [],
            permissions,
          );

          if (hasAttendeePermissions) {
            // User has required permissions as an attendee
            return;
          }
        }

        // If the event is associated with a group, check group permissions
        if (event.group && event.group.id) {
          // Log event group information for debugging
          console.log(
            `Event ${event.slug} has group: ${event.group.slug || event.group.id}`,
          );

          // If the user has group permission, they can manage the event
          try {
            // Find this specific user's membership in the event's group
            const groupMember = await this.authService.getGroupMemberByUserId(
              user.id,
              event.group.id,
            );

            if (
              groupMember &&
              groupMember.groupRole &&
              groupMember.groupRole.groupPermissions
            ) {
              // Check if user has the group-level permission for managing events
              const hasManageEventsPermission = this.hasRequiredPermissions(
                groupMember.groupRole.groupPermissions,
                ['MANAGE_EVENTS'], // Group permission to manage events
              );

              if (hasManageEventsPermission) {
                // User has group-level permission to manage the event
                return;
              }
            }
          } catch (error) {
            // Log the error but continue with other permission checks
            console.error('Error checking group permissions:', error);
          }
        }

        // If we reach here, the user doesn't have permissions through attendance or group roles
        // Check if user is the event owner as a last resort
        if (event.user && event.user.id === user.id) {
          return; // Event owner has all permissions
        }

        // No permissions through any avenue
        throw new ForbiddenException(
          'PermissionsGuard: Insufficient permissions',
        );
        break;
      }

      case 'group': {
        const groupSlug = (request.headers['x-group-slug'] ||
          request.params.groupSlug) as string;
        const groupMembers = await this.authService.getGroupMembersBySlug(
          user.id,
          groupSlug,
        );
        if (!groupMembers?.[0]) {
          throw new ForbiddenException('Insufficient permissions');
        }

        const hasPermissions = this.hasRequiredPermissions(
          groupMembers[0].groupRole.groupPermissions,
          permissions,
        );
        if (!hasPermissions) {
          throw new ForbiddenException('Insufficient permissions');
        }
        break;
      }

      case 'user': {
        const userPermissions = await this.authService.getUserPermissions(
          user.id,
        );
        const hasPermissions = this.hasRequiredPermissions(
          userPermissions,
          permissions,
        );
        if (!hasPermissions) {
          throw new ForbiddenException('Insufficient permissions');
        }
        break;
      }
    }
  }

  private hasRequiredPermissions(
    userPermissions: any[],
    requiredPermissions: string[],
  ): boolean {
    if (!userPermissions || !Array.isArray(userPermissions)) {
      console.log('No user permissions provided or not an array');
      return false;
    }

    // Log what permissions we're checking
    console.log(
      `Checking permissions: Required=${JSON.stringify(requiredPermissions)}, User has=${JSON.stringify(userPermissions.map((p) => p.name))}`,
    );

    const result = requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );

    console.log(`Permission check result: ${result ? 'GRANTED' : 'DENIED'}`);
    return result;
  }
}
