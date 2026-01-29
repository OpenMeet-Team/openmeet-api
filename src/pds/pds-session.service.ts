import { Injectable, Inject, Scope, Logger, forwardRef } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Agent, CredentialSession } from '@atproto/api';
import { PdsCredentialService } from './pds-credential.service';
import {
  PdsAccountService,
  CreateSessionResponse,
} from './pds-account.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { SessionUnavailableError } from './pds.errors';

/**
 * Result of a successful session retrieval.
 */
export interface SessionResult {
  /** The authenticated AT Protocol agent */
  agent: Agent;
  /** The user's DID */
  did: string;
  /** Whether this is a custodial (OpenMeet-managed) account */
  isCustodial: boolean;
  /** Source of the session: 'cache' (Redis), 'fresh' (new PDS login), or 'oauth' (BlueskyService) */
  source: 'cache' | 'fresh' | 'oauth';
}

/** Cache TTL for PDS sessions: 15 minutes */
const SESSION_CACHE_TTL_SECONDS = 900;

/**
 * Unified service for obtaining authenticated AT Protocol sessions.
 *
 * Handles three user types:
 * 1. **Custodial** (isCustodial=true, has pdsCredentials):
 *    Decrypt credentials -> create session -> cache in Redis
 *
 * 2. **OAuth/Bluesky** (isCustodial=false):
 *    Delegate to BlueskyService.resumeSession()
 *
 * 3. **Orphan** (isCustodial=true, pdsCredentials=null):
 *    Return null (account needs password reset)
 *
 * @example
 * ```typescript
 * const result = await pdsSessionService.getSessionForUser(tenantId, userUlid);
 * if (result) {
 *   // Use result.agent to make AT Protocol calls
 *   await result.agent.com.atproto.repo.createRecord(...);
 * }
 * ```
 */
@Injectable({ scope: Scope.REQUEST, durable: true })
export class PdsSessionService {
  private readonly logger = new Logger(PdsSessionService.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly pdsCredentialService: PdsCredentialService,
    private readonly pdsAccountService: PdsAccountService,
    @Inject(forwardRef(() => BlueskyService))
    private readonly blueskyService: BlueskyService,
    private readonly elastiCacheService: ElastiCacheService,
  ) {}

  /**
   * Get an authenticated session for a user by their ULID.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @returns SessionResult if successful, null if no session available
   */
  async getSessionForUser(
    tenantId: string,
    userUlid: string,
  ): Promise<SessionResult | null> {
    // Look up the user's AT Protocol identity
    const identity = await this.userAtprotoIdentityService.findByUserUlid(
      tenantId,
      userUlid,
    );

    if (!identity) {
      this.logger.debug(`No AT Protocol identity found for user ${userUlid}`);
      return null;
    }

    return this.getSessionForIdentity(tenantId, identity);
  }

  /**
   * Get an authenticated session for a user by their DID.
   *
   * @param tenantId - The tenant ID
   * @param did - The user's DID
   * @returns SessionResult if successful, null if no session available
   */
  async getSessionForDid(
    tenantId: string,
    did: string,
  ): Promise<SessionResult | null> {
    // Look up the user's AT Protocol identity by DID
    const identity = await this.userAtprotoIdentityService.findByDid(
      tenantId,
      did,
    );

    if (!identity) {
      this.logger.debug(`No AT Protocol identity found for DID ${did}`);
      return null;
    }

    return this.getSessionForIdentity(tenantId, identity);
  }

  /**
   * Invalidate a cached session for a DID.
   *
   * Call this when you know a session is invalid (e.g., after password change)
   * to force a fresh session on the next request.
   *
   * @param tenantId - The tenant ID
   * @param did - The user's DID
   */
  async invalidateSession(tenantId: string, did: string): Promise<void> {
    const cacheKey = this.getCacheKey(tenantId, did);
    await this.elastiCacheService.del(cacheKey);
    this.logger.debug(`Invalidated cached session for DID ${did}`);
  }

