import {
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BskyAgent } from '@atproto/api';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthBlueskyLoginDto } from './dto/auth-bluesky-login.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { ConfigService } from '@nestjs/config';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { Agent } from '@atproto/api';
import { JoseKey } from '@atproto/jwk-jose';

class InMemoryStore {
  private storeData = {};

  set(key: string, value: any) {
    this.storeData[key] = value;
  }

  get(key: string) {
    return this.storeData[key];
  }

  del(key: string) {
    delete this.storeData[key];
  }
}

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthBlueskyService {
  private tenantConfig: TenantConfig;
  private client: NodeOAuthClient;
  private readonly stateStore = new InMemoryStore();
  private readonly sessionStore = new InMemoryStore();

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private tenantService: TenantConnectionService,
    private configService: ConfigService,
  ) {
    this.initializeClient().catch((error) => {
      console.error('Failed to initialize Bluesky OAuth client', error);
    });
  }

  getAuthorizationUrl(): string {
    const baseUrl =
      this.tenantConfig.blueskyConfig?.serviceUrl || 'https://bsky.social';
    return `${baseUrl}/authorize?client_id=${this.tenantConfig.blueskyConfig?.clientId}&scope=read write&response_type=code`;
  }

  async getProfileByToken(
    loginDto: AuthBlueskyLoginDto,
  ): Promise<SocialInterface> {
    try {
      const agent = new BskyAgent({
        service:
          this.tenantConfig.blueskyConfig?.serviceUrl || 'https://bsky.social',
      });

      // TODO: Implement token exchange once AT Protocol OAuth is fully available
      // For now, we'll use the temporary app password flow
      await agent.login({
        identifier: loginDto.code,
        password: loginDto.code,
      });

      const profile = await agent.getProfile({
        actor: agent.session?.did || '',
      });

      if (!profile.data.handle) {
        throw new UnprocessableEntityException('Profile not found');
      }

      return {
        id: profile.data.did,
        email: `${profile.data.handle}@bsky.social`,
        firstName: profile.data.displayName?.split(' ')[0] || '',
        lastName: profile.data.displayName?.split(' ').slice(1).join(' ') || '',
      };
    } catch (error) {
      throw new UnprocessableEntityException(
        error.response?.data?.message || 'Invalid Bluesky credentials',
      );
    }
  }

  private async initializeClient() {
    const baseUrl = this.configService.get('BACKEND_DOMAIN', {
      infer: true,
    }) as string;
    if (!baseUrl) throw new Error('BACKEND_DOMAIN not configured');

    // Fix the URLs to use 127.0.0.1 instead of localhost and ensure https
    const isLocal =
      baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost');
    const clientId = isLocal
      ? `http://127.0.0.1/client-metadata.json?redirect_uri=${encodeURIComponent(`${baseUrl}/api/v1/auth/bluesky/callback`)}&scope=${encodeURIComponent('atproto transition:generic')}`
      : `${baseUrl}/api/v1/auth/bluesky/client-metadata.json`;

    const keyset = await Promise.all([
      JoseKey.fromImportable(
        this.configService.get('BLUESKY_PRIVATE_KEY_1', { infer: true })!,
        'key1',
      ),
      JoseKey.fromImportable(
        this.configService.get('BLUESKY_PRIVATE_KEY_2', { infer: true })!,
        'key2',
      ),
      JoseKey.fromImportable(
        this.configService.get('BLUESKY_PRIVATE_KEY_3', { infer: true })!,
        'key3',
      ),
    ]);

    console.log('keyset', keyset);
    console.log('clientId', clientId);
    console.log('baseUrl', baseUrl);

    this.client = new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: 'OpenMeet',
        client_uri: baseUrl,
        logo_uri: `${baseUrl}/logo.png`,
        tos_uri: `${baseUrl}/terms`,
        policy_uri: `${baseUrl}/policy`,
        redirect_uris: [
          `${baseUrl.replace('localhost', '127.0.0.1')}/api/v1/auth/bluesky/callback`,
        ],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'atproto transition:generic',
        application_type: 'web',
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
        dpop_bound_access_tokens: true,
        jwks_uri: `${baseUrl}/api/v1/auth/bluesky/jwks.json`,
      },
      keyset,
      stateStore: this.stateStore,
      sessionStore: this.sessionStore,
    });
  }

  async handleCallback(params: URLSearchParams) {
    const { session } = await this.client.callback(params);
    const agent = new Agent(session);
    if (!agent.did) throw new Error('DID not found in session');

    const profile = await agent.getProfile({ actor: agent.did });
    return {
      did: profile.data.did,
      handle: profile.data.handle,
      displayName: profile.data.displayName,
      avatar: profile.data.avatar,
    };
  }

  getClient() {
    return this.client;
  }

  async authorize(handle: string) {
    return this.client.authorize(handle);
  }
}
