import { Module, forwardRef } from '@nestjs/common';
import { AtprotoEnrichmentService } from './atproto-enrichment.service';
import { TenantModule } from '../tenant/tenant.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

@Module({
  imports: [TenantModule, forwardRef(() => BlueskyModule)],
  providers: [AtprotoEnrichmentService],
  exports: [AtprotoEnrichmentService],
})
export class AtprotoEnrichmentModule {}