  /**
   * Get session for an identity entity.
   * Internal method that handles the three user types.
   */
  private async getSessionForIdentity(
    tenantId: string,
    identity: {
      did: string;
      handle: string | null;
      pdsUrl: string;
      pdsCredentials: string | null;
      isCustodial: boolean;
    },
  ): Promise<SessionResult | null> {
    // Case 1: OAuth user (non-custodial) - delegate to BlueskyService
    if (!identity.isCustodial) {
      return this.handleOAuthSession(tenantId, identity.did);
    }

    // Case 2: Orphan account (custodial but no credentials)
    if (!identity.pdsCredentials) {
      this.logger.debug(
        `Orphan account detected for DID ${identity.did} - no credentials available`,
      );
      return null;
    }

    // Case 3: Custodial account with credentials
    // TypeScript knows pdsCredentials is not null at this point
    return this.handleCustodialSession(tenantId, {
      did: identity.did,
      handle: identity.handle,
      pdsUrl: identity.pdsUrl,
      pdsCredentials: identity.pdsCredentials,
    });
  }

  /**
   * Handle OAuth session restoration via BlueskyService.
   *
   * @throws SessionUnavailableError if OAuth session cannot be restored
   */
  private async handleOAuthSession(
    tenantId: string,
    did: string,
  ): Promise<SessionResult> {
    try {
      const agent = await this.blueskyService.resumeSession(tenantId, did);

      return {
        agent,
        did,
        isCustodial: false,
        source: 'oauth',
      };
    } catch (error) {
      this.logger.warn(
        `OAuth session restoration failed for DID ${did}: ${error.message}`,
      );
      throw new SessionUnavailableError(
        'Your AT Protocol session has expired. Please link your AT Protocol account again to continue publishing.',
        true,
        did,
      );
    }
  }

  /**
   * Handle custodial session creation with caching.
   */
  private async handleCustodialSession(
    tenantId: string,
    identity: {
      did: string;
      handle: string | null;
      pdsUrl: string;
      pdsCredentials: string;
    },
  ): Promise<SessionResult | null> {
    const cacheKey = this.getCacheKey(tenantId, identity.did);

    // Check cache first
    const cachedSession =
      await this.elastiCacheService.get<CreateSessionResponse>(cacheKey);

    if (cachedSession) {
      this.logger.debug(`Cache hit for session ${identity.did}`);

      try {
        const agent = await this.createAgentFromSession(
          identity.pdsUrl,
          cachedSession,
        );

        return {
          agent,
          did: identity.did,
          isCustodial: true,
          source: 'cache',
        };
      } catch (error) {
        // Cache might be stale, continue to create fresh session
        this.logger.warn(
          `Failed to restore cached session for ${identity.did}, creating fresh: ${error.message}`,
        );
      }
    }

    // No cache hit or stale cache - create fresh session
    return this.createFreshCustodialSession(tenantId, identity);
  }

  /**
   * Create a fresh custodial session by decrypting credentials and logging in.
   */
  private async createFreshCustodialSession(
    tenantId: string,
    identity: {
      did: string;
      handle: string | null;
      pdsUrl: string;
      pdsCredentials: string;
    },
  ): Promise<SessionResult | null> {
    try {
      // Decrypt the credentials
      const password = this.pdsCredentialService.decrypt(
        identity.pdsCredentials,
      );

      // Create session with PDS
      const session = await this.pdsAccountService.createSession(
        identity.did,
        password,
      );

      // Cache the session
      const cacheKey = this.getCacheKey(tenantId, identity.did);
      await this.elastiCacheService.set(
        cacheKey,
        session,
        SESSION_CACHE_TTL_SECONDS,
      );

      // Create and return agent
      const agent = await this.createAgentFromSession(identity.pdsUrl, session);

      return {
        agent,
        did: identity.did,
        isCustodial: true,
        source: 'fresh',
      };
    } catch (error) {
      this.logger.error(
        `Failed to create custodial session for DID ${identity.did}`,
        { tenantId, error: error.message },
      );
      return null;
    }
  }

  /**
   * Create an Agent instance from a session response.
   *
   * Uses CredentialSession to properly restore the session state.
   * The CredentialSession handles token refresh and session management.
   */
  private async createAgentFromSession(
    pdsUrl: string,
    session: CreateSessionResponse,
  ): Promise<Agent> {
    // Create a CredentialSession pointing to the PDS URL
    const credentialSession = new CredentialSession(new URL(pdsUrl));

    // Resume the session with the stored credentials
    // active: true is required by AtpSessionData interface
    await credentialSession.resumeSession({
      did: session.did,
      handle: session.handle,
      accessJwt: session.accessJwt,
      refreshJwt: session.refreshJwt,
      active: true,
    });

    // Create and return an Agent using the authenticated session
    return new Agent(credentialSession);
  }

  /**
   * Generate the Redis cache key for a session.
   */
  private getCacheKey(tenantId: string, did: string): string {
    return `pds:session:${tenantId}:${did}`;
  }
}
