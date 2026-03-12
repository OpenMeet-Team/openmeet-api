import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class OAuthLinkHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap((body) => {
        if (this.hasNeedsOAuthLink(body)) {
          response.setHeader('X-Needs-OAuth-Link', 'true');
        }
      }),
    );
  }

  private hasNeedsOAuthLink(body: unknown): boolean {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }

    const obj = body as Record<string, unknown>;

    // Check top level
    if (obj.needsOAuthLink === true) {
      return true;
    }

    // Check one level deep
    for (const value of Object.values(obj)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>).needsOAuthLink === true
      ) {
        return true;
      }
    }

    return false;
  }
}
