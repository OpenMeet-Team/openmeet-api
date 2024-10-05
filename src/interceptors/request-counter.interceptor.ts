import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class RequestCounterInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private counter: Counter<string>,
  ) {}
  private requestCount = 0;

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    this.counter.inc();
    // await this.counter.get().then((result) => {
    //   console.log(`Total requests: ${result.values[0].value}`);
    // });

    return new Promise((resolve) => resolve(next.handle()));
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}
