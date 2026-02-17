import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { AtprotoSyncScheduler } from './atproto-sync-scheduler';
import { PdsModule } from '../pds/pds.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { AtprotoIdentityModule } from '../atproto-identity/atproto-identity.module';
import { TenantModule } from '../tenant/tenant.module';

/**
 * Module for publishing events and RSVPs to AT Protocol (user's PDS).
 *
 * This module provides the AtprotoPublisherService which handles:
 * - Publishing user-created events to their PDS
 * - Publishing RSVPs to the attendee's PDS
 * - Updating and deleting records on the PDS
 *
 * The AtprotoSyncScheduler runs every 5 minutes to find events with
 * unsynced local changes (updatedAt > atprotoSyncedAt) and retries
 * publishing them to ATProto.
 *
 * Design Philosophy:
 * - "PDS first, fail fast" - AT Protocol is the source of truth
 * - Individual operations fail fast (no inline retry or buffering)
 * - Periodic scanner retries events that failed to sync (AtprotoSyncScheduler)
 * - Service returns results; callers handle database updates
 *
 * Note: This is distinct from the existing Bluesky integration which handles
 * events explicitly created as "Bluesky events" (sourceType === 'bluesky').
 * This module publishes ALL public user-created events to AT Protocol.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PdsModule,
    forwardRef(() => BlueskyModule),
    AtprotoIdentityModule,
    TenantModule,
  ],
  providers: [AtprotoPublisherService, AtprotoSyncScheduler],
  exports: [AtprotoPublisherService],
})
export class AtprotoPublisherModule {}
