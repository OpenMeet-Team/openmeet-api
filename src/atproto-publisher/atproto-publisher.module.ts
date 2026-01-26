import { Module, forwardRef } from '@nestjs/common';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { PdsModule } from '../pds/pds.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

/**
 * Module for publishing events and RSVPs to AT Protocol (user's PDS).
 *
 * This module provides the AtprotoPublisherService which handles:
 * - Publishing user-created events to their PDS
 * - Publishing RSVPs to the attendee's PDS
 * - Updating and deleting records on the PDS
 *
 * Design Philosophy:
 * - "PDS first, fail fast" - AT Protocol is the source of truth
 * - No buffering or retry logic - operations fail immediately if PDS unavailable
 * - Service returns results; callers handle database updates
 *
 * Note: This is distinct from the existing Bluesky integration which handles
 * events explicitly created as "Bluesky events" (sourceType === 'bluesky').
 * This module publishes ALL public user-created events to AT Protocol.
 */
@Module({
  imports: [PdsModule, forwardRef(() => BlueskyModule)],
  providers: [AtprotoPublisherService],
  exports: [AtprotoPublisherService],
})
export class AtprotoPublisherModule {}
