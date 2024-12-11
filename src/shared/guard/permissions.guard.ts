// permissions.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
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

    // temporary bypass for testing
    return true;

    // if no permissions are required, allow access
    if (!requirements) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
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
        const eventAttendee = await this.authService.getEventAttendeeBySlug(
          user.id,
          eventSlug,
        );
        if (!eventAttendee) {
          throw new ForbiddenException('Insufficient permissions');
        }

        const hasPermissions = this.hasRequiredPermissions(
          eventAttendee.role?.permissions || [],
          permissions,
        );
        if (!hasPermissions) {
          throw new ForbiddenException('Insufficient permissions');
        }
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
      return false;
    }

    return requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );
  }
}
