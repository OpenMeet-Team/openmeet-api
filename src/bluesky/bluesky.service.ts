import { Injectable, Logger } from '@nestjs/common';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { Agent, AtpAgent, AtpSessionData } from '@atproto/api';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { initializeOAuthClient } from '../utils/bluesky';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { delay } from '../utils/delay';

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
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly elasticacheService: ElastiCacheService,
  ) {}

  private async getOAuthClient(tenantId: string): Promise<NodeOAuthClient> {
    return await initializeOAuthClient(
      tenantId,
      this.configService,
      this.elasticacheService,
    );
  }

  private async tryResumeSession(
    tenantId: string,
    did: string,
  ): Promise<Agent> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const client = await this.getOAuthClient(tenantId);
        const session = await client.restore(did);

        if (!session) {
          throw new Error('No session found');
        }

        const agent = new Agent(session);
        // Verify the session is valid
        await agent.getProfile({ actor: did });
        return agent;
      } catch (error) {
        this.logger.warn(
          `Session resume attempt ${attempt} failed:`,
          error.message,
        );

        if (attempt === this.MAX_RETRIES) {
          throw new Error(
            `Failed to resume session after ${this.MAX_RETRIES} attempts: ${error.message}`,
          );
        }

        await delay(this.RETRY_DELAY);
      }
    }
    throw new Error('Failed to resume session');
  }

  async connectAccount(
    identifier: string,
    password: string,
    tenantId: string,
    session?: AtpSessionData,
  ): Promise<AtpAgent> {
    this.logger.debug('connectAccount agent login', { identifier, tenantId });

    const agent = new AtpAgent({
      service: `https://${identifier.split('.').slice(1).join('.')}`,
    });

    try {
      // If we have a session, try to resume it first
      if (session) {
        try {
          await agent.resumeSession(session);
          this.logger.debug('Resumed existing session');
        } catch (error) {
          this.logger.debug(
            'Failed to resume session (error)',
            error,
            'will create new one',
          );
        }
      }

      // If no session or resume failed, create new session
      if (!agent.session) {
        const response = await agent.login({
          identifier,
          password,
        });
        this.logger.debug('connectAccount agent session', {
          session: response,
        });

        if (agent.session) {
          this.logger.debug(
            'Session persisted with OAuth client built-in mechanism',
          );
        }
      }

      return agent;
    } catch (error) {
      this.logger.error('Failed to connect account:', error);
      throw error;
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
    tenantId: string,
  ): Promise<void> {
    this.logger.debug('Creating Bluesky event record:', {
      eventName: event.name,
      did,
      handle,
      tenantId,
    });

    try {
      const client = await this.getOAuthClient(tenantId);
      const session = await client.restore(did);
      this.logger.debug('Retrieved session:', {
        hasSession: !!session,
        did: session?.did,
      });

      if (!session) {
        throw new Error('Bluesky session not found');
      }

      const agent = await this.resumeSession(tenantId, did);
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

      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: 'community.lexicon.calendar.event',
        rkey: event.ulid || `${Date.now()}`,
        record: {
          $type: 'community.lexicon.calendar.event',
          name: event.name,
          description: event.description,
          createdAt: event.createdAt,
          startsAt: event.startDate,
          endsAt: event.endDate,
          mode: modeMap[event.type] || modeMap['in-person'],
          status: statusMap[event.status] || statusMap['published'],
          locations,
        },
      });
      this.logger.debug(result);
      this.logger.log(
        `Event ${event.name} posted to Bluesky for user ${handle}`,
      );
    } catch (error) {
      this.logger.error('Failed to create Bluesky event:', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async listEvents(did: string, tenantId: string): Promise<any[]> {
    try {
      const agent = await this.tryResumeSession(tenantId, did);

      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'community.lexicon.calendar.event',
      });
      return response.data.records;
    } catch (error) {
      this.logger.error('Failed to list Bluesky events:', error);
      // Throw a more user-friendly error
      throw new Error(
        'Unable to access Bluesky events. Please try logging out and back in.',
      );
    }
  }

  async resumeSession(tenantId: string, did: string): Promise<Agent> {
    return this.tryResumeSession(tenantId, did);
  }

  // Add a new method to delete an event from Bluesky
  async deleteEventRecord(
    event: EventEntity,
    did: string,
    tenantId: string,
  ): Promise<void> {
    this.logger.debug(`Deleting Bluesky event record for event: ${event.name}`);

    // Ensure we have an identifier (ulid) for the event record in Bluesky
    if (!event.ulid) {
      throw new Error('Bluesky event identifier (ulid) is missing');
    }

    try {
      // Use the same retry/resume process to get an agent
      const agent = await this.tryResumeSession(tenantId, did);
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: 'community.lexicon.calendar.event',
        rkey: event.ulid,
      });
      this.logger.log(`Deleted Bluesky event record for event ${event.name}`);
    } catch (error) {
      this.logger.error(
        'Failed to delete Bluesky event record:',
        error.message,
      );
      throw error;
    }
  }
}
