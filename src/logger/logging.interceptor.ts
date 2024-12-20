import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { LoggingContextStorage } from './logging.context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Set common context from request
    const loggingContext = {
      userId: request.user?.id,
      requestId: request.id,
      path: request.path,
      method: request.method,
    };

    return from(
      LoggingContextStorage.run(loggingContext, () =>
        next.handle().toPromise(),
      ),
    );
  }
}
