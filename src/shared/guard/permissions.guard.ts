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

    // if no permissions are required, allow access
    if (!requirements) {
      console.log('canActivate: no permissions required');
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: any }>();
    const user = request.user;

    console.log('canActivate: request.method', request.method);
    console.log('canActivate: request.url', request.url);
    console.log('canActivate: permissions requirements', requirements);

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

    console.log('checkContextPermissions: context', context);

    switch (context) {
      case 'event': {
        const eventSlug = request.params.slug;
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
        const groupSlug = request.params.groupSlug;
        const groupMembers = await this.authService.getGroupMembersBySlug(
          user.id,
          groupSlug,
        );
        if (!groupMembers?.[0]) {
          console.log('canActivate: groupMembers not found');
          throw new ForbiddenException('Insufficient permissions');
        }

        const hasPermissions = this.hasRequiredPermissions(
          groupMembers[0].groupRole.groupPermissions,
          permissions,
        );
        if (!hasPermissions) {
          console.log('canActivate: groupMembers has insufficient permissions');
          throw new ForbiddenException('Insufficient permissions');
        }
        console.log('canActivate: groupMembers has sufficient permissions');
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
          console.log('canActivate: user has insufficient permissions');
          throw new ForbiddenException('Insufficient permissions');
        }
        console.log('canActivate: user has sufficient permissions');
        break;
      }
    }
  }

  private hasRequiredPermissions(
    userPermissions: any[],
    requiredPermissions: string[],
  ): boolean {
    console.log('hasRequiredPermissions: userPermissions', userPermissions);
    console.log(
      'hasRequiredPermissions: requiredPermissions',
      requiredPermissions,
    );
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return false;
    }

    return requiredPermissions.every((required) =>
      userPermissions.some((p) => p.name === required),
    );
  }
}
