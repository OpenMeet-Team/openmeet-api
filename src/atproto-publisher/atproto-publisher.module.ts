import { Module, forwardRef } from '@nestjs/common';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { PdsModule } from '../pds/pds.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { AtprotoIdentityModule } from '../atproto-identity/atproto-identity.module';
import { TenantModule } from '../tenant/tenant.module';

/**
 * Module for publishing events and RSVPs to AT Protocol (user's PDS).
 *
 * Design: "PDS first, fail fast" — writes to PDS fail immediately
 * if unavailable. No background retry; callers handle errors.
 */
@Module({
  imports: [
    PdsModule,
    forwardRef(() => BlueskyModule),
    AtprotoIdentityModule,
    TenantModule,
  ],
  providers: [AtprotoPublisherService],
  exports: [AtprotoPublisherService],
})
export class AtprotoPublisherModule {}
