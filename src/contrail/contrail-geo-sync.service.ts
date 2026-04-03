import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ContrailQueryService } from './contrail-query.service';
import { contrailTableName } from './contrail-record.types';

const SYNC_INTERVAL_MS = 60_000; // 1 minute
const EVENT_COLLECTION = 'community.lexicon.calendar.event';

@Injectable()
export class ContrailGeoSyncService {
  private readonly logger = new Logger(ContrailGeoSyncService.name);
  private syncing = false;

  constructor(private readonly contrailQueryService: ContrailQueryService) {}

  @Interval(SYNC_INTERVAL_MS)
  async sync(): Promise<void> {
    if (this.syncing) {
      this.logger.debug('Geo sync skipped: previous cycle still running');
      return;
    }

    this.syncing = true;
    try {
      const ds = await this.contrailQueryService.getPublicDataSource();
      const table = contrailTableName(EVENT_COLLECTION);

      // Find Contrail events with geo coordinates not yet in the geo index
      const newRecords = await ds.query(
        `SELECT r.uri, r.record
         FROM ${table} r
         WHERE r.record->'locations' IS NOT NULL
           AND jsonb_array_length(r.record->'locations') > 0
           AND r.record->'locations'->0->>'latitude' IS NOT NULL
           AND r.record->'locations'->0->>'latitude' != ''
           AND NOT EXISTS (
             SELECT 1 FROM atproto_geo_index g WHERE g.uri = r.uri
           )
         LIMIT 5000`,
      );

      // Insert geo points for each location in each record
      for (const row of newRecords) {
        try {
          const locations = row.record?.locations ?? [];
          for (let idx = 0; idx < locations.length; idx++) {
            const loc = locations[idx];
            const lat = parseFloat(loc?.latitude);
            const lon = parseFloat(loc?.longitude);
            if (isNaN(lat) || isNaN(lon)) continue;

            await ds.query(
              `INSERT INTO atproto_geo_index (uri, location_idx, location)
               VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)
               ON CONFLICT (uri, location_idx) DO NOTHING`,
              [row.uri, idx, lon, lat],
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to geo-index record ${row.uri}: ${(err as Error).message}`,
          );
        }
      }

      if (newRecords.length > 0) {
        this.logger.log(`Geo-indexed ${newRecords.length} new events`);
      }

      // Prune entries for deleted events
      const pruned = await ds.query(
        `DELETE FROM atproto_geo_index g
         WHERE NOT EXISTS (
           SELECT 1 FROM ${table} r WHERE r.uri = g.uri
         )`,
      );

      if (pruned[1] > 0) {
        this.logger.log(`Pruned ${pruned[1]} orphaned geo index entries`);
      }
    } catch (err) {
      this.logger.error('Geo sync failed', (err as Error).stack);
    } finally {
      this.syncing = false;
    }
  }
}
