import {
  BadRequestException,
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
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
    console.log('clientConfig', clientConfig);
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
    console.log('Doing callback, params', params);

    // Debug: Check if we can access Redis
    const stateKey = `auth:bluesky:state:${params.get('state')}`;
    console.log('Checking state in Redis with key:', stateKey);

    try {
      // Check if state exists in Redis directly
      const stateExists = await this.elasticacheService.get(stateKey);
      console.log('State in Redis:', stateExists);

      const { session, state } = await this.client.callback(params);
      console.log('state in handleCallback', state);
      console.log('session in handleCallback', session);

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
      console.error('Callback error:', error);
      console.error('Full error details:', {
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

  async getProfileByToken(
    loginDto: AuthBlueskyLoginDto,
  ): Promise<SocialInterface> {
    try {
      const client = await this.initializeClient(loginDto.tenantId);

      // Exchange code for session
      const { session, state } = await client.callback(
        new URLSearchParams({
          code: loginDto.code,
          state: loginDto.state,
        }),
      );

      // does state match?
      // if (state !== loginDto.state) {
      //   throw new UnprocessableEntityException('State mismatch');
      // }

      // Get user profile
      const agent = new Agent(session);
      if (!agent.did) throw new Error('DID not found in session');
      const profile = await agent.getProfile({ actor: agent.did });

      if (!profile.data) {
        throw new UnprocessableEntityException('Invalid profile data');
      }

      return {
        id: profile.data.did,
        email: `${profile.data.handle}@bsky.social`,
        firstName: profile.data.displayName || profile.data.handle,
        lastName: '',
        avatar: profile.data.avatar,
      };
    } catch (error) {
      throw new UnprocessableEntityException(error.message);
    }
  }

  async authorize(handle: string) {
    const state = crypto.randomBytes(16).toString('base64url');
    console.log('Generated state:', state);

    // Debug: Store state in Redis directly
    const stateKey = `auth:bluesky:state:${state}`;
    await this.elasticacheService.set(stateKey, { handle }, 600); // 10 minute TTL
    console.log('Stored state in Redis with key:', stateKey);

    console.log('handle', handle);
    console.log('going to authorize');
    const url = await this.client.authorize(handle, { state });
    console.log('after authorize url', url);

    return url;
  }

  async initiateLogin(
    handle: string,
    tenantId: string,
  ): Promise<{ url: URL; tenantConfig: TenantConfig }> {
    if (!handle || !handle.match(/^[a-zA-Z0-9._-]+$/)) {
      throw new BadRequestException(
        'Handle must not be empty and contain only letters, numbers, dots, hyphens, and underscores',
      );
    }

    // Initialize client if not already initialized
    if (!this.client) {
      await this.initializeClient(tenantId);
    }

    if (!this.client) {
      throw new Error('Failed to initialize Bluesky OAuth client');
    }

    console.log('going to authorize in initiateLogin');
    try {
      const authUrl = await this.authorize(handle);
      console.log('after authorize in initiateLogin', authUrl);

      return {
        url: authUrl,
        tenantConfig: this.tenantConfig,
      };
    } catch (error) {
      console.error('Authorization error:', error);
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        handle,
        tenantId,
      });
      throw error;
    }
  }

  async handleAuthCallback(query: any, tenantId?: string): Promise<string> {
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

    // Redirect to frontend with token
    return `${this.tenantConfig.frontendDomain}/?token=${loginResponse.token}`;
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
