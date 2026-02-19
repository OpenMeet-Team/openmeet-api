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
import { getBuildInfo } from './utils/version';
import cookieParser from 'cookie-parser';

// Add direct console.log for startup debugging - these will show even before logger is configured
const startupLog = (message: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[STARTUP] ${timestamp} - ${message}`);
};

async function bootstrap() {
  startupLog('Bootstrap starting - creating NestJS application');
  try {
    const app = await NestFactory.create(AppModule, {
      bufferLogs: false, // Changed from true to false to output logs immediately
    });

    // Embed routes: permissive CORS (any origin, no credentials)
    // Must be registered before global CORS so OPTIONS preflights are handled correctly
    app.use(
      '/api/embed',
      (
        req: import('express').Request,
        res: import('express').Response,
        next: import('express').NextFunction,
      ) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, X-Tenant-ID, x-tenant-id',
        );
        if (req.method === 'OPTIONS') {
          res.status(204).end();
          return;
        }
        next();
      },
    );

    // Global CORS for all other routes (credentials-based with origin allowlist)
    // Additional origins can be added via CORS_ADDITIONAL_ORIGINS env var (comma-separated)
    const additionalOrigins = process.env.CORS_ADDITIONAL_ORIGINS
      ? process.env.CORS_ADDITIONAL_ORIGINS.split(',').map((s) => s.trim())
      : [];
    app.enableCors({
      origin: [
        'http://localhost:9005',
        'https://localhost:9005',
        'http://localhost:8087',
        'https://localhost:8087',
        'https://localhost', // Capacitor Android
        'capacitor://localhost', // Capacitor iOS
        'https://api.dev.openmeet.net',
        'https://platform.openmeet.net',
        'https://platform-dev.openmeet.net',
        'https://platform.dev.openmeet.net',
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
        ...additionalOrigins,
      ],
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-ID',
        'x-group-slug',
        'x-event-slug',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    });
    startupLog('NestJS application created successfully');

    // Choose logger based on environment
    const logger =
      process.env.NODE_ENV === 'production'
        ? new ConsoleLogger() // Use our simple logger in production
        : new ConsoleLogger(); // Use built-in logger in development

    // Set log levels
    logger.setLogLevels(
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log', 'debug']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
    );

    // Set the logger as the global logger
    app.useLogger(logger);
    startupLog('Logger configured');

    startupLog('Setting up ContextIdFactory');
    ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    const configService = app.get(ConfigService<AllConfigType>);
    startupLog('ContextIdFactory setup complete');

    // Configure cookie parser for OIDC authentication
    startupLog('Configuring cookie parser for OIDC');
    app.use(cookieParser());
    startupLog('Cookie parser configured');

    // Enable shutdown hooks for graceful termination
    startupLog('Enabling shutdown hooks');
    app.enableShutdownHooks();
    startupLog('Shutdown hooks enabled');

    startupLog('Configuring global prefix and versioning');
    const apiPrefix = configService.getOrThrow('app.apiPrefix', {
      infer: true,
    });
    app.setGlobalPrefix(
      configService.getOrThrow('app.apiPrefix', { infer: true }),
      {
        exclude: ['/', '/sitemap.xml'],
      },
    );
    app.enableVersioning({
      type: VersioningType.URI,
    });
    startupLog('Global prefix and versioning configured');

    startupLog('Setting up global pipes and interceptors');
    app.useGlobalPipes(new ValidationPipe(validationOptions));
    app.useGlobalInterceptors(
      // ResolvePromisesInterceptor is used to resolve promises in responses because class-transformer can't do it
      // https://github.com/typestack/class-transformer/issues/549
      new ResolvePromisesInterceptor(),
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    startupLog('Global pipes and interceptors configured');

    startupLog('Setting up Swagger documentation');
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

    startupLog('Building Swagger document');
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
    startupLog('Setting up Swagger endpoint');
    SwaggerModule.setup('docs', app, document);
    startupLog('Swagger documentation configured');

    startupLog('Setting up health endpoints');
    // Exclude health check endpoints from global prefix
    app.setGlobalPrefix(
      configService.getOrThrow('app.apiPrefix', { infer: true }),
      {
        exclude: [
          '/health/liveness',
          '/health/readiness',
          '/metrics',
          '/',
          '/sitemap.xml',
          '/oidc/.well-known/openid-configuration',
        ],
      },
    );
    startupLog('Health and metrics endpoints configured');

    startupLog('Setting up global guards');
    app.useGlobalGuards(new TenantGuard(app.get(Reflector)));
    startupLog('Global guards configured');

    // The RequestCounterInterceptor is now registered through APP_INTERCEPTOR in InterceptorsModule
    // so we don't need to manually add it here anymore
    startupLog(
      'Using globally registered interceptors from InterceptorsModule',
    );

    // WebSocket adapter removed for performance optimization
    startupLog(
      'WebSocket adapter removed - using Matrix client for real-time events',
    );

    // Add proper signal handlers for clean shutdown
    startupLog('Starting HTTP server');
    try {
      const port = configService.getOrThrow('app.port', { infer: true });
      startupLog(`Attempting to listen on port ${port}`);

      // Set a timeout to detect hangs
      const serverStartTimeout = setTimeout(() => {
        startupLog(
          'WARNING: HTTP server startup is taking longer than 10 seconds. Possible hang detected.',
        );
      }, 10000);

      // Explicitly bind to 0.0.0.0 (all interfaces) to avoid DNS resolution issues
      startupLog('Binding to 0.0.0.0:' + port);
      const server = await app.listen(port, '0.0.0.0', () => {
        startupLog('HTTP server listen callback triggered');
      });

      // Clear the timeout if we successfully started
      clearTimeout(serverStartTimeout);

      startupLog(`HTTP server started successfully on port ${port}`);

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

      return server;
    } catch (error) {
      startupLog(`ERROR starting HTTP server: ${error.message}`);
      startupLog(`Error stack: ${error.stack}`);
      throw error;
    }
  } catch (error) {
    startupLog(`Bootstrap error: ${error.message}`);
    startupLog(`Error stack: ${error.stack}`);
    throw error;
  }
}

// We need to handle errors from bootstrap() to ensure proper process exit
bootstrap().catch((err) => {
  console.error('Error during bootstrap:', err);
  process.exit(1);
});
