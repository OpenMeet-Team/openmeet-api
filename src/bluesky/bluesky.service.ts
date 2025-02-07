import { Injectable, Logger } from '@nestjs/common';
import { BskyAgent } from '@atproto/api';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);

  constructor(private readonly configService: ConfigService) {}

  async createEventRecord(
    event: EventEntity,
    did: string,
    handle: string,
  ): Promise<void> {
    try {
      const agent = new BskyAgent({
        service: `https://${handle.split('.').slice(1).join('.')}`,
      });

      // Convert event type to Bluesky mode
      const modeMap = {
        'in-person': 'community.lexicon.calendar.event#inperson',
        online: 'community.lexicon.calendar.event#virtual',
        hybrid: 'community.lexicon.calendar.event#hybrid',
      };

      // Convert event status to Bluesky status
      const statusMap = {
        draft: 'community.lexicon.calendar.event#planned',
        published: 'community.lexicon.calendar.event#scheduled',
        cancelled: 'community.lexicon.calendar.event#cancelled',
      };

      const locations = [];

      // Add physical location if exists
      if (event.location && event.lat && event.lon) {
        locations.push({
          type: 'community.lexicon.location.geo',
          lat: event.lat,
          lon: event.lon,
          description: event.location,
        });
      }

      // Add online location if exists
      if (event.locationOnline) {
        locations.push({
          type: 'community.lexicon.calendar.event#uri',
          uri: event.locationOnline,
          name: 'Online Meeting Link',
        });
      }

      const record = {
        $type: 'community.lexicon.calendar.event',
        name: event.name,
        description: event.description,
        createdAt: event.createdAt.toISOString(),
        startsAt: event.startDate,
        endsAt: event.endDate,
        mode: modeMap[event.type] || modeMap['in-person'],
        status: statusMap[event.status] || statusMap['published'],
        locations,
      };

      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: 'community.lexicon.calendar.event',
        rkey: event.ulid, // Use the event ULID as the record key
        record,
      });

      this.logger.log(
        `Event ${event.name} posted to Bluesky for user ${handle}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to post event to Bluesky: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
