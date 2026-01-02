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
import {
  BlueskyLocation,
  BlueskyEventUri,
  BLUESKY_COLLECTIONS,
} from './BlueskyTypes';
import { EventManagementService } from '../event/services/event-management.service';
import { EventQueryService } from '../event/services/event-query.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { BlueskyIdService } from './bluesky-id.service';
import { BlueskyIdentityService } from './bluesky-identity.service';

@Injectable()
export class BlueskyService {
  private readonly logger = new Logger(BlueskyService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RKEY_ATTEMPTS = 100; // Maximum number of attempts for generating unique rkey

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly elasticacheService: ElastiCacheService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject(REQUEST) private readonly request: any,
    @Inject(forwardRef(() => BlueskyIdService))
    private readonly blueskyIdService: BlueskyIdService,
    private readonly blueskyIdentityService: BlueskyIdentityService,
  ) {}

  private async getOAuthClient(tenantId: string): Promise<NodeOAuthClient> {
    return await initializeOAuthClient(
      tenantId,
      this.configService,
      this.elasticacheService,
    );
  }

  async resumeSession(tenantId: string, did: string): Promise<Agent> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const client = await this.getOAuthClient(tenantId);
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

        // We no longer need to apply collection suffix

        // Check if record exists - use standard collection name
        await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: BLUESKY_COLLECTIONS.EVENT,
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
      socialId: existingUser.socialId,
    });

    // Prepare updated preferences while preserving existing data
    const updatedUser = {
      ...existingUser,
      preferences: {
        ...existingUser.preferences,
        bluesky: {
          ...existingUser.preferences?.bluesky, // Preserve all existing Bluesky preferences
          did: existingUser.socialId, // Use socialId from database, not JWT payload
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
      socialId: existingUser.socialId,
    });

    // Prepare updated preferences while preserving existing data
    const updatedUser = {
      ...existingUser,
      preferences: {
        ...existingUser.preferences,
        bluesky: {
          ...existingUser.preferences?.bluesky, // Preserve all existing Bluesky preferences
          did: existingUser.socialId, // Use socialId from database, not JWT payload
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

  async getConnectionStatus(user: UserEntity) {
    const did = user.preferences?.bluesky?.did;
    let handle: string | undefined;

    // Resolve handle from DID if available (uses public API)
    if (did) {
      try {
        const profile = await this.blueskyIdentityService.resolveProfile(did);
        // Fallback to DID if handle is empty
        handle = profile.handle || did;
      } catch (error) {
        this.logger.warn(
          `Failed to resolve Bluesky handle for DID ${did}`,
          error.message,
        );
        // Fallback to DID if resolution fails
        handle = did;
      }
    }

    return {
      connected: !!user.preferences?.bluesky?.connected,
      handle,
    };
  }

  async createEventRecord(
    event: EventEntity,
    did: string,
    handle: string,
    tenantId: string,
  ): Promise<{ rkey: string }> {
    this.logger.debug('Creating Bluesky event record:', {
      event: {
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        series: event.series ? event.series.slug : null,
      },
      did,
      handle,
      tenantId,
    });

    try {
      // Transform image if needed
      if (
        event.image &&
        typeof event.image.path === 'object' &&
        Object.keys(event.image.path).length === 0
      ) {
        this.logger.debug('Transforming empty image path object', {
          eventId: event.id,
          imageBefore: event.image,
        });

        // Use instanceToPlain to force the Transform decorator to run
        const { instanceToPlain } = await import('class-transformer');
        event.image = instanceToPlain(event.image) as any;

        this.logger.debug('Transformed image', {
          eventId: event.id,
          imageAfter: event.image,
        });
      }

      // Use direct approach without locking
      const agent = await this.tryResumeSession(tenantId, did);

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

      // Determine the rkey to use
      let rkey: string;

      // If updating an existing event, use the existing rkey
      if (event.sourceData?.rkey) {
        rkey = event.sourceData.rkey as string;
        this.logger.debug(`Using existing rkey for update: ${rkey}`);
      }
      // For new events, generate a unique rkey based on the slug (not name)
      else {
        // Use slug instead of name to generate rkey (slugs don't change on rename)
        const baseValue = event.slug || this.generateBaseName(event.name);
        rkey = await this.generateUniqueRkey(agent, did, baseValue);
        this.logger.debug(`Generated new rkey for create: ${rkey}`);
      }

      // Prepare uris array with image if it exists
      const uris: BlueskyEventUri[] = [];
      if (event.image?.path) {
        uris.push({
          uri: event.image.path,
          name: 'Event Image',
        });
      } else if (event.image) {
        // Log a warning if we have an image but no path
        this.logger.warn('Event has image but no path', {
          eventId: event.id,
          image: event.image,
        });
      }

      // Add online location to uris if it exists
      if (event.locationOnline) {
        uris.push({
          uri: event.locationOnline,
          name: 'Online Meeting Link',
        });
      }

      // Add OpenMeet event URL to uris to help with matching
      const baseUrl =
        this.configService.get<string>('APP_URL', { infer: true }) ||
        'https://platform.openmeet.net';
      const openmeetEventUrl = `${baseUrl}/events/${event.slug}`;

      // Check if we already have an OpenMeet Event URI to avoid duplicates
      const existingOpenMeetUri = uris.find(
        (uri) =>
          uri.name === 'OpenMeet Event' ||
          (uri.uri && uri.uri.includes(`/events/${event.slug}`)),
      );

      if (!existingOpenMeetUri) {
        this.logger.debug(`Adding OpenMeet event URL: ${openmeetEventUrl}`);
        uris.push({
          uri: openmeetEventUrl,
          name: 'OpenMeet Event',
        });
      } else {
        this.logger.debug(
          `OpenMeet event URL already exists: ${existingOpenMeetUri.uri}`,
        );
      }

      // Create record data
      const recordData: any = {
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
      };

      // Add openmeet-specific metadata in record
      if (event.series) {
        // Add series information to help with discovery
        recordData.openMeetMeta = {
          seriesSlug: event.series.slug,
          isRecurring: true,
        };
      }

      // Use standard collection name without suffix
      const standardEventCollection = BLUESKY_COLLECTIONS.EVENT;

      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: standardEventCollection,
        rkey,
        record: recordData,
      });

      this.logger.debug('post to bluesky result', JSON.stringify(result));
      this.logger.log(
        `Event ${event.name} posted to Bluesky for user ${handle}`,
      );
      return { rkey };
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
      const agent = await this.resumeSession(tenantId, did);

      // Get collection name with appropriate suffix
      const eventCollection = this.blueskyIdService.applyCollectionSuffix(
        BLUESKY_COLLECTIONS.EVENT,
      );

      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: eventCollection,
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

  async tryResumeSession(tenantId: string, did: string): Promise<Agent> {
    try {
      // Direct approach without using the lock mechanism
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

  async deleteEventRecord(
    event: EventEntity,
    did: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    const rkey = event.sourceData?.rkey as string | undefined;
    if (!rkey) {
      throw new Error('No Bluesky record key found in event sourceData');
    }

    const agent = await this.resumeSession(tenantId, did);

    try {
      // When deleting a record, ensure that the repo information is included
      // Use standard collection name without suffix
      const standardEventCollection = BLUESKY_COLLECTIONS.EVENT;

      const response = await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: standardEventCollection,
        rkey,
      });

      this.logger.debug(
        'Bluesky event delete response:',
        JSON.stringify(response),
      );

      // Also log the expected format that should be in the queue for debugging
      this.logger.debug('Expected queue record format:', {
        kind: 'commit',
        commit: {
          repo: did, // This is the critical field that should be in the queue
          collection: standardEventCollection,
          operation: 'delete',
          rkey,
        },
      });

      return {
        success: true,
        message: 'Event deleted successfully',
      };
    } catch (error) {
      this.logger.error('Failed to delete Bluesky event record', {
        error: error.message,
        stack: error.stack,
        did,
        rkey,
        tenantId,
      });

      throw new Error(`Failed to delete Bluesky event: ${error.message}`);
    }
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

  /**
   * Reset a Bluesky session for a user
   * This will force the user to re-authenticate with Bluesky
   *
   * @param did The Bluesky DID to reset the session for
   * @param tenantId Tenant ID
   * @returns Status of the operation
   */
  async resetSession(
    did: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Resetting Bluesky session for DID: ${did}`);

      // Use a consistent lock key for session operations
      const lockKey = `@atproto-oauth-client-${did}`;

      // Delete the session directly from Redis
      await this.elasticacheService.withLock(
        lockKey,
        async () => {
          // Delete the session from ElastiCache
          await this.elasticacheService.del(`bluesky:session:${did}`);
        },
        30000, // 30 second lock TTL
      );

      return {
        success: true,
        message: `Session for DID ${did} has been reset. User will need to reconnect their account.`,
      };
    } catch (error) {
      this.logger.error('Failed to reset Bluesky session', {
        error: error.message,
        stack: error.stack,
        did,
        tenantId,
      });

      return {
        success: false,
        message: `Failed to reset session: ${error.message}`,
      };
    }
  }

  /**
   * Get ATProtocol profile information for any DID or handle
   * Works without requiring user authentication - can be used for shadow users
   * or any ATProtocol user who hasn't registered with OpenMeet
   *
   * @param handleOrDid DID or handle to look up
   * @returns Profile information
   */
  async getPublicProfile(handleOrDid: string): Promise<any> {
    // Delegate to BlueskyIdentityService to avoid circular dependencies
    return this.blueskyIdentityService.resolveProfile(handleOrDid);
  }

  /**
   * Get enhanced ATProtocol profile information for an OpenMeet user
   * First tries to use their authenticated session to get detailed profile data
   * Falls back to public profile lookup if session is unavailable
   *
   * @param user User entity with ATProtocol preferences
   * @param tenantId Tenant ID
   * @returns Enhanced profile data from the user's PDS
   */
  async getEnhancedProfile(user: UserEntity, _tenantId: string): Promise<any> {
    try {
      if (
        !user.preferences?.bluesky?.did &&
        !user.preferences?.bluesky?.handle
      ) {
        return {
          connected: false,
          message: 'No ATProtocol account connected',
        };
      }

      const did = user.preferences.bluesky.did;
      const handle = user.preferences.bluesky.handle;
      const identifier = did || handle;

      if (!identifier) {
        return {
          connected: false,
          message: 'No ATProtocol identifier found',
        };
      }

      const { avatar, connected, connectedAt } = user.preferences.bluesky;

      // Base profile with data we already have stored
      const baseProfile = {
        did,
        handle,
        avatar,
        connected: connected === true,
        connectedAt,
        userId: user.id,
      };

      try {
        // Use public profile lookup as the primary approach
        const publicProfile = await this.getPublicProfile(identifier);

        // Merge the public profile data with our stored information
        const enhancedProfile = {
          ...baseProfile,
          ...publicProfile,
          // Preserve our connection state
          connected: connected === true,
          connectedAt,
        };

        // Return the enhanced profile
        return enhancedProfile;
      } catch (error) {
        this.logger.warn('Failed to fetch ATProtocol profile data', {
          error: error.message,
          did,
          handle,
        });

        // Return just the stored data if all lookups fail
        return {
          ...baseProfile,
          message:
            'Limited profile data available - could not refresh from ATProtocol',
        };
      }
    } catch (error) {
      this.logger.error('Error retrieving ATProtocol profile', {
        error: error.message,
        stack: error.stack,
        userId: user.id,
        socialId: user.socialId,
      });

      throw new Error(
        `Failed to retrieve ATProtocol profile: ${error.message}`,
      );
    }
  }
}
