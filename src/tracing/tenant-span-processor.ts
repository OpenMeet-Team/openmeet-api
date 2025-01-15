import { Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorage } from 'async_hooks';

export const tenantStorage = new AsyncLocalStorage<string>();

export class TenantSpanProcessor implements SpanProcessor {
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  onStart(span: Span): void {
    const tenantId = tenantStorage.getStore();
    if (tenantId) {
      span.setAttribute('tenant.id', tenantId);
    }
  }

  onEnd(): void {}
}
