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
    const requirements = this.reflector.get<PermissionRequirement[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requirements) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    console.log('request.url', request.url);
    console.log('permissions requirements', requirements);

    if (!user) {
      return false;
    }

    // Check each context's permissions
    for (const requirement of requirements) {
      try {
        await this.checkContextPermissions(requirement, user, request);
      } catch (error) {
        console.log('error', error);
        throw error;
      }
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
        const eventSlug = request.params.slug;
        const eventAttendee = await this.authService.getEventAttendeesBySlug(
          user.id,
          eventSlug,
        );
        if (!eventAttendee?.[0]) {
          throw new ForbiddenException('Insufficient event permissions');
        }

        if (
          !this.hasRequiredPermissions(
            eventAttendee[0].role.permissions,
            permissions,
          )
        ) {
          throw new ForbiddenException('Insufficient event permissions');
        }
        break;
      }

      case 'group': {
        const groupSlug = request.params.groupSlug;
        const groupMembers = await this.authService.getGroupMembersBySlug(
          user.id,
          groupSlug,
        );
        console.log('groupMembers', groupMembers);
        if (!groupMembers?.[0]) {
          throw new ForbiddenException('Insufficient group permissions');
        }

        if (
          !this.hasRequiredPermissions(
            groupMembers[0].groupRole.groupPermissions,
            permissions,
          )
        ) {
          throw new ForbiddenException('Insufficient group permissions');
        }
        break;
      }

      case 'user': {
        const userPermissions = await this.authService.getUserPermissions(
          user.id,
        );
        if (!this.hasRequiredPermissions(userPermissions, permissions)) {
          throw new ForbiddenException('Insufficient user permissions');
        }
        break;
      }
    }
  }

  private hasRequiredPermissions(
    userPermissions: any[],
    requiredPermissions: string[],
  ): boolean {
    console.log('userPermissions', userPermissions);
    console.log('requiredPermissions', requiredPermissions);
    return requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );
  }
}
