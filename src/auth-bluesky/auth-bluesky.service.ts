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
import { ConnectBlueskyDto } from './dto/auth-bluesky-connect.dto';
import { BlueskyService } from '../bluesky/bluesky.service';
import { initializeOAuthClient } from '../utils/bluesky';

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
      throw new BadRequestException('Tenant ID is required');
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

    loginResponse.user = {
      ...loginResponse.user,
      socialId: profileData.did,
    };

    this.logger.debug('login Response', { loginResponse });

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

  async handleDevLogin(connectDto: ConnectBlueskyDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('This endpoint is only available in development');
    }

    this.logger.debug('handleDevLogin', {
      identifier: connectDto.identifier,
      tenantId: connectDto.tenantId,
    });

    const agent = await this.blueskyService.connectAccount(
      connectDto.identifier,
      connectDto.password,
      connectDto.tenantId,
    );
    const profile = await agent.getProfile({
      actor: agent.session?.did as string,
    });
    const profileData = {
      did: profile.data.did,
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
    };

    this.logger.debug('Profile data:', profileData);

    const loginResponse = await this.authService.validateSocialLogin(
      'bluesky',
      {
        id: profileData.did,
        email: '',
        firstName: profileData.displayName || profileData.handle,
        lastName: '',
      },
      connectDto.tenantId,
    );

    const responseWithSocialId = {
      ...loginResponse,
      user: {
        ...loginResponse.user,
        socialId: profileData.did,
      },
      profile: profileData,
    };

    this.logger.debug('Final response:', responseWithSocialId);

    return responseWithSocialId;
  }

  async resumeSession(tenantId: string, did: string) {
    return await this.blueskyService.resumeSession(tenantId, did);
  }
}
