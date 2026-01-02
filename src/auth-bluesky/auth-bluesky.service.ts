import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@atproto/api';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { OAuthPlatform } from '../auth/types/oauth.types';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { UserService } from '../user/user.service';
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
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
  ) {
    this.logger.log('AuthBlueskyService constructed');
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
      const customScheme = this.configService.get<string>(
        'MOBILE_CUSTOM_URL_SCHEME',
        'net.openmeet.platform',
      );
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

    const agent = new Agent(restoredSession);

    const profile = await agent.getProfile({ actor: oauthSession.did });

    // Get email from session using transition:email scope
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
      did: profile.data.did, // Important: This will be stored as socialId
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
      email: email,
      emailConfirmed: emailConfirmed,
    };

    this.logger.debug('Finding existing user:', {
      socialId: profileData.did,
      provider: 'bluesky',
      tenantId,
    });

    // Get existing user if any to preserve preferences
    const existingUser = (await this.userService.findBySocialIdAndProvider(
      {
        socialId: profileData.did,
        provider: 'bluesky',
      },
      tenantId,
    )) as UserEntity;

    this.logger.debug('Validating social login:', {
      did: profileData.did,
      displayName: profileData.displayName,
      handle: profileData.handle,
      tenantId,
      existingUserEmail: existingUser?.email,
    });

    if (existingUser) {
      this.logger.debug('Found existing user:', {
        id: existingUser.id,
        email: existingUser.email,
        provider: existingUser.provider,
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
        await this.userService.update(
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
    }

    this.logger.debug('Validating social login with tenant ID:', { tenantId });
    const loginResponse = await this.authService.validateSocialLogin(
      'bluesky',
      {
        id: profileData.did,
        email: profileData.email || existingUser?.email || '',
        emailConfirmed: profileData.emailConfirmed,
        firstName: profileData.displayName || profileData.handle,
        lastName: '',
        // Handle is not stored - it's resolved from DID when needed
      },
      tenantId,
    );
    this.logger.debug('Social login validated:', { loginResponse, tenantId });

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
}
