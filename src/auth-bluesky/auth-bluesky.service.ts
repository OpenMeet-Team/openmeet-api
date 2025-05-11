import {
  BadRequestException,
  Inject,
  Injectable,
  Scope,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@atproto/api';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { UserService } from '../user/user.service';
import { initializeOAuthClient } from '../utils/bluesky';
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthBlueskyService {
  private readonly logger = new Logger(AuthBlueskyService.name);
  private tenantConfig: TenantConfig;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private configService: ConfigService,
    private authService: AuthService,
    private elasticacheService: ElastiCacheService,
    private blueskyService: BlueskyService,
    private userService: UserService,
    private eventSeriesOccurrenceService: EventSeriesOccurrenceService,
  ) {
    this.logger.log('AuthBlueskyService constructed');
  }

  public async initializeClient(tenantId: string) {
    return await initializeOAuthClient(
      tenantId,
      this.configService,
      this.elasticacheService,
    );
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

  async handleAuthCallback(query: any, tenantId: string): Promise<string> {
    this.logger.debug('handleAuthCallback', { query, tenantId });
    if (!tenantId) {
      // Check if tenantId is in the request object
      const requestTenantId = this.request?.tenantId;
      if (!requestTenantId) {
        this.logger.error('No tenant ID found in request or parameters');
        throw new BadRequestException('Tenant ID is required');
      }
      tenantId = requestTenantId;
      this.logger.debug('Using tenant ID from request:', { tenantId });
    }

    const client = await this.initializeClient(tenantId);
    const tenantConfig = this.tenantConnectionService.getTenantConfig(tenantId);
    this.logger.debug('tenantConfig', { tenantConfig });

    const callbackParams = new URLSearchParams(query);
    const { session: oauthSession } = await client.callback(callbackParams);
    this.logger.debug('Obtained OAuth session from callback');

    const restoredSession = await client.restore(oauthSession.did);
    this.logger.debug('Restored session with tokens');

    const agent = new Agent(restoredSession);

    const profile = await agent.getProfile({ actor: oauthSession.did });
    const profileData = {
      did: profile.data.did, // Important: This will be stored as socialId
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
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

        // Update preferences to include DID
        await this.userService.update(
          existingUser.id,
          {
            preferences: {
              ...(existingUser.preferences || {}),
              bluesky: {
                ...(existingUser.preferences?.bluesky || {}),
                did: profileData.did,
                handle: profileData.handle,
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
        email: existingUser?.email || '',
        firstName: profileData.displayName || profileData.handle,
        lastName: '',
      },
      tenantId,
    );
    this.logger.debug('Social login validated:', { loginResponse, tenantId });

    // // Materialize the user's Bluesky events after successful login
    // // Using a timeout to avoid blocking the login response
    // setTimeout(async () => {
    //   try {
    //     this.logger.debug(
    //       'Starting materialization of Bluesky events for user',
    //       {
    //         userId: loginResponse.user.id,
    //       },
    //     );

    //     const materialized =
    //       await this.eventSeriesOccurrenceService.bufferBlueskyMaterialization(
    //         loginResponse.user.id,
    //         tenantId,
    //       );

    //     this.logger.debug('Completed materialization of Bluesky events', {
    //       userId: loginResponse.user.id,
    //       materialized,
    //     });
    //   } catch (error) {
    //     this.logger.error(
    //       `Error in materialization: ${error.message}`,
    //       error.stack,
    //     );
    //   }
    // }, 100); // Small delay to ensure login response is sent first

    const newParams = new URLSearchParams({
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires.toString(),
      user: Buffer.from(
        JSON.stringify({
          ...loginResponse.user,
          socialId: profileData.did,
        }),
      ).toString('base64'),
      profile: Buffer.from(JSON.stringify(profileData)).toString('base64'),
    });

    this.logger.debug(
      'calling redirect to ',
      `${tenantConfig.frontendDomain}/auth/bluesky/callback?${newParams.toString()}`,
    );
    return `${tenantConfig.frontendDomain}/auth/bluesky/callback?${newParams.toString()}`;
  }

  async createAuthUrl(handle: string, tenantId: string): Promise<string> {
    const client = await this.initializeClient(tenantId);
    const url = await client.authorize(handle, {
      state: crypto.randomBytes(16).toString('base64url'),
    });

    if (!url) {
      throw new Error(`Failed to create authorization URL ${url}`);
    }

    return url.toString();
  }

  async resumeSession(tenantId: string, did: string) {
    return await this.blueskyService.tryResumeSession(tenantId, did);
  }
}
