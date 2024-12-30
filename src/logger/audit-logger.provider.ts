import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AuditLoggerService implements LoggerService {
  private static instance: AuditLoggerService;

  static getInstance(): AuditLoggerService {
    if (!AuditLoggerService.instance) {
      AuditLoggerService.instance = new AuditLoggerService();
    }
    return AuditLoggerService.instance;
  }

  // take a message, and an context opbject, and an optional metadata object
  log(message: string, context?: any, metadata?: any) {
    console.log(
      JSON.stringify({
        type: 'audit',
        level: 'info',
        message,
        context,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  error(message: string, trace?: string, context?: string, metadata?: any) {
    console.error(
      JSON.stringify({
        type: 'audit',
        level: 'error',
        message,
        trace,
        context,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  warn(message: string, context?: string, metadata?: any) {
    console.warn(
      JSON.stringify({
        type: 'audit',
        level: 'warn',
        message,
        context,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  debug(message: string, context?: string, metadata?: any) {
    console.debug(
      JSON.stringify({
        type: 'audit',
        level: 'debug',
        message,
        context,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  verbose(message: string, context?: string, metadata?: any) {
    console.log(
      JSON.stringify({
        type: 'audit',
        level: 'verbose',
        message,
        context,
        metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

// Create a decorator for easy access
export function AuditLog() {
  return new AuditLoggerService();
}
