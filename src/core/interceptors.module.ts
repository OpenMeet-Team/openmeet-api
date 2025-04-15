import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { RequestCounterInterceptor } from '../interceptors/request-counter.interceptor';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * This module centralizes all application-wide interceptors and filters
 * to ensure proper dependency injection and organization.
 */
@Module({
  imports: [
    MetricsModule, // Import MetricsModule to have access to the metrics providers
  ],
  providers: [
    // Register the interceptor and filter directly
    RequestCounterInterceptor,
    GlobalExceptionFilter,

    // Register them as global providers through NestJS tokens
    {
      provide: APP_INTERCEPTOR,
      useExisting: RequestCounterInterceptor,
    },
    {
      provide: APP_FILTER,
      useExisting: GlobalExceptionFilter,
    },
  ],
  exports: [
    // Export them in case they need to be used elsewhere
    RequestCounterInterceptor,
    GlobalExceptionFilter,
  ],
})
export class InterceptorsModule {}
