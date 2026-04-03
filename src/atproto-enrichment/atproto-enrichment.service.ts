import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ContrailRecord } from '../contrail/contrail-record.types';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import {
  AtprotoSourcedEvent,
  MODE_TO_EVENT_TYPE,
} from './types/enriched-event.types';

@Injectable()
export class AtprotoEnrichmentService {
  private readonly logger = new Logger(AtprotoEnrichmentService.name);

  constructor(
    private readonly handleCacheService: AtprotoHandleCacheService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Parse a fallback ATProto slug (e.g. "did:plc:abc123~rkey456") into its DID and rkey components.
   * Returns null if the slug doesn't match the fallback format.
   */
  parseAtprotoSlug(slug: string): { did: string; rkey: string } | null {
    const match = slug.match(/^(did:(plc|web):[^~]+)~(.+)$/);
    if (!match) return null;
    return { did: match[1], rkey: match[3] };
  }

  /**
   * Pure mapping: ATProto record + optional tenant event → AtprotoSourcedEvent.
   * No I/O — all data passed in.
   */
  mapAtprotoToEvent(
    record: ContrailRecord,
    tenantEvent?: EventEntity,
    handle?: string,
  ): AtprotoSourcedEvent {
    const rec = record.record as Record<string, any> | null;
    const locations = rec?.locations ?? [];
    const firstLocation = locations[0] as Record<string, any> | undefined;

    const base: AtprotoSourcedEvent = {
      source: 'atproto' as const,
      atprotoUri: record.uri,
      atprotoRkey: record.rkey,
      atprotoCid: record.cid,
      name: rec?.name,
      description: rec?.description ?? null,
      startDate: rec?.startsAt ? new Date(rec.startsAt) : null,
      endDate: rec?.endsAt ? new Date(rec.endsAt) : null,
      type: MODE_TO_EVENT_TYPE[rec?.mode] ?? 'in-person',
      status: 'published',
      location: firstLocation?.name ?? null,
      locationOnline: (locations.find((l: any) => l.uri) as any)?.uri ?? null,
      lat: firstLocation?.latitude ? parseFloat(firstLocation.latitude) : null,
      lon: firstLocation?.longitude
        ? parseFloat(firstLocation.longitude)
        : null,
      attendeesCount:
        ((record as any).count_community_lexicon_calendar_rsvp as number) ?? 0,
      slug: `${record.did}~${record.rkey}`,
    };

    if (tenantEvent) {
      base.id = tenantEvent.id;
      base.ulid = tenantEvent.ulid;
      base.slug = tenantEvent.slug;
      base.group = tenantEvent.group;
      base.image = tenantEvent.image;
      base.categories = tenantEvent.categories;
      base.series = tenantEvent.series;
      base.seriesSlug = tenantEvent.seriesSlug;
      base.maxAttendees = tenantEvent.maxAttendees;
      base.requireApproval = tenantEvent.requireApproval;
      base.allowWaitlist = tenantEvent.allowWaitlist;
      base.timeZone = tenantEvent.timeZone;
      base.conferenceData = tenantEvent.conferenceData;
      base.status = tenantEvent.status;
      base.visibility = tenantEvent.visibility;
      base.user = tenantEvent.user;
    } else if (handle) {
      base.user = { name: handle, slug: null };
    }

    return base;
  }

  /**
   * Batch-fetch tenant events by atprotoUri for metadata enrichment.
   */
  async batchFetchTenantEvents(
    atprotoUris: string[],
    tenantId: string,
  ): Promise<Map<string, EventEntity>> {
    if (atprotoUris.length === 0) return new Map();

    const ds = await this.tenantConnectionService.getTenantConnection(tenantId);
    const repo = ds.getRepository(EventEntity);
    const tenantEvents = await repo.find({
      where: { atprotoUri: In(atprotoUris) },
      relations: ['user', 'image', 'categories', 'group', 'series'],
    });

    return new Map(tenantEvents.map((e) => [e.atprotoUri!, e]));
  }

  /**
   * Full enrichment pipeline: batch-fetch tenant metadata, resolve handles
   * for ATProto-only events, map all records to AtprotoSourcedEvent[].
   */
  async enrichRecords(
    records: ContrailRecord[],
    tenantId: string,
  ): Promise<AtprotoSourcedEvent[]> {
    if (records.length === 0) return [];

    const uris = records.map((r) => r.uri);
    const tenantMetadata = await this.batchFetchTenantEvents(uris, tenantId);

    const orphanDids = [
      ...new Set(
        records.filter((r) => !tenantMetadata.has(r.uri)).map((r) => r.did),
      ),
    ];
    const handles = await this.handleCacheService.resolveHandles(orphanDids);

    return records
      .map((r) => {
        try {
          return this.mapAtprotoToEvent(
            r,
            tenantMetadata.get(r.uri),
            handles.get(r.did),
          );
        } catch (err) {
          this.logger.warn(
            `Skipping malformed Contrail record ${r.uri}: ${(err as Error).message}`,
          );
          return null;
        }
      })
      .filter((e): e is AtprotoSourcedEvent => e !== null);
  }

  /**
   * Filter enriched events by category names (case-insensitive substring match).
   * Returns all events if categories is empty/undefined.
   */
  filterByCategories(
    events: AtprotoSourcedEvent[],
    categories: string[] | undefined,
  ): AtprotoSourcedEvent[] {
    if (!categories || categories.length === 0) return events;

    return events.filter((event) => {
      const eventCategories = event.categories?.map((c: any) => c.name) ?? [];
      return categories.some((cat) =>
        eventCategories.some((ec: string) =>
          ec.toLowerCase().includes(cat.toLowerCase()),
        ),
      );
    });
  }

  /**
   * Remove private/unlisted events that duplicate ATProto results.
   * An event is a duplicate if its atprotoUri appears in the public set.
   */
  deduplicatePrivateEvents(
    privateEvents: EventEntity[],
    atprotoUris: Set<string>,
  ): EventEntity[] {
    return privateEvents.filter(
      (e) => !e.atprotoUri || !atprotoUris.has(e.atprotoUri),
    );
  }
}
