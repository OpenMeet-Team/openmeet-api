import { AsyncLocalStorage } from 'async_hooks';

export interface LoggingContext {
  userId?: string;
  eventSlug?: string;
  groupId?: string;
  action?: string;
  [key: string]: any;
}

export class LoggingContextStorage {
  private static storage = new AsyncLocalStorage<LoggingContext>();

  static get(): LoggingContext {
    return this.storage.getStore() || {};
  }

  static run(context: LoggingContext, next: () => Promise<any>) {
    return this.storage.run(context, next);
  }

  static set(context: Partial<LoggingContext>) {
    const current = this.get();
    this.storage.enterWith({ ...current, ...context });
  }
}
