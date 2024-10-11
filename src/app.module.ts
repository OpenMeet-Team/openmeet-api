import { Module, Scope } from '@nestjs/common';
import { UsersModule } from './user/user.module';
import { FilesModule } from './file/file.module';
import { AuthModule } from './auth/auth.module';
import databaseConfig from './database/config/database.config';
import authConfig from './auth/config/auth.config';
import appConfig from './config/app.config';
import mailConfig from './mail/config/mail.config';
import fileConfig from './file/config/file.config';
import facebookConfig from './auth-facebook/config/facebook.config';
import googleConfig from './auth-google/config/google.config';
import path from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthFacebookModule } from './auth-facebook/auth-facebook.module';
import { AuthGoogleModule } from './auth-google/auth-google.module';
import { I18nModule } from 'nestjs-i18n/dist/i18n.module';
import { HeaderResolver } from 'nestjs-i18n';
import { TypeOrmConfigService } from './database/typeorm-config.service';
import { MailModule } from './mail/mail.module';
import { HomeModule } from './home/home.module';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AllConfigType } from './config/config.type';
import { SessionModule } from './session/session.module';
import { MailerModule } from './mailer/mailer.module';
import { TenantConnectionService } from './tenant/tenant.service';
import { TenantModule } from './tenant/tenant.module';
import { EventsModule } from './event/event.module';
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './tenant/tenant.guard';
import { CategoryModule } from './category/category.module';
import { GroupModule } from './group/group.module';
import { SubCategoryModule } from './sub-category/sub-category.module';
import { PermissionsGuard } from './shared/guard/permissions.guard';
import { GroupMemberModule } from './group-member/group-member.module';
import { EventAttendeeModule } from './event-attendee/event-attendee.module';
import { HealthModule } from './health/health.module';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { RequestCounterInterceptor } from './interceptors/request-counter.interceptor';

const infrastructureDatabaseModule = TypeOrmModule.forRootAsync({
  useClass: TypeOrmConfigService,
  dataSourceFactory: async (options: DataSourceOptions) => {
    return new DataSource(options).initialize();
  },
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        authConfig,
        appConfig,
        mailConfig,
        fileConfig,
        facebookConfig,
        googleConfig,
      ],
      envFilePath: ['.env'],
    }),
    infrastructureDatabaseModule,
    I18nModule.forRootAsync({
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        fallbackLanguage: configService.getOrThrow('app.fallbackLanguage', {
          infer: true,
        }),
        loaderOptions: { path: path.join(__dirname, '/i18n/'), watch: true },
      }),
      resolvers: [
        {
          use: HeaderResolver,
          useFactory: (configService: ConfigService<AllConfigType>) => {
            return [
              configService.get('app.headerLanguage', {
                infer: true,
              }),
            ];
          },
          inject: [ConfigService],
        },
      ],
      imports: [ConfigModule],
      inject: [ConfigService],
    }),

    PrometheusModule.register(),
    UsersModule,
    FilesModule,
    AuthModule,
    AuthFacebookModule,
    AuthGoogleModule,
    SessionModule,
    MailModule,
    MailerModule,
    HomeModule,
    TenantModule,
    EventsModule,
    CategoryModule,
    GroupModule,
    SubCategoryModule,
    GroupMemberModule,
    EventAttendeeModule,
    HealthModule,
  ],
  providers: [
    TenantConnectionService,
    {
      provide: APP_GUARD,
      useClass: TenantGuard, // Registered TenantGuard globally
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
      scope: Scope.REQUEST,
      durable: true,
    },
    RequestCounterInterceptor,
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
    }),
  ],
})
export class AppModule {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    // Ensure that TenantConnectionService is instantiated when the application starts
    // This ensures the onModuleInit hook is triggered
  }
}
