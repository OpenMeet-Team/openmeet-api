import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { Agent } from '@atproto/api';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { initializeOAuthClient } from '../utils/bluesky';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { delay } from '../utils/delay';
import { BlueskyLocation, BlueskyEventUri } from './BlueskyTypes';
import { EventManagementService } from '../event/services/event-management.service';
import { EventQueryService } from '../event/services/event-query.service';

@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RKEY_ATTEMPTS = 100; // Maximum number of attempts for generating unique rkey

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly elasticacheService: ElastiCacheService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
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

        // Use a consistent lock key for session operations
        const lockKey = `@atproto-oauth-client-${did}`;
        // Wrap the restore operation in a lock
        const session = await this.elasticacheService.withLock(
          lockKey,
          async () => await client.restore(did),
          30000, // 30 second lock TTL
        );

        if (!session) {
          throw new Error('No session found');
        }

        const agent = new Agent(session);
        // Verify the session is valid
        await agent.getProfile({ actor: did });
        return agent;
      } catch (error) {
        const isSessionDeletedError = error.message?.includes(
          'session was deleted',
        );

        this.logger.warn(`Session resume attempt ${attempt} failed:`, {
          error: error.message,
          isSessionDeletedError,
        });

        if (isSessionDeletedError) {
          this.logger.warn(
            `Session was deleted by another process for DID ${did}. Retrying...`,
          );
          // Add a small delay before retry to allow other processes to complete
          await delay(this.RETRY_DELAY * attempt);
          continue;
        }

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

  private generateBaseName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .substring(0, 640); // AT Protocol has a max length for rkeys
  }

  private async generateUniqueRkey(
    agent: Agent,
    did: string,
    baseName: string,
  ): Promise<string> {
    let attempt = 0;
    let rkey = baseName;

    while (attempt < this.MAX_RKEY_ATTEMPTS) {
      try {
        this.logger.debug('generateUniqueRKey: Checking rkey availability:', {
          rkey,
          attempt,
          did,
        });

        // Check if record exists
        await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: 'community.lexicon.calendar.event',
          rkey,
        });

        // Record exists, try next number
        attempt++;
        rkey = `${baseName}-${attempt}`;
        this.logger.debug(
          'generateUniqueRKey: Record exists, trying next rkey:',
          {
            newRkey: rkey,
            attempt,
          },
        );
      } catch (error: any) {
        // Check various 404 error formats from AT Protocol
        const is404 =
          error.error?.statusCode === 404 ||
          error.status === 404 ||
          error.message?.includes('Could not locate record');

        if (is404) {
          this.logger.debug('generateUniqueRKey: Found available rkey:', {
            rkey,
            attempt,
          });
          return rkey;
        }

        // Log unexpected errors
        this.logger.error(
          'generateUniqueRKey: Error checking rkey availability:',
          {
            error: error.message,
            errorObject: error,
            rkey,
            attempt,
          },
        );
        throw error;
      }
    }

    const error = new Error(
      `Could not generate unique rkey after ${this.MAX_RKEY_ATTEMPTS} attempts. Base name: ${baseName}`,
    );
    this.logger.error('Max rkey attempts exceeded:', {
      error: error.message,
      baseName,
      lastAttempt: attempt,
      lastRkey: rkey,
    });
    throw error;
  }

  async connectAccount(user: UserEntity, tenantId: string) {
    // First find the existing user to ensure we update rather than insert
    const existingUser = await this.userService.findById(user.id, tenantId);

    if (!existingUser) {
      throw new Error(`User with id ${user.id} not found`);
    }

    this.logger.debug('Connecting Bluesky account:', {
      userId: user.id,
      existingPreferences: existingUser.preferences?.bluesky,
      socialId: user.socialId,
    });

    // Prepare updated preferences while preserving existing data
    const updatedUser = {
      ...existingUser,
      preferences: {
        ...existingUser.preferences,
        bluesky: {
          ...existingUser.preferences?.bluesky, // Preserve all existing Bluesky preferences
          did: user.socialId, // Ensure DID is set from socialId
          connected: true,
          connectedAt: new Date(),
        },
      },
    };

    this.logger.debug('Updated user preferences:', {
      blueskyPreferences: updatedUser.preferences.bluesky,
    });

    await this.userService.update(user.id, updatedUser, tenantId);

    // Verify the update
    const verifiedUser = await this.userService.findById(user.id, tenantId);
    if (!verifiedUser) {
      this.logger.warn('Could not verify user update - user not found');
    } else {
      this.logger.debug('Verified user after update:', {
        blueskyPreferences: verifiedUser.preferences?.bluesky,
      });
    }

    return {
      success: true,
      message: 'Successfully connected to Bluesky. Events will now sync.',
    };
  }

  async disconnectAccount(user: UserEntity, tenantId: string) {
    // First find the existing user to ensure we update rather than insert
    const existingUser = await this.userService.findById(user.id, tenantId);

    if (!existingUser) {
      throw new Error(`User with id ${user.id} not found`);
    }

    this.logger.debug('Disconnecting Bluesky account:', {
      userId: user.id,
      existingPreferences: existingUser.preferences?.bluesky,
      socialId: user.socialId,
    });

    // Prepare updated preferences while preserving existing data
    const updatedUser = {
      ...existingUser,
      preferences: {
        ...existingUser.preferences,
        bluesky: {
          ...existingUser.preferences?.bluesky, // Preserve all existing Bluesky preferences
          did: user.socialId, // Ensure DID is preserved from socialId
          connected: false,
          disconnectedAt: new Date(),
        },
      },
    };

    this.logger.debug('Updated user preferences:', {
      blueskyPreferences: updatedUser.preferences.bluesky,
    });

    await this.userService.update(user.id, updatedUser, tenantId);

    // Verify the update
    const verifiedUser = await this.userService.findById(user.id, tenantId);
    if (!verifiedUser) {
      this.logger.warn('Could not verify user update - user not found');
    } else {
      this.logger.debug('Verified user after update:', {
        blueskyPreferences: verifiedUser.preferences?.bluesky,
      });
    }

    return {
      success: true,
      message:
        'Successfully disconnected from Bluesky. Events will no longer sync.',
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
  ): Promise<{ rkey: string }> {
    this.logger.debug('Creating Bluesky event record:', {
      eventName: event.name,
      did,
      handle,
      tenantId,
    });

    try {
      // Use a consistent lock key for session operations
      const lockKey = `@atproto-oauth-client-${did}`;

      // Use the withLock pattern to prevent concurrent session operations
      const result = await this.elasticacheService.withLock<{ rkey: string }>(
        lockKey,
        async () => {
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

          // Generate a unique rkey from the event name
          const baseName = this.generateBaseName(event.name);
          const rkey = await this.generateUniqueRkey(agent, did, baseName);

          // Prepare uris array with image if it exists
          const uris: BlueskyEventUri[] = [];
          if (event.image?.path) {
            uris.push({
              uri: event.image.path,
              name: 'Event Image',
            });
          }

          // Add online location to uris if it exists
          if (event.locationOnline) {
            uris.push({
              uri: event.locationOnline,
              name: 'Online Meeting Link',
            });
          }

          const result = await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: 'community.lexicon.calendar.event',
            rkey,
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
              uris,
            },
          });
          this.logger.debug(result);
          this.logger.log(
            `Event ${event.name} posted to Bluesky for user ${handle}`,
          );
          return { rkey };
        },
        60000, // 60 second lock TTL for the Bluesky event creation
      );

      // Handle the case where we couldn't acquire the lock
      if (result === null) {
        throw new Error(
          'Failed to acquire lock for Bluesky event creation. Please try again later.',
        );
      }

      return result;
    } catch (error: any) {
      this.logger.error('Failed to create Bluesky event:', {
        error: error.message,
        stack: error.stack,
        eventName: event.name,
        did,
        errorObject: error,
      });

      // Enhance error message for debugging
      const enhancedError = new Error(
        `Failed to create Bluesky event "${event.name}": ${error.message}`,
      );
      enhancedError.stack = error.stack;
      throw enhancedError;
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
    try {
      return await this.tryResumeSession(tenantId, did);
    } catch (error) {
      // Log the error but with a cleaner message
      this.logger.error(`Failed to resume Bluesky session for DID ${did}:`, {
        error: error.message,
        tenantId,
      });

      // Rethrow with a more user-friendly message
      throw new Error(
        `Unable to access your Bluesky account. You may need to reconnect your account.`,
      );
    }
  }

  // Add a new method to delete an event from Bluesky
  async deleteEventRecord(
    event: EventEntity,
    did: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    const rkey = event.sourceData?.rkey as string | undefined;
    if (!rkey) {
      throw new Error('No Bluesky record key found in event sourceData');
    }

    const agent = await this.tryResumeSession(tenantId, did);
    const response = await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: 'community.lexicon.calendar.event',
      rkey,
    });
    this.logger.debug('Bluesky event delete response:', response);

    return {
      success: true,
      message: 'Event deleted successfully',
    };
  }

  /**
   * Handle deletion of an event from Bluesky
   * This method is called when an event is deleted in Bluesky and should be deleted in OpenMeet
   *
   * @param did DID of the user who owns the event
   * @param rkey Record key of the event in Bluesky
   * @param tenantId Tenant ID
   * @returns Status of the operation
   */
  async handleExternalEventDeletion(
    did: string,
    rkey: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.debug('Handling external event deletion', {
        did,
        rkey,
        tenantId,
      });

      // Find the event in our system by source ID and rkey
      const events = await this.eventQueryService.findByBlueskySource({
        did,
        rkey,
      });

      if (!events || events.length === 0) {
        this.logger.debug('No matching event found for deletion', {
          did,
          rkey,
        });
        return {
          success: false,
          message: 'No matching event found to delete',
        };
      }

      this.logger.debug('Found events to delete', {
        count: events.length,
        slugs: events.map((e) => e.slug),
      });

      // Delete each matching event
      for (const event of events) {
        this.logger.debug('Deleting event', { slug: event.slug });
        await this.eventManagementService.remove(event.slug);
      }

      return {
        success: true,
        message: `Successfully deleted ${events.length} event(s)`,
      };
    } catch (error) {
      this.logger.error('Failed to handle external event deletion', {
        error: error.message,
        stack: error.stack,
        did,
        rkey,
      });

      return {
        success: false,
        message: `Failed to delete event: ${error.message}`,
      };
    }
  }
}
