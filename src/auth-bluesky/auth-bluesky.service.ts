import {
  BadRequestException,
  Inject,
  Injectable,
  Scope,
  Logger,
} from '@nestjs/common';
import {
  ElastiCacheStateStore,
  ElastiCacheSessionStore,
} from './stores/elasticache-stores';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { ConfigService } from '@nestjs/config';
import {
  NodeOAuthClient,
  NodeOAuthClientOptions,
} from '@atproto/oauth-client-node';
import { Agent, AtpSessionData } from '@atproto/api';
import { JoseKey } from '@atproto/jwk-jose';
import crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { ConnectBlueskyDto } from './dto/auth-bluesky-connect.dto';
import { BlueskyService } from '../bluesky/bluesky.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthBlueskyService {
  private readonly logger = new Logger(AuthBlueskyService.name);
  private tenantConfig: TenantConfig;
  private client: NodeOAuthClient;

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
    this.tenantConfig = this.tenantConnectionService.getTenantConfig(tenantId);
    const baseUrl = this.configService.get('BACKEND_DOMAIN', {
      infer: true,
    }) as string;

    if (!baseUrl) {
      throw new Error('BACKEND_DOMAIN not configured');
    }

    const keyset = await this.loadKeys();
    if (keyset.length === 0) {
      throw new Error('No valid keys found in environment variables');
    }

    const clientConfig: NodeOAuthClientOptions = {
      clientMetadata: {
        client_id: `${baseUrl}/api/v1/auth/bluesky/client-metadata.json?tenantId=${tenantId}`,
        client_name: 'OpenMeet',
        client_uri: baseUrl,
        logo_uri: `${baseUrl}/logo.png`,
        tos_uri: `${baseUrl}/terms`,
        policy_uri: `${baseUrl}/policy`,
        redirect_uris: [
          `${baseUrl}/api/v1/auth/bluesky/callback?tenantId=${tenantId}`,
        ],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'atproto transition:generic',
        application_type: 'web',
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'ES256',
        dpop_bound_access_tokens: true,
        jwks_uri: `${baseUrl}/api/v1/auth/bluesky/jwks.json?tenantId=${tenantId}`,
      },
      keyset,
      stateStore: new ElastiCacheStateStore(this.elasticacheService),
      sessionStore: new ElastiCacheSessionStore(this.elasticacheService),
    };
    this.client = new NodeOAuthClient(clientConfig);

    return this.client;
  }

  private async loadKeys(): Promise<JoseKey[]> {
    const keys: JoseKey[] = [];

    for (let i = 1; i <= 3; i++) {
      const encodedKeyData: string =
        this.configService.get(`BLUESKY_KEY_${i}`, {
          infer: true,
        }) || '';
      if (!encodedKeyData) {
        console.warn(`BLUESKY_KEY_${i} not found in environment variables`);
        continue;
      }

      try {
        // Decode base64 string to UTF-8 string
        const keyData = Buffer.from(encodedKeyData, 'base64').toString('utf-8');

        // Validate PKCS#8 format
        if (!keyData.includes('-----BEGIN PRIVATE KEY-----')) {
          console.error(`BLUESKY_KEY_${i} is not in PKCS#8 format`);
          continue;
        }

        const key = await JoseKey.fromImportable(keyData.trim(), `key${i}`);
        keys.push(key);
      } catch (error) {
        console.error(`Failed to load BLUESKY_KEY_${i}:`, error);
      }
    }

    return keys;
  }

  async getProfileFromParams(params: URLSearchParams) {
    this.logger.debug('getProfileFromParams', { params });

    try {
      const { session, state } = await this.client.callback(params);
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
      this.logger.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        params: Object.fromEntries(params.entries()),
      });
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  async handleAuthCallback(query: any, tenantId: string): Promise<string> {
    this.logger.log('Starting OAuth callback handling');
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }
    await this.initializeClient(tenantId);

    // Get the session from the callback
    this.logger.warn('oauth query:', query);
    const { session } = await this.client.callback(new URLSearchParams(query));
    const profile = await this.getProfileFromParams(new URLSearchParams(query));

    this.logger.warn('oauth session:', session);
    this.logger.warn('oauth session type:', typeof session);
    this.logger.warn('oauth session keys:', Object.keys(session));

    // Store the session
    if (session?.did) {
      const atpSession: AtpSessionData = {
        did: session.did,
        handle: profile.handle,
        accessJwt: 'test', // Try using the method if it exists
        refreshJwt: 'test',
        active: true,
      };
      await this.blueskyService.storeSession(tenantId, atpSession);
    }

    // Use the common auth service to create/update user and generate token
    const loginResponse = await this.authService.validateSocialLogin(
      'bluesky',
      {
        id: profile.did,
        email: '',
        firstName: profile.displayName || profile.handle,
        lastName: '',
      },
      tenantId,
    );

    // Redirect to frontend with full login response
    const params = new URLSearchParams({
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires.toString(),
      user: Buffer.from(JSON.stringify(loginResponse.user || {})).toString(
        'base64',
      ),
      profile: Buffer.from(JSON.stringify(profile || {})).toString('base64'),
    });

    return `${this.tenantConfig.frontendDomain}/auth/bluesky/callback?${params.toString()}`;
  }

  async createAuthUrl(handle: string, tenantId: string): Promise<string> {
    await this.initializeClient(tenantId);

    const url = await this.client.authorize(handle, {
      // scope: 'atproto transition:generic',
      state: crypto.randomBytes(16).toString('base64url'),
    });

    if (!url) {
      throw new Error(`Failed to create authorization URL ${url}`);
    }

    return url.toString();
  }

  async handleDevLogin(connectDto: ConnectBlueskyDto) {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      throw new Error('This endpoint is only available in development');
    }

    this.logger.debug('handleDevLogin', {
      identifier: connectDto.identifier,
      tenantId: connectDto.tenantId,
    });

    // Connect and store session
    const agent = await this.blueskyService.connectAccount(
      connectDto.identifier,
      connectDto.password,
      connectDto.tenantId,
      undefined,
    );

    if (!agent.session?.did) {
      throw new Error('Failed to get DID from Bluesky session');
    }

    // Get the profile info
    const profile = await agent.getProfile({ actor: agent.session.did });
    const profileData = {
      did: profile.data.did,
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
    };

    this.logger.debug('Profile data:', profileData);

    // Use the common auth service directly instead of OAuth flow
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

    this.logger.debug('Login response:', loginResponse);

    // Add socialId to user object in response
    const responseWithSocialId = {
      ...loginResponse,
      user: {
        ...loginResponse.user,
        socialId: profileData.did, // Add the DID as socialId
      },
      profile: profileData,
    };

    this.logger.debug('Final response:', responseWithSocialId);

    return responseWithSocialId;
  }
}
