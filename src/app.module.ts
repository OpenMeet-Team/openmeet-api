import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { FileModule } from './file/file.module';
import { AuthModule } from './auth/auth.module';
import databaseConfig from './database/config/database.config';
import authConfig from './auth/config/auth.config';
import appConfig from './config/app.config';
import fileConfig from './file/config/file.config';
import facebookConfig from './auth-facebook/config/facebook.config';
import googleConfig from './auth-google/config/google.config';
import githubConfig from './auth-github/config/github.config';
import blueskyConfig from './auth-bluesky/config/bluesky.config';
import path from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthFacebookModule } from './auth-facebook/auth-facebook.module';
import { AuthGoogleModule } from './auth-google/auth-google.module';
import { I18nModule } from 'nestjs-i18n/dist/i18n.module';
import { HeaderResolver } from 'nestjs-i18n';
import { TypeOrmConfigService } from './database/typeorm-config.service';
import { HomeModule } from './home/home.module';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AllConfigType } from './config/config.type';
import { SessionModule } from './session/session.module';
import { TenantConnectionService } from './tenant/tenant.service';
import { TenantModule } from './tenant/tenant.module';
import { EventModule } from './event/event.module';
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './tenant/tenant.guard';
import { CategoryModule } from './category/category.module';
import { GroupModule } from './group/group.module';
import { SubCategoryModule } from './sub-category/sub-category.module';
import { GroupMemberModule } from './group-member/group-member.module';
import { EventAttendeeModule } from './event-attendee/event-attendee.module';
import { HealthModule } from './health/health.module';
import { GroupRoleModule } from './group-role/group-role.module';
import { RoleModule } from './role/role.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
// ZulipModule has been removed in favor of MatrixModule
import { ChatModule } from './chat/chat.module';
import { AuthGithubModule } from './auth-github/auth-github.module';
import { AuthBlueskyModule } from './auth-bluesky/auth-bluesky.module';
import { AuditLoggerService } from './logger/audit-logger.provider';
import { TracingModule } from './tracing/tracing.module';
import { BlueskyModule } from './bluesky/bluesky.module';
import { MatrixModule } from './matrix/matrix.module';
import { EventSeriesModule } from './event-series/event-series.module';
import { MetricsModule } from './metrics/metrics.module';
import { InterceptorsModule } from './core/interceptors.module';
import { ShadowAccountModule } from './shadow-account/shadow-account.module';
import { MessagingModule } from './messaging/messaging.module';
import { AdminModule } from './admin/admin.module';

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
        fileConfig,
        facebookConfig,
        googleConfig,
        githubConfig,
        blueskyConfig,
      ],
      envFilePath: ['.env'],
    }),
    infrastructureDatabaseModule,
    // I18nModule temporarily disabled due to dependency issue
    // I18nModule.forRoot({
    //   fallbackLanguage: 'en',
    //   loaderOptions: {
    //     path: path.join(__dirname, '/i18n/'),
    //     watch: true,
    //   },
    //   resolvers: [HeaderResolver],
    //   logging: false,
    //   throwOnMissingKey: false,
    // }),
    EventEmitterModule.forRoot(),
    HealthModule,
    TracingModule,
    MetricsModule,
    InterceptorsModule,
    // It's important that UserModule comes before MatrixModule to ensure it's initialized first
    UserModule,
    FileModule,
    AuthModule,
    AuthFacebookModule,
    AuthGoogleModule,
    AuthGithubModule,
    SessionModule,
    HomeModule,
    TenantModule,
    EventModule,
    CategoryModule,
    GroupModule,
    SubCategoryModule,
    GroupMemberModule,
    EventAttendeeModule,
    GroupRoleModule,
    RoleModule,
    ChatModule,
    AuthBlueskyModule,
    ShadowAccountModule,
    BlueskyModule,
    MatrixModule,
    EventSeriesModule,
    MessagingModule,
    AdminModule,
  ],
  providers: [
    TenantConnectionService,
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: 'AUDIT_LOGGER',
      useValue: AuditLoggerService.getInstance(),
    },
    // Interceptors and filters are now registered in InterceptorsModule
  ],
  exports: ['AUDIT_LOGGER'],
})
export class AppModule {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    // Ensure that TenantConnectionService is instantiated when the application starts
    // This ensures the onModuleInit hook is triggered

    // Create global reference of key services
    console.log(
      'AppModule constructor initialized - registering global services',
    );
  }
}
