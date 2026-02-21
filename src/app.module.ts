import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { FileModule } from './file/file.module';
import { AuthModule } from './auth/auth.module';
import databaseConfig from './database/config/database.config';
import authConfig from './auth/config/auth.config';
import appConfig from './config/app.config';
import mailConfig from './mail/config/mail.config';
import fileConfig from './file/config/file.config';
import facebookConfig from './auth-facebook/config/facebook.config';
import googleConfig from './auth-google/config/google.config';
import githubConfig from './auth-github/config/github.config';
import blueskyConfig from './auth-bluesky/config/bluesky.config';
import pdsConfig from './pds/config/pds.config';
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
import { EventModule } from './event/event.module';
import { APP_GUARD } from '@nestjs/core';
import { TenantGuard } from './tenant/tenant.guard';
import { ThrottlerModule } from '@nestjs/throttler';
import { MultiLayerThrottlerGuard } from './auth/guards/multi-layer-throttler.guard';
import { ElastiCacheModule } from './elasticache/elasticache.module';
import { CategoryModule } from './category/category.module';
import { GroupModule } from './group/group.module';
import { SubCategoryModule } from './sub-category/sub-category.module';
import { GroupMemberModule } from './group-member/group-member.module';
import { EventAttendeeModule } from './event-attendee/event-attendee.module';
import { HealthModule } from './health/health.module';
import { GroupRoleModule } from './group-role/group-role.module';
import { RoleModule } from './role/role.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthGithubModule } from './auth-github/auth-github.module';
import { GroupMailModule } from './group-mail/group-mail.module';
import { EventMailModule } from './event-mail/event-mail.module';
import { AuthBlueskyModule } from './auth-bluesky/auth-bluesky.module';
import { AuditLoggerService } from './logger/audit-logger.provider';
import { TracingModule } from './tracing/tracing.module';
import { BlueskyModule } from './bluesky/bluesky.module';
import { MatrixModule } from './matrix/matrix.module';
import { EventSeriesModule } from './event-series/event-series.module';
import { MetricsModule } from './metrics/metrics.module';
import { InterceptorsModule } from './core/interceptors.module';
import { DatabaseMetricsModule } from './database/database-metrics.module';
import { ShadowAccountModule } from './shadow-account/shadow-account.module';
import { CalendarSourceModule } from './calendar-source/calendar-source.module';
import { CalendarFeedModule } from './calendar-feed/calendar-feed.module';
import { ExternalCalendarModule } from './external-calendar/external-calendar.module';
import { SitemapModule } from './sitemap/sitemap.module';
import { OidcModule } from './oidc/oidc.module';
import { ActivityFeedModule } from './activity-feed/activity-feed.module';
import { MetaModule } from './meta/meta.module';
import { EmbedModule } from './embed/embed.module';
import { TestHelpersModule } from './test-helpers/test-helpers.module';
import { PdsModule } from './pds/pds.module';
import { DidWebModule } from './did-web/did-web.module';
import { UserAtprotoIdentityModule } from './user-atproto-identity/user-atproto-identity.module';
import { AtprotoIdentityModule } from './atproto-identity/atproto-identity.module';

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
        githubConfig,
        blueskyConfig,
        pdsConfig,
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
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit:
          process.env.NODE_ENV === 'production'
            ? 100 // 100 requests per minute in production
            : 10000, // Very high limit in dev/test to avoid hitting limits
      },
    ]),
    ElastiCacheModule,
    HealthModule,
    TracingModule,
    MetricsModule,
    DatabaseMetricsModule,
    InterceptorsModule,
    // It's important that UserModule comes before MatrixModule to ensure it's initialized first
    UserModule,
    FileModule,
    AuthModule,
    AuthFacebookModule,
    AuthGoogleModule,
    AuthGithubModule,
    SessionModule,
    MailModule,
    MailerModule,
    HomeModule,
    TenantModule,
    EventModule,
    CategoryModule,
    GroupModule,
    ActivityFeedModule,
    SubCategoryModule,
    GroupMemberModule,
    EventAttendeeModule,
    GroupRoleModule,
    RoleModule,
    // ChatModule removed - Matrix Application Service handles rooms directly
    GroupMailModule,
    EventMailModule,
    AuthBlueskyModule,
    ShadowAccountModule,
    BlueskyModule,
    MatrixModule,
    EventSeriesModule,
    CalendarSourceModule,
    CalendarFeedModule,
    ExternalCalendarModule,
    SitemapModule,
    OidcModule,
    MetaModule,
    EmbedModule,
    PdsModule,
    DidWebModule,
    UserAtprotoIdentityModule,
    AtprotoIdentityModule,
    // Conditionally import test helpers only in non-production environments
    ...(process.env.NODE_ENV !== 'production' ? [TestHelpersModule] : []),
  ],
  providers: [
    TenantConnectionService,
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MultiLayerThrottlerGuard,
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
