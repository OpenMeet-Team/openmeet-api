import { Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

@Global()
@Module({})
export class TracingModule implements OnModuleInit {
  private sdk: NodeSDK;
  private readonly logger = new Logger(TracingModule.name);

  constructor() {
    if (process.env.ENABLE_TRACING !== 'true') {
      this.logger.log('Tracing disabled');
      return;
    }

    this.logger.log('Initializing tracing');
    this.sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          process.env.OTEL_SERVICE_NAME || 'openmeet-api',
        [SemanticResourceAttributes.SERVICE_VERSION]:
          process.env.npm_package_version || '1.0.0',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      }),
      instrumentations: [
        new HttpInstrumentation({}),
        new ExpressInstrumentation(),
        new NestInstrumentation(),
        new PgInstrumentation(),
        new RedisInstrumentation(),
        ...getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable noisy fs instrumentation
          },
        }),
      ],
    });
  }

  async onModuleInit() {
    if (!this.sdk) return;

    this.logger.debug(
      'Starting tracing to endpoint: ' +
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    );
    await this.sdk.start();
  }

  async onApplicationShutdown() {
    if (!this.sdk) return;

    this.logger.debug('Shutting down tracing');
    await this.sdk.shutdown();
  }
}
