import 'dotenv/config';
import {
  ClassSerializerInterceptor,
  ConsoleLogger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContextIdFactory, NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import validationOptions from './utils/validation-options';
import { AllConfigType } from './config/config.type';
import { ResolvePromisesInterceptor } from './utils/serializer.interceptor';
import { AggregateByTenantContextIdStrategy } from './strategy/tenant.strategy';
import { TenantGuard } from './tenant/tenant.guard';
import { RequestCounterInterceptor } from './interceptors/request-counter.interceptor';
import { getBuildInfo } from './utils/version';
import { SimpleLogger } from './logger/simple.logger';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    bufferLogs: true,
  });

  // Choose logger based on environment
  const logger =
    process.env.NODE_ENV === 'production'
      ? new SimpleLogger() // Use our simple logger in production
      : new ConsoleLogger(); // Use built-in logger in development

  // Set log levels
  logger.setLogLevels(
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  );

  // Set the logger as the global logger
  app.useLogger(logger);

  ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

  // Enable shutdown hooks for graceful termination
  app.enableShutdownHooks();

  const apiPrefix = configService.getOrThrow('app.apiPrefix', { infer: true });
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: ['/'],
    },
  );
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalInterceptors(
    // ResolvePromisesInterceptor is used to resolve promises in responses because class-transformer can't do it
    // https://github.com/typestack/class-transformer/issues/549
    new ResolvePromisesInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  const buildInfo = getBuildInfo();

  const options = new DocumentBuilder()
    .setTitle('OpenMeet API')
    // .setDescription('API docs')
    .setDescription(
      `
      API Documentation
      
      Version: ${buildInfo.version}
      Commit: ${buildInfo.commitHash}
      Branch: ${buildInfo.branch}
      Build Date: ${buildInfo.buildDate}
      Environment: ${buildInfo.environment}
          `,
    )
    .setVersion(`${buildInfo.version}-${buildInfo.commitHash}`)
    .setVersion('1.0')
    .addBearerAuth()
    .addGlobalParameters({
      in: 'header',
      required: false,
      name: 'x-tenant-id',
      description: 'Tenant ID',
      schema: {
        example: '1',
      },
    })
    .build();

  const document = SwaggerModule.createDocument(app, options);
  // Customize Swagger module to remove `apiPrefix` from the specified paths
  document.paths = Object.keys(document.paths).reduce((paths, path) => {
    const isHealthOrMetricsPath = [
      `/${apiPrefix}/health/liveness`,
      `/${apiPrefix}/health/readiness`,
      `/${apiPrefix}/metrics`,
    ].includes(path);
    // Remove the prefix only for specified health or metrics paths
    if (isHealthOrMetricsPath) {
      paths[path.replace(`/${apiPrefix}`, '')] = document.paths[path];
    } else {
      paths[path] = document.paths[path];
    }
    return paths;
  }, {});

  SwaggerModule.setup('docs', app, document);

  // Exclude health check endpoints from global prefix
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: ['/health/liveness', '/health/readiness', '/metrics', '/'],
    },
  );
  app.useGlobalGuards(new TenantGuard(app.get(Reflector)));

  const requestCounterInterceptor = app.get(RequestCounterInterceptor);
  app.useGlobalInterceptors(requestCounterInterceptor);

  // Use the Socket.io adapter for WebSockets
  app.useWebSocketAdapter(new IoAdapter(app));

  // Add proper signal handlers for clean shutdown
  const server = await app.listen(
    configService.getOrThrow('app.port', { infer: true }),
  );

  // Add proper signal handlers for graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, _promise) => {
    logger.error(`Unhandled Promise Rejection: ${String(reason)}`);
    // Don't exit the process here, just log the error
  });

  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`WebSocket server is running on Matrix namespace`);

  return server;
}

// We need to handle errors from bootstrap() to ensure proper process exit
bootstrap().catch((err) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});
