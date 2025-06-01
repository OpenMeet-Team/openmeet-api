import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExternalCalendarService } from './external-calendar.service';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';
import { TenantModule } from '../tenant/tenant.module';
import googleConfig from '../auth-google/config/google.config';

@Module({
  imports: [ConfigModule.forFeature(googleConfig), TenantModule],
  providers: [ExternalCalendarService, ExternalEventRepository],
  exports: [ExternalCalendarService, ExternalEventRepository],
})
export class ExternalCalendarModule {}
