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
import { Request } from 'express';

interface PermissionRequirement {
  context: 'event' | 'group' | 'user';
  permissions: string[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.get<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );

    if (!requirements?.length) {
      return true; // No permissions were required in the controller endpoint
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    if (!user && isPublic) {
      return true; // We're a non authenticated user and the endpoint is public
    }

    if (!user) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Check each context's permissions
    for (const requirement of requirements) {
      await this.checkContextPermissions(requirement, user, request);
    }

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
        const eventSlug: string = request.params.slug;
        const eventAttendee = await this.authService.getEventAttendeesBySlug(
          user.id,
          eventSlug,
        );
        if (!eventAttendee?.[0]) {
          throw new ForbiddenException('Insufficient permissions');
        }

        if (
          !this.hasRequiredPermissions(
            eventAttendee[0].role.permissions,
            permissions,
          )
        ) {
          throw new ForbiddenException('Insufficient permissions');
        }
        break;
      }

      case 'group': {
        const groupSlug: string = request.params.groupSlug;
        const groupMembers = await this.authService.getGroupMembersBySlug(
          user.id,
          groupSlug,
        );
        if (!groupMembers?.[0]) {
          throw new ForbiddenException('Insufficient permissions');
        }

        if (
          !this.hasRequiredPermissions(
            groupMembers[0].groupRole.groupPermissions,
            permissions,
          )
        ) {
          throw new ForbiddenException('Insufficient permissions');
        }
        break;
      }

      case 'user': {
        if (!user?.role?.permissions) {
          throw new ForbiddenException('Insufficient permissions');
        }
        if (!this.hasRequiredPermissions(user.role.permissions, permissions)) {
          throw new ForbiddenException('Insufficient permissions');
        }
        break;
      }

      default:
        throw new ForbiddenException('Invalid permission context');
    }
  }

  private hasRequiredPermissions(
    userPermissions: any[],
    requiredPermissions: string[],
  ): boolean {
    return requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );
  }
}
