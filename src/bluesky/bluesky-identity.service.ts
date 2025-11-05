import { Injectable, Logger } from '@nestjs/common';

/**
 * Service for resolving Bluesky/ATProto identity information
 * This service has ZERO dependencies to avoid circular dependency issues
 *
 * Handles:
 * - DID to handle resolution
 * - Handle to DID resolution
 * - Public profile lookups without authentication
 */
@Injectable()
export class BlueskyIdentityService {
  private readonly logger = new Logger(BlueskyIdentityService.name);

  /**
   * Fetches a public ATProtocol profile by DID or handle
   * Works without requiring user authentication - can be used for any ATProtocol user
   *
   * @param handleOrDid DID or handle to look up
   * @returns Profile information including resolved handle
   */
  async resolveProfile(handleOrDid: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
    description?: string;
    indexedAt?: string;
    labels?: any[];
    source: string;
  }> {
    try {
      this.logger.debug(
        `Looking up public ATProtocol profile for: ${handleOrDid}`,
      );

      // Use require() to workaround ts-jest module resolution issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver, getPds, getHandle } = require('@atproto/identity');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Agent } = require('@atproto/api');

      // Create identity resolver (contains both handle and did resolvers)
      const idResolver = new IdResolver();

      // Resolve handle to DID if needed
      let did = handleOrDid;

      if (!handleOrDid.startsWith('did:')) {
        // If a handle was provided, resolve it to a DID first
        this.logger.debug(`Resolving handle ${handleOrDid} to DID`);
        const resolvedDid = await idResolver.handle.resolve(handleOrDid);
        if (!resolvedDid) {
          throw new Error(`Could not resolve handle ${handleOrDid} to a DID`);
        }
        did = resolvedDid;
        this.logger.debug(`Resolved ${handleOrDid} to ${did}`);
      }

      // Resolve DID to get the full DID document
      this.logger.debug(`Resolving DID ${did} to DID document`);
      const didDoc = await idResolver.did.resolveNoCheck(did);

      if (!didDoc) {
        throw new Error(`Could not resolve DID document for ${did}`);
      }

      // Extract PDS endpoint and handle from DID document
      const pdsEndpoint = getPds(didDoc);
      const handle = getHandle(didDoc);

      if (!pdsEndpoint) {
        throw new Error(`No PDS endpoint found for DID ${did}`);
      }

      this.logger.debug(`PDS endpoint for ${did}: ${pdsEndpoint}`);
      this.logger.debug(`Handle for ${did}: ${handle}`);

      // Create agent pointing to the user's PDS
      const agent = new Agent(pdsEndpoint);

      // Fetch profile data using DID or handle
      const response = await agent.getProfile({ actor: did });

      this.logger.debug(
        `Profile API response - did: ${response.data.did}, handle: ${response.data.handle}, handleFromDoc: ${handle}`,
      );

      // Format the response, using handle from DID document as fallback
      const resolvedHandle = response.data.handle || handle || did;
      this.logger.debug(`Final resolved handle: ${resolvedHandle}`);

      return {
        did: response.data.did,
        handle: resolvedHandle,
        displayName: response.data.displayName,
        avatar: response.data.avatar,
        followersCount: response.data.followersCount || 0,
        followingCount: response.data.followingCount || 0,
        postsCount: response.data.postsCount || 0,
        description: response.data.description,
        indexedAt: response.data.indexedAt,
        labels: response.data.labels || [],
        source: 'atprotocol-public',
      };
    } catch (error) {
      this.logger.error('Failed to fetch public ATProtocol profile', {
        error: error.message,
        stack: error.stack,
        handleOrDid,
      });

      throw new Error(
        `Unable to resolve profile for ${handleOrDid}: ${error.message}`,
      );
    }
  }

  /**
   * Lightweight handle-to-DID resolution without fetching full profile
   * Use this for profile lookups where you just need the DID
   *
   * @param handle The ATProto handle to resolve
   * @returns The DID or null if resolution fails
   */
  async resolveHandleToDid(handle: string): Promise<string | null> {
    try {
      this.logger.debug(`Resolving handle ${handle} to DID (lightweight)`);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      const idResolver = new IdResolver();

      const did = await idResolver.handle.resolve(handle);

      if (!did) {
        this.logger.warn(`Could not resolve handle ${handle} to a DID`);
        return null;
      }

      this.logger.debug(`Resolved ${handle} to ${did}`);
      return did;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve handle ${handle} to DID: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Lightweight handle extraction from DID document
   * Fallback method when full profile fetch fails
   *
   * @param did The DID to extract handle from
   * @returns The handle or DID as fallback
   */
  async extractHandleFromDid(did: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver, getHandle } = require('@atproto/identity');
      const idResolver = new IdResolver();
      const didDoc = await idResolver.did.resolveNoCheck(did);
      const handle = getHandle(didDoc);
      return handle || did;
    } catch (error) {
      this.logger.warn(
        `Failed to extract handle from DID document for ${did}: ${error.message}`,
      );
      return did; // Fallback to DID
    }
  }
}
