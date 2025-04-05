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
import crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { UserService } from '../user/user.service';
import { initializeOAuthClient } from '../utils/bluesky';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';

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
      did: profile.data.did,
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
    };

    // const atpSession: AtpSessionData = {
    //   did: a
    //   handle: agent.session?.handle as string,
    //   accessJwt: agent.session?.accessJwt as string,
    //   refreshJwt: agent.session?.refreshJwt as string,
    //   email: '',
    //   active: true,
    // };
    // await this.blueskyService.storeSession(tenantId, atpSession);

    this.logger.debug('Finding existing user:', {
      socialId: profileData.did,
      provider: 'bluesky',
      tenantId,
    });

    // Get existing user if any to preserve preferences
    const existingUser = await this.userService.findBySocialIdAndProvider(
      {
        socialId: profileData.did,
        provider: 'bluesky',
      },
      tenantId,
    );

    this.logger.debug('Validating social login:', {
      did: profileData.did,
      displayName: profileData.displayName,
      handle: profileData.handle,
      tenantId,
    });

    this.logger.debug('Validating social login with tenant ID:', { tenantId });
    const loginResponse = await this.authService.validateSocialLogin(
      'bluesky',
      {
        id: profileData.did,
        email: '',
        firstName: profileData.displayName || profileData.handle,
        lastName: '',
      },
      tenantId,
    );
    this.logger.debug('Social login validated:', { loginResponse, tenantId });

    this.logger.debug('Getting user entity:', {
      userId: loginResponse.user.id,
      tenantId,
    });

    // Get the full user entity to update preferences
    const userEntity = await this.userService.findById(
      loginResponse.user.id,
      tenantId,
    );

    if (!userEntity) {
      this.logger.error('User entity not found:', {
        userId: loginResponse.user.id,
        tenantId,
      });
      throw new BadRequestException('User not found');
    }

    if (!userEntity) {
      throw new BadRequestException('User not found');
    }

    // Preserve existing Bluesky preferences if they exist
    const existingPreferences =
      (existingUser as UserEntity)?.preferences?.bluesky || {};

    this.logger.debug('Existing Bluesky preferences:', { existingPreferences });

    // For new users or existing users without preferences, set initial state
    const isNewUser = !existingUser || !existingPreferences.did;
    const now = new Date();

    const updatedPreferences = {
      ...existingPreferences,
      did: profileData.did,
      handle: profileData.handle,
      avatar: profileData.avatar,
      // For new users, set connected to true and record the time
      // For existing users, preserve their connection state
      connected: isNewUser ? true : existingPreferences.connected,
      connectedAt: isNewUser ? now : existingPreferences.connectedAt,
      disconnectedAt: isNewUser ? null : existingPreferences.disconnectedAt,
      autoPost: existingPreferences.autoPost || false,
    };

    this.logger.debug('Updated Bluesky preferences:', {
      updatedPreferences,
      isNewUser,
      existingUserId: existingUser?.id,
    });

    // Prepare the update payload
    const updatePayload: any = {
      socialId: profileData.did,
    };

    // Compare the values to see if anything has actually changed
    const hasPreferencesChanged =
      userEntity.preferences?.bluesky?.did !== profileData.did ||
      userEntity.preferences?.bluesky?.handle !== profileData.handle ||
      userEntity.preferences?.bluesky?.avatar !== profileData.avatar;

    this.logger.debug('Checking for changes:', {
      currentDid: userEntity.preferences?.bluesky?.did,
      newDid: profileData.did,
      currentHandle: userEntity.preferences?.bluesky?.handle,
      newHandle: profileData.handle,
      currentAvatar: userEntity.preferences?.bluesky?.avatar,
      newAvatar: profileData.avatar,
      hasPreferencesChanged,
    });

    // Only update if something has changed
    if (hasPreferencesChanged) {
      updatePayload.preferences = {
        ...userEntity.preferences,
        bluesky: {
          ...userEntity.preferences?.bluesky, // Keep existing preferences
          did: profileData.did,
          handle: profileData.handle,
          avatar: profileData.avatar,
        },
      };
    }

    // Only include photo if it has changed
    const hasPhotoChanged =
      userEntity.photo?.id !== loginResponse.user.photo?.id;
    if (hasPhotoChanged && userEntity.photo?.id) {
      updatePayload.photo = { id: userEntity.photo.id };
    }

    this.logger.debug('Update decision:', {
      hasPreferencesChanged,
      hasPhotoChanged,
      willUpdate:
        hasPreferencesChanged ||
        hasPhotoChanged ||
        Object.keys(updatePayload).length > 1,
    });

    let verifiedUser;
    try {
      // Save the updated user and verify the update
      this.logger.debug('Attempting to update user with payload:', {
        userId: loginResponse.user.id,
        updatePayload,
        tenantId,
      });

      // Only perform update if we have actual changes
      if (hasPreferencesChanged || hasPhotoChanged) {
        await this.userService.update(
          loginResponse.user.id,
          updatePayload,
          tenantId,
        );
      } else {
        this.logger.debug('Skipping update - no changes detected');
      }

      // Verify preferences were saved correctly
      verifiedUser = await this.userService.findById(
        loginResponse.user.id,
        tenantId,
      );

      if (!verifiedUser) {
        this.logger.error('Failed to verify user update - user not found', {
          userId: loginResponse.user.id,
          tenantId,
        });
        throw new Error('Failed to verify user update');
      }

      this.logger.debug('Verified user preferences after update:', {
        blueskyPreferences: verifiedUser.preferences?.bluesky,
        userId: verifiedUser.id,
        tenantId,
      });

      if (!verifiedUser.preferences?.bluesky?.connected && isNewUser) {
        this.logger.warn(
          'Bluesky preferences not properly persisted for new user',
          {
            userId: verifiedUser.id,
            preferences: verifiedUser.preferences,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to update user preferences:', {
        error: error.message,
        errorName: error.name,
        errorStack: error.stack,
        userId: loginResponse.user.id,
        updatePayload,
        tenantId,
      });

      // Rethrow with more specific error message
      throw new BadRequestException(
        `Failed to update user preferences: ${error.message}`,
      );
    }

    // Update the login response with the updated user entity
    loginResponse.user = {
      ...loginResponse.user,
      socialId: profileData.did,
    };

    this.logger.debug('login Response', { loginResponse });

    // Materialize the user's Bluesky events after successful login
    try {
      this.logger.debug('Starting materialization of Bluesky events for user', {
        userId: loginResponse.user.id,
      });

      const materialized =
        await this.eventSeriesOccurrenceService.bufferBlueskyMaterialization(
          loginResponse.user.id,
        );

      this.logger.debug('Completed materialization of Bluesky events', {
        userId: loginResponse.user.id,
        materialized,
      });
    } catch (error) {
      // Log the error but don't block the login process
      this.logger.error('Failed to materialize Bluesky events', {
        userId: loginResponse.user.id,
        error: error.message,
        stack: error.stack,
      });
    }

    const newParams = new URLSearchParams({
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires.toString(),
      user: Buffer.from(JSON.stringify(loginResponse.user || {})).toString(
        'base64',
      ),
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
    return await this.blueskyService.resumeSession(tenantId, did);
  }
}
