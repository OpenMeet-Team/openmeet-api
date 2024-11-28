import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../core/constants/constant';

@Injectable()
export class JWTAuthGuard extends PassportAuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    try {
      const canActivate = await super.canActivate(context);

      // For public routes, we don't care about the authentication result
      if (isPublic) {
        return true;
      }

      return canActivate as boolean;
    } catch (error) {
      // For public routes, allow access even if auth fails
      if (isPublic) {
        return true;
      }

      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      }

      throw error;
    }
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // For public routes, we still want to attach the user if available
    if (isPublic) {
      request.user = user || null;
      return user as TUser;
    }

    // Handle specific token errors
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException('Token expired');
    }

    // For protected routes, we require valid authentication
    if (err || !user) {
      throw new UnauthorizedException(err?.message || 'Invalid token');
    }

    request.user = user;
    return user;
  }
}
