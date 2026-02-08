import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@atproto/api';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { OAuthPlatform } from '../auth/types/oauth.types';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { UserService } from '../user/user.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { initializeOAuthClient } from '../utils/bluesky';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class AuthBlueskyService {
  private readonly logger = new Logger(AuthBlueskyService.name);

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private configService: ConfigService,
    private authService: AuthService,
    private elasticacheService: ElastiCacheService,
    private blueskyService: BlueskyService,
    private blueskyIdentityService: BlueskyIdentityService,
    private userAtprotoIdentityService: UserAtprotoIdentityService,
    private moduleRef: ModuleRef,
  ) {}

  /**
   * Get UserService via ModuleRef.resolve() for REQUEST-scoped providers.
   * Must be resolved per-request as UserService has Scope.REQUEST.
   * Using strict: false to search across all modules.
   */
  private async getUserService(): Promise<UserService> {
    return await this.moduleRef.resolve(UserService, undefined, {
      strict: false,
    });
  }

  /**
   * Find a user by their AT Protocol DID using a two-tier lookup strategy.
   *
   * Primary lookup: Check userAtprotoIdentities table by DID
   * - This is the source of truth after the migration
   * - Finds users regardless of how they originally signed up (Bluesky, Google, GitHub, Email)
   *
   * Fallback lookup: Check users table by socialId + provider='bluesky'
   * - For backwards compatibility with legacy Bluesky users
   * - Only used if no identity record exists
   *
   * @param tenantId - The tenant ID
   * @param did - The user's DID (decentralized identifier)
   * @returns Object with user (if found) and how they were found
   */
  async findUserByAtprotoIdentity(
    tenantId: string,
    did: string,
  ): Promise<{
    user: UserEntity | null;
    foundVia: 'atproto-identity' | 'legacy-bluesky' | null;
  }> {
    const userService = await this.getUserService();

    // PRIMARY: Look up by DID in userAtprotoIdentities
    const identity = await this.userAtprotoIdentityService.findByDid(
      tenantId,
      did,
    );

    if (identity) {
      this.logger.debug('Found AT Protocol identity record', {
        did,
        userUlid: identity.userUlid,
      });

      // Get the user by their ULID from the identity record
      const user = await userService.findByUlid(identity.userUlid, tenantId);

      if (user) {
        return { user: user as UserEntity, foundVia: 'atproto-identity' };
      }

      // Identity exists but user was deleted - treat as not found
      this.logger.warn('AT Protocol identity exists but user not found', {
        did,
        userUlid: identity.userUlid,
      });
      return { user: null, foundVia: null };
    }

    // FALLBACK: Legacy lookup for native Bluesky users without identity record
    this.logger.debug('No identity record, falling back to legacy lookup', {
      did,
    });

    const legacyUser = (await userService.findBySocialIdAndProvider(
      { socialId: did, provider: 'bluesky' },
      tenantId,
    )) as UserEntity | null;

    if (legacyUser) {
      this.logger.debug('Found user via legacy Bluesky lookup', {
        did,
        userId: legacyUser.id,
      });
      return { user: legacyUser, foundVia: 'legacy-bluesky' };
    }

    return { user: null, foundVia: null };
  }

  public async initializeClient(tenantId: string) {
    this.logger.debug('initializeClient called', { tenantId });
    try {
      const client = await initializeOAuthClient(
        tenantId,
        this.configService,
        this.elasticacheService,
      );
      this.logger.debug('initializeClient succeeded');
      return client;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`initializeClient failed: ${errorMessage}`, error);
      throw error;
    }
  }

  async getProfileFromParams(params: URLSearchParams, tenantId: string) {
    this.logger.debug('getProfileFromParams', { params });

    try {
      const client = await this.initializeClient(tenantId);
      const { session, state } = await client.callback(params);
      this.logger.debug('getProfileFromParams', { state, session });

      const agent = new Agent(session);
      if (!agent.did) throw new Error('DID not found in session');

      const profile = await agent.getProfile({ actor: agent.did });
      return {
        did: profile.data.did,
        handle: profile.data.handle,
        displayName: profile.data.displayName,
        avatar: profile.data.avatar,
      };
    } catch (error) {
      this.logger.error('Callback error:', error);
      throw error;
    }
  }

  /**
   * Build the redirect URL for OAuth callback based on platform.
   * Mobile platforms (android/ios) use custom URL scheme for deep linking.
   * Web uses the tenant's frontend domain.
   */
  public buildRedirectUrl(
    tenantId: string,
    params: URLSearchParams,
    platform?: OAuthPlatform,
  ): string {
    const tenantConfig = this.tenantConnectionService.getTenantConfig(tenantId);
    const isMobile = platform === 'android' || platform === 'ios';

    let baseUrl: string;
    if (isMobile) {
      const customScheme =
        (this.configService.get('MOBILE_CUSTOM_URL_SCHEME', {
          infer: true,
        }) as string | undefined) ?? 'net.openmeet.platform';
      baseUrl = `${customScheme}:`;
    } else {
      baseUrl = tenantConfig.frontendDomain;
    }

    return `${baseUrl}/auth/bluesky/callback?${params.toString()}`;
  }

  async handleAuthCallback(
    query: any,
    tenantId: string,
  ): Promise<{ redirectUrl: string; sessionId: string | undefined }> {
    this.logger.debug('handleAuthCallback', { query, tenantId });
    if (!tenantId) {
      this.logger.error('No tenant ID found in parameters');
      throw new BadRequestException('Tenant ID is required');
    }

    const client = await this.initializeClient(tenantId);
    const tenantConfig = this.tenantConnectionService.getTenantConfig(tenantId);
    this.logger.debug('tenantConfig', { tenantConfig });

    const callbackParams = new URLSearchParams(query);
    // client.callback() returns our appState (passed to authorize()) as 'state'
    const { session: oauthSession, state: appState } =
      await client.callback(callbackParams);
    this.logger.debug('Obtained OAuth session from callback', { appState });

    // Retrieve stored platform using our appState (for mobile apps)
    const platform = appState
      ? await this.getStoredPlatform(appState)
      : undefined;
    this.logger.debug('Retrieved platform from appState', {
      appState,
      platform,
    });

    const restoredSession = await client.restore(oauthSession.did);
    this.logger.debug('Restored session with tokens');

    // Check if this is a link callback
    const linkData = appState ? await this.getStoredLinkData(appState) : null;

    const agent = new Agent(restoredSession);

    // Fetch profile - optional, continue with minimal data if scope not granted
    let profile: Awaited<ReturnType<typeof agent.getProfile>> | null = null;
    try {
      profile = await agent.getProfile({ actor: oauthSession.did });
    } catch (error) {
      this.logger.warn(
        'Failed to fetch Bluesky profile (scope may not be granted):',
        error,
      );
    }

    if (linkData) {
      this.logger.debug('Detected link callback flow', {
        appState,
        userUlid: linkData.userUlid,
      });
      // Build profile object with fallbacks if getProfile failed
      const linkProfile = profile || {
        data: {
          did: oauthSession.did,
          handle: oauthSession.did, // Fallback to DID as handle
          displayName: undefined,
          avatar: undefined,
        },
      };
      return this.handleLinkCallback(
        oauthSession,
        restoredSession,
        appState!,
        tenantId,
        linkData,
        linkProfile,
      );
    }

    // Get email from session using account:email scope
    let email: string | undefined;
    let emailConfirmed: boolean = false;

    try {
      const sessionData = await agent.com.atproto.server.getSession();
      email = sessionData.data.email;
      emailConfirmed = sessionData.data.emailConfirmed || false;

      this.logger.debug('Retrieved email from Bluesky session:', {
        hasEmail: !!email,
        emailConfirmed,
      });
    } catch (error) {
      this.logger.warn('Failed to retrieve email from Bluesky session:', error);
      // Continue without email - user can add it later
    }

    const profileData = {
      did: profile?.data.did || oauthSession.did, // Fallback to session DID
      handle: profile?.data.handle || oauthSession.did, // Fallback to DID as handle
      displayName: profile?.data.displayName,
      avatar: profile?.data.avatar,
      email: email,
      emailConfirmed: emailConfirmed,
    };

    this.logger.debug('Finding existing user by AT Protocol identity:', {
      did: profileData.did,
      tenantId,
    });

    // Look up user via AT Protocol identity (primary) or legacy Bluesky (fallback)
    const { user: existingUser, foundVia } =
      await this.findUserByAtprotoIdentity(tenantId, profileData.did);

    this.logger.debug('User lookup result:', {
      did: profileData.did,
      foundVia,
      existingUserId: existingUser?.id,
      existingUserEmail: existingUser?.email,
    });

    const userService = await this.getUserService();

    // Build the social data object for auth service methods
    const socialData = {
      id: profileData.did,
      email: profileData.email || existingUser?.email || '',
      emailConfirmed: profileData.emailConfirmed,
      firstName: profileData.displayName || profileData.handle,
      lastName: '',
      avatar: profileData.avatar,
    };

    let loginResponse;

    if (existingUser) {
      this.logger.debug('Found existing user:', {
        id: existingUser.id,
        email: existingUser.email,
        provider: existingUser.provider,
        foundVia,
      });

      // Ensure that the DID is stored in preferences.bluesky.did
      // This fixes cases where users have a socialId but no DID in preferences
      if (
        existingUser.id &&
        (!existingUser.preferences?.bluesky?.did ||
          existingUser.preferences?.bluesky?.did !== profileData.did)
      ) {
        this.logger.debug('Updating user Bluesky preferences with DID', {
          userId: existingUser.id,
          did: profileData.did,
        });

        // Update preferences to include DID (handle is resolved from DID when needed)
        await userService.update(
          existingUser.id,
          {
            preferences: {
              ...(existingUser.preferences || {}),
              bluesky: {
                ...(existingUser.preferences?.bluesky || {}),
                did: profileData.did,
                avatar: profileData.avatar,
                connected: true,
                connectedAt: new Date(),
              },
            },
          },
          tenantId,
        );
      }

      // User found via identity lookup - create session directly.
      // This bypasses findOrCreateUser, avoiding duplicate email errors
      // for users who linked their ATProto identity via Settings.
      this.logger.debug(
        'Creating login session directly for known user (bypassing findOrCreateUser)',
        { userId: existingUser.id, foundVia },
      );
      loginResponse = await this.authService.createLoginSession(
        existingUser,
        'bluesky',
        socialData,
        tenantId,
      );
    } else {
      // No user found via identity lookup.
      // Check if the ATProto email matches an existing account.
      const atprotoEmail = profileData.email;
      if (atprotoEmail) {
        const emailMatch = await userService.findByEmail(
          atprotoEmail,
          tenantId,
        );

        if (emailMatch) {
          this.logger.warn(
            'ATProto login blocked: email matches existing account without linked identity',
            {
              atprotoEmail,
              existingUserId: emailMatch.id,
              existingProvider: emailMatch.provider,
              did: profileData.did,
            },
          );
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              email:
                'An account with this email already exists. Log in with your existing account, then link your AT Protocol identity in Settings.',
            },
          });
        }
      }

      // Genuinely new user - use validateSocialLogin to create account
      this.logger.debug('Creating new user via validateSocialLogin', {
        tenantId,
      });
      loginResponse = await this.authService.validateSocialLogin(
        'bluesky',
        socialData,
        tenantId,
      );
    }

    this.logger.debug('Login completed:', { tenantId });

    // Ensure AT Protocol identity record exists
    // - For users found via 'atproto-identity': record already exists, skip
    // - For users found via 'legacy-bluesky': backfill identity record
    // - For new users: create identity record
    const shouldCreateIdentityRecord =
      loginResponse.user?.ulid &&
      profileData.did &&
      foundVia !== 'atproto-identity';

    if (shouldCreateIdentityRecord) {
      // Try to get the PDS URL from the session, otherwise resolve it
      // The restoredSession's serviceUrl contains the PDS URL
      const pdsUrl =
        (restoredSession as any).pdsUrl ||
        (restoredSession as any).serviceUrl?.toString() ||
        (await this.resolvePdsUrlFromDid(profileData.did));

      await this.ensureAtprotoIdentityRecord(
        tenantId,
        loginResponse.user.ulid,
        profileData.did,
        profileData.handle,
        pdsUrl,
      );
    }

    // Only send minimal data in callback URL to avoid 414 Request-URI Too Large errors
    // The frontend will call /auth/me to get full user data with permissions
    const newParams = new URLSearchParams({
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires.toString(),
      profile: Buffer.from(JSON.stringify(profileData)).toString('base64'),
    });

    const redirectUrl = this.buildRedirectUrl(tenantId, newParams, platform);
    this.logger.debug('calling redirect to', { redirectUrl, platform });

    // Return both the redirect URL and session ID for cookie setting
    return {
      redirectUrl,
      sessionId: loginResponse.sessionId,
    };
  }

  async createAuthUrl(
    handle: string,
    tenantId: string,
    platform?: OAuthPlatform,
  ): Promise<string> {
    try {
      this.logger.debug('Creating auth URL for Bluesky OAuth', {
        handle,
        tenantId,
        platform,
        platformType: typeof platform,
      });
      const client = await this.initializeClient(tenantId);

      if (!client) {
        throw new Error('OAuth client initialization returned undefined');
      }

      // Generate our own appState to pass to authorize()
      // AT Protocol uses PAR (Pushed Authorization Request) so state isn't in the URL
      // The library stores our appState internally and returns it via client.callback()
      const appState = crypto.randomBytes(16).toString('base64url');

      this.logger.debug('Calling client.authorize', { appState });
      const url = await client.authorize(handle, {
        state: appState,
      });

      if (!url) {
        throw new Error('Failed to create authorization URL');
      }

      this.logger.debug('client.authorize returned URL', {
        hasUrl: !!url,
        urlString: url.toString(),
      });

      // Store platform in Redis keyed by appState if provided (for mobile apps)
      const isMobilePlatform = platform === 'android' || platform === 'ios';
      this.logger.debug('Checking platform for Redis storage', {
        platform,
        isMobilePlatform,
        appState,
      });

      if (platform && isMobilePlatform) {
        await this.elasticacheService.set(
          `auth:bluesky:platform:${appState}`,
          platform,
          600, // 10 minute TTL (same as state store)
        );
        this.logger.debug('Stored platform in Redis for OAuth appState', {
          appState,
          platform,
        });
      }

      this.logger.debug('Successfully created auth URL');
      return url.toString();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create auth URL: ${errorMessage}`, error);
      throw new BadRequestException(
        `Unable to start Bluesky authentication. Please try again or contact support if the problem persists.`,
      );
    }
  }

  /**
   * Create an OAuth authorization URL for linking an AT Protocol identity
   * to an existing user account.
   *
   * Similar to createAuthUrl but stores link-specific data in Redis
   * so the callback can identify this as a link flow.
   */
  async createLinkAuthUrl(
    handle: string,
    tenantId: string,
    userUlid: string,
    platform?: OAuthPlatform,
  ): Promise<string> {
    try {
      this.logger.debug('Creating link auth URL for AT Protocol', {
        handle,
        tenantId,
        userUlid,
        platform,
      });

      const client = await this.initializeClient(tenantId);
      const appState = crypto.randomBytes(16).toString('base64url');

      // Store link data in Redis so the callback knows this is a link flow
      const linkKey = `auth:bluesky:link:${appState}`;
      await this.elasticacheService.set(
        linkKey,
        JSON.stringify({ userUlid, tenantId }),
        600, // 10 minute TTL
      );

      // Verify the link data was stored (ElastiCacheService swallows errors)
      const verification = await this.elasticacheService.get<string>(linkKey);
      if (!verification) {
        this.logger.error('Failed to store link data in Redis', {
          appState,
          userUlid,
          tenantId,
        });
        throw new Error('Failed to store authentication state');
      }

      // Store platform for mobile apps (same as login flow)
      const isMobilePlatform = platform === 'android' || platform === 'ios';
      if (platform && isMobilePlatform) {
        await this.elasticacheService.set(
          `auth:bluesky:platform:${appState}`,
          platform,
          600,
        );
      }

      const url = await client.authorize(handle, { state: appState });

      if (!url) {
        throw new Error('Failed to create authorization URL');
      }

      return url.toString();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create link auth URL: ${errorMessage}`,
        error,
      );
      throw new BadRequestException(
        'Unable to start AT Protocol identity linking. Please try again.',
      );
    }
  }

  /**
   * Retrieve stored link data for a given OAuth state.
   * Single-use: deletes the data after retrieval.
   */
  async getStoredLinkData(
    appState: string,
  ): Promise<{ userUlid: string; tenantId: string } | null> {
    const data = await this.elasticacheService.get<string>(
      `auth:bluesky:link:${appState}`,
    );

    if (!data) {
      return null;
    }

    // Clean up after retrieval (single-use)
    await this.elasticacheService.del(`auth:bluesky:link:${appState}`);

    return JSON.parse(data);
  }

  /**
   * Handle the OAuth callback for an identity link flow.
   * Links or replaces the user's AT Protocol identity.
   */
  async handleLinkCallback(
    oauthSession: any,
    restoredSession: any,
    appState: string,
    tenantId: string,
    linkData: { userUlid: string; tenantId: string },
    profile: {
      data: {
        did: string;
        handle: string;
        displayName?: string;
        avatar?: string;
      };
    },
  ): Promise<{ redirectUrl: string; sessionId: string | undefined }> {
    const did = oauthSession.did;
    const handle = profile.data.handle;
    const avatar = profile.data.avatar;

    this.logger.debug('Handling link callback', {
      did,
      handle,
      userUlid: linkData.userUlid,
      tenantId,
    });

    // Check if this DID is already linked to a DIFFERENT user
    const existingDidIdentity = await this.userAtprotoIdentityService.findByDid(
      tenantId,
      did,
    );
    if (
      existingDidIdentity &&
      existingDidIdentity.userUlid !== linkData.userUlid
    ) {
      this.logger.warn('DID already linked to a different user', {
        did,
        existingUserUlid: existingDidIdentity.userUlid,
        requestingUserUlid: linkData.userUlid,
      });
      return {
        redirectUrl: this.buildLinkRedirectUrl(
          tenantId,
          false,
          'DID already linked to another account',
        ),
        sessionId: undefined,
      };
    }

    // Get existing identity for this user
    const existingIdentity =
      await this.userAtprotoIdentityService.findByUserUlid(
        tenantId,
        linkData.userUlid,
      );

    // Resolve PDS URL
    const pdsUrl =
      (restoredSession as any).pdsUrl ||
      (restoredSession as any).serviceUrl?.toString() ||
      (await this.resolvePdsUrlFromDid(did));

    // Perform identity operations with error handling
    try {
      if (existingIdentity) {
        if (existingIdentity.did === did) {
          // Same DID - update to non-custodial
          // Use resolved handle only if it's an actual handle (not a DID fallback)
          const resolvedHandle =
            handle !== did ? handle : existingIdentity.handle || handle;
          // Use resolved pdsUrl only if it was actually resolved (not the bsky.social fallback)
          const resolvedPdsUrl =
            pdsUrl !== 'https://bsky.social'
              ? pdsUrl
              : existingIdentity.pdsUrl || pdsUrl;

          this.logger.debug('Updating existing identity to non-custodial', {
            identityId: existingIdentity.id,
            did,
            resolvedHandle,
            resolvedPdsUrl,
            originalHandle: handle,
            originalPdsUrl: pdsUrl,
          });
          await this.userAtprotoIdentityService.update(
            tenantId,
            existingIdentity.id,
            {
              isCustodial: false,
              pdsCredentials: null,
              pdsUrl: resolvedPdsUrl,
              handle: resolvedHandle,
            },
          );
        } else {
          // Different DID - delete old and create new
          this.logger.debug('Replacing identity with new DID', {
            oldDid: existingIdentity.did,
            newDid: did,
          });
          await this.userAtprotoIdentityService.deleteByUserUlid(
            tenantId,
            linkData.userUlid,
          );
          await this.userAtprotoIdentityService.create(tenantId, {
            userUlid: linkData.userUlid,
            did,
            handle,
            pdsUrl,
            isCustodial: false,
            pdsCredentials: null,
          });
        }
      } else {
        // No existing identity - create new
        this.logger.debug('Creating new non-custodial identity', {
          userUlid: linkData.userUlid,
          did,
        });
        await this.userAtprotoIdentityService.create(tenantId, {
          userUlid: linkData.userUlid,
          did,
          handle,
          pdsUrl,
          isCustodial: false,
          pdsCredentials: null,
        });
      }
    } catch (error) {
      this.logger.error('Failed to update identity during link callback', {
        userUlid: linkData.userUlid,
        did,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        redirectUrl: this.buildLinkRedirectUrl(
          tenantId,
          false,
          'Failed to save identity. Please try again.',
        ),
        sessionId: undefined,
      };
    }

    // Update user preferences
    const userByUlid = await this.findUserByUlid(tenantId, linkData.userUlid);

    if (userByUlid) {
      const userService = await this.getUserService();
      await userService.update(
        userByUlid.id,
        {
          preferences: {
            ...(userByUlid.preferences || {}),
            bluesky: {
              ...(userByUlid.preferences?.bluesky || {}),
              did,
              avatar,
              connected: true,
              connectedAt: new Date(),
            },
          },
        },
        tenantId,
      );
    }

    return {
      redirectUrl: this.buildLinkRedirectUrl(tenantId, true),
      sessionId: undefined,
    };
  }

  /**
   * Build a redirect URL for the link flow result.
   */
  public buildLinkRedirectUrl(
    tenantId: string,
    success: boolean,
    error?: string,
  ): string {
    const tenantConfig = this.tenantConnectionService.getTenantConfig(tenantId);
    const baseUrl = `${tenantConfig.frontendDomain}/dashboard/profile`;

    if (success) {
      return `${baseUrl}?linkSuccess=true`;
    }
    return `${baseUrl}?linkError=${encodeURIComponent(error || 'Unknown error')}`;
  }

  /**
   * Find a user by their ULID using UserService.
   */
  private async findUserByUlid(
    tenantId: string,
    userUlid: string,
  ): Promise<any | null> {
    const userService = await this.getUserService();
    try {
      return await userService.findByUlid(userUlid, tenantId);
    } catch {
      this.logger.warn('Could not find user by ULID', { userUlid, tenantId });
      return null;
    }
  }

  async resumeSession(tenantId: string, did: string) {
    return await this.blueskyService.tryResumeSession(tenantId, did);
  }

  /**
   * Retrieve the stored platform for a given OAuth state.
   * Used by the callback to determine if this is a mobile auth flow.
   */
  async getStoredPlatform(state: string): Promise<OAuthPlatform | undefined> {
    const platform = await this.elasticacheService.get<string>(
      `auth:bluesky:platform:${state}`,
    );
    // Clean up after retrieval
    if (platform) {
      await this.elasticacheService.del(`auth:bluesky:platform:${state}`);
    }
    return platform as OAuthPlatform | undefined;
  }

  /**
   * Ensure an AT Protocol identity record exists for a Bluesky user.
   * Creates a non-custodial identity record if one doesn't exist.
   *
   * This is called during login to backfill existing Bluesky users
   * who don't yet have an entry in userAtprotoIdentities.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @param did - The user's DID (decentralized identifier)
   * @param handle - The user's Bluesky handle (can be null)
   * @param pdsUrl - The URL of the user's PDS
   */
  async ensureAtprotoIdentityRecord(
    tenantId: string,
    userUlid: string,
    did: string,
    handle: string | null,
    pdsUrl: string,
  ): Promise<void> {
    try {
      // Check if record already exists
      const existingIdentity =
        await this.userAtprotoIdentityService.findByUserUlid(
          tenantId,
          userUlid,
        );

      if (existingIdentity) {
        this.logger.debug('AT Protocol identity record already exists', {
          userUlid,
          did,
        });
        return;
      }

      // Create new identity record for Bluesky user (non-custodial)
      this.logger.debug(
        'Creating AT Protocol identity record for Bluesky user',
        {
          userUlid,
          did,
          handle,
          pdsUrl,
        },
      );

      await this.userAtprotoIdentityService.create(tenantId, {
        userUlid,
        did,
        handle,
        pdsUrl,
        isCustodial: false,
        pdsCredentials: null,
      });

      this.logger.log('Created AT Protocol identity record for Bluesky user', {
        userUlid,
        did,
      });
    } catch (error) {
      // Log but don't throw - this is a best-effort operation
      // The user can still log in even if we fail to create the identity record
      this.logger.error(
        'Failed to create AT Protocol identity record for Bluesky user',
        {
          userUlid,
          did,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Resolve the PDS URL for a given DID.
   * Uses BlueskyIdentityService to resolve the DID document and extract the PDS endpoint.
   *
   * @param did - The DID to resolve
   * @returns The PDS URL, or a fallback URL if resolution fails
   */
  async resolvePdsUrlFromDid(did: string): Promise<string> {
    try {
      const profile = await this.blueskyIdentityService.resolveProfile(did);
      return profile.pdsUrl;
    } catch (error) {
      this.logger.warn('Failed to resolve PDS URL from DID, using fallback', {
        did,
        error: error instanceof Error ? error.message : String(error),
      });
      // Use configured PDS_URL if available (for self-hosted PDS environments)
      // eslint-disable-next-line no-restricted-syntax
      const configuredPdsUrl = this.configService.get<string>('PDS_URL');
      return configuredPdsUrl || 'https://bsky.social';
    }
  }
}
