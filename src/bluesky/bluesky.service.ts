import { Injectable, Logger } from '@nestjs/common';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AtpAgent, AtpSessionData } from '@atproto/api';
import { ElastiCacheService } from '../elasticache/elasticache.service';

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
    private readonly elasticacheService: ElastiCacheService,
  ) {}

  private getSessionKey(tenantId: string, did: string): string {
    return `bluesky:session:${tenantId}:${did}`;
  }

  private async getStoredSession(
    tenantId: string,
    did: string,
  ): Promise<AtpSessionData | null> {
    try {
      const sessionStr = await this.elasticacheService.get(
        this.getSessionKey(tenantId, did),
      );
      return sessionStr ? JSON.parse(sessionStr as string) : null;
    } catch (error) {
      this.logger.error(
        `Failed to get stored session for DID ${did} in tenant ${tenantId}:`,
        error,
      );
      return null;
    }
  }

  async storeSession(tenantId: string, session: AtpSessionData): Promise<void> {
    try {
      await this.elasticacheService.set(
        this.getSessionKey(tenantId, session.did),
        JSON.stringify(session),
        60 * 60 * 24 * 1,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store session for DID ${session.did} in tenant ${tenantId}:`,
        error,
      );
      throw error;
    }
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
          await this.storeSession(tenantId, agent.session as AtpSessionData);
          this.logger.debug('Stored new session');
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
      // Get stored session
      const session = await this.getStoredSession(tenantId, did);
      this.logger.debug('Retrieved session:', {
        hasSesssion: !!session,
        did: session?.did,
      });

      if (!session) {
        throw new Error('Bluesky session not found');
      }

      // Create new agent with session
      const agent = new AtpAgent({
        service: `https://${handle.split('.').slice(1).join('.')}`,
        session: {
          did: session.did,
          handle: session.handle,
          accessJwt: session.accessJwt,
          refreshJwt: session.refreshJwt,
          active: true,
        },
      });

      // Add logging to check agent and session state
      this.logger.debug('Agent created with session:', {
        agentService: agent.service,
        sessionActive: agent.session?.active,
        accessJwtPresent: !!session.accessJwt,
        refreshJwtPresent: !!session.refreshJwt,
      });

      // Try to refresh the session if needed
      try {
        await agent.resumeSession(session);
        this.logger.debug('Session resumed successfully');
      } catch (error) {
        this.logger.error('Failed to resume session:', error);
        throw new Error('Failed to authenticate with Bluesky');
      }

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
      const session = await this.getStoredSession(tenantId, did);
      if (!session) {
        throw new Error('Bluesky session not found');
      }

      const agent = new AtpAgent({
        service: 'https://bsky.social',
        session: {
          did: session.did,
          handle: session.handle,
          accessJwt: session.accessJwt,
          refreshJwt: session.refreshJwt,
          active: true,
        },
      });

      // List records of type community.lexicon.calendar.event
      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'community.lexicon.calendar.event',
      });

      return response.data.records;
    } catch (error) {
      this.logger.error('Failed to list Bluesky events:', error);
      throw error;
    }
  }
}
