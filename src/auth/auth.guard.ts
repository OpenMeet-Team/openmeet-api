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
    const request = context.switchToHttp().getRequest();
    const hasAuthHeader = !!request.headers.authorization;

    // If there's an auth token, validate it regardless of route publicity
    if (hasAuthHeader) {
      try {
        const canActivate = await super.canActivate(context);
        return canActivate as boolean;
      } catch (error) {
        if (error instanceof TokenExpiredError) {
          // Clear the invalid token
          request.headers.authorization = undefined;
          // Let the client know to refresh the token
          throw new UnauthorizedException('Token has expired');
        }
        throw error;
      }
    }

    // If no auth token, check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    throw new UnauthorizedException('Authentication required');
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

    // If there's an error but the route is public, clear the auth header
    if (err && isPublic) {
      request.headers.authorization = undefined;
      request.user = null;
      return null as TUser;
    }

    // For protected routes or valid tokens, proceed as normal
    if (err || (!user && !isPublic)) {
      throw new UnauthorizedException(err?.message || 'Invalid token');
    }

    request.user = user || null;
    return user as TUser;
  }
}
