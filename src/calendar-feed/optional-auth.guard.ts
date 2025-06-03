import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJWTAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // If there's no authorization header, allow the request but don't set user
    if (!request.headers.authorization) {
      return true;
    }

    // If there's an authorization header, try to authenticate
    try {
      const result = await super.canActivate(context);
      return result as boolean;
    } catch {
      // If authentication fails but there was a token, deny access
      // This prevents invalid tokens from accessing private resources
      return false;
    }
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // If there's no auth header, continue without user
    if (!request.headers.authorization) {
      request.user = null;
      return null;
    }

    // If there's an error with a provided token, throw it
    if (err) {
      throw err;
    }

    // Set the authenticated user
    request.user = user;
    return user;
  }
}
