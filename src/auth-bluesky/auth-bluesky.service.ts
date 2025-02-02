import {
  BadRequestException,
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
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
import { Agent } from '@atproto/api';
import { JoseKey } from '@atproto/jwk-jose';
import crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { AuthBlueskyLoginDto } from './dto/auth-bluesky-login.dto';
import { SocialInterface } from '../social/interfaces/social.interface';
import { ElastiCacheService } from '../elasticache/elasticache.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthBlueskyService {
  private logger = new Logger(AuthBlueskyService.name);
  private tenantConfig: TenantConfig;
  private client: NodeOAuthClient;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private tenantService: TenantConnectionService,
    private configService: ConfigService,
    private jwtService: JwtService,
    private authService: AuthService,
    private elasticacheService: ElastiCacheService,
  ) {}

  public async initializeClient(tenantId: string) {
    this.tenantConfig = this.tenantService.getTenantConfig(tenantId);
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

  async handleCallback(params: URLSearchParams) {
    this.logger.debug('handleCallback', { params });

    try {
      const { session, state } = await this.client.callback(params);
      this.logger.debug('handleCallback', { state, session });

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

  async authorize(handle: string) {
    const state = crypto.randomBytes(16).toString('base64url');
    const url = await this.client.authorize(handle, { state });
    return url;
  }

  async handleAuthCallback(query: any, tenantId?: string): Promise<string> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }
    await this.initializeClient(tenantId);
    const profile = await this.handleCallback(new URLSearchParams(query));

    // Use the common auth service to create/update user and generate token
    const loginResponse = await this.authService.validateSocialLogin(
      'bluesky',
      {
        id: profile.did,
        email: `${profile.handle}@bsky.social`, // or null if email not needed
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
      user: JSON.stringify(loginResponse.user),
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
}
