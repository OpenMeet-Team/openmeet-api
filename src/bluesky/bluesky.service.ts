import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { BskyAgent } from '@atproto/api';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

interface BlueskyLocation {
  type: string;
  lat?: number;
  lon?: number;
  description?: string;
  uri?: string;
  name?: string;
}

export enum EventSourceType {
  BLUESKY = 'bluesky',
  EVENTBRITE = 'eventbrite',
  FACEBOOK = 'facebook',
  LUMA = 'luma',
  MEETUP = 'meetup',
  OTHER = 'other',
  WEB = 'web',
}

@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async connectAccount(identifier: string, password: string, user: UserEntity) {
    try {
      const agent = new BskyAgent({
        service: 'https://bsky.social',
      });

      // Verify credentials and get session
      await agent.login({ identifier, password });

      // Store connection info in user preferences
      user.preferences = {
        ...user.preferences,
        bluesky: {
          did: agent.session?.did,
          handle: identifier,
          connected: true,
          autoPost: true, // Default to auto-posting enabled
          connectedAt: new Date(),
        },
      };

      await this.userRepository.save(user);

      return {
        success: true,
        handle: identifier,
        autoPost: true,
        message:
          'Successfully connected Bluesky account. New events will be automatically posted.',
      };
    } catch (error) {
      this.logger.error(`Failed to connect Bluesky account: ${error.message}`);
      throw new UnauthorizedException('Invalid Bluesky credentials');
    }
  }

  async disconnectAccount(user: UserEntity) {
    if (user.preferences?.bluesky) {
      // Keep the connection info but mark as disconnected
      user.preferences.bluesky = {
        ...user.preferences.bluesky,
        connected: false,
        autoPost: false,
        disconnectedAt: new Date(),
      };
      await this.userRepository.save(user);
    }
    return {
      success: true,
      message:
        'Successfully disconnected Bluesky account. Events will no longer be posted automatically.',
    };
  }

  async toggleAutoPost(user: UserEntity, enabled: boolean) {
    if (!user.preferences?.bluesky?.connected) {
      throw new Error('Bluesky account not connected');
    }

    user.preferences.bluesky = {
      ...user.preferences.bluesky,
      autoPost: enabled,
    };
    await this.userRepository.save(user);

    return {
      success: true,
      autoPost: enabled,
      message: enabled
        ? 'Events will be automatically posted to Bluesky'
        : 'Events will not be automatically posted to Bluesky',
    };
  }

  getConnectionStatus(user: UserEntity) {
    return {
      connected: !!user.preferences?.bluesky?.connected,
      handle: user.preferences?.bluesky?.handle,
    };
  }

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

      const locations: BlueskyLocation[] = [];

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

      // Set the source type to bluesky
      event.sourceType = EventSourceType.BLUESKY;
      event.lastSyncedAt = new Date();

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
