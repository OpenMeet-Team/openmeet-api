import 'dotenv/config';
import {
  ClassSerializerInterceptor,
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
import { readFileSync } from 'fs';

async function bootstrap() {
  // Create HTTPS options using the same certs as frontend
  const httpsOptions = {
    key: readFileSync('./key.pem'), // Adjust path as needed
    cert: readFileSync('./cert.pem'), // Adjust path as needed
  };
  console.log('env:', process.env.NODE_ENV);
  const app = await NestFactory.create(AppModule, {
    httpsOptions:
      process.env.NODE_ENV === 'development' ? httpsOptions : undefined,
  });
  ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

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
  app.enableCors({
    origin: 'https://local.openmeet.net:9005', // Exact origin of your UI
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
    credentials: true,
  });

  // // If you're using global prefix, make sure it's after CORS
  // app.setGlobalPrefix('api');

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

  await app.listen(
    configService.getOrThrow('app.port', { infer: true }),
    '0.0.0.0',
  );
}
void bootstrap();
