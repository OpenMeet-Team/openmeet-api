// openmeet-api/src/utils/bluesky.ts
import { ConfigService } from '@nestjs/config';
import {
  ElastiCacheStateStore,
  ElastiCacheSessionStore,
} from '../auth-bluesky/stores/elasticache-stores';
import {
  NodeOAuthClient,
  NodeOAuthClientOptions,
} from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { createRequestLock } from '../auth-bluesky/stores/redlock';

/**
 * Restores and initializes the OAuth client using the tenant configuration,
 * backend domain, and the available keys.
 *
 * @param tenantId - The tenant identifier.
 * @param configService - The application's ConfigService.
 * @param elasticacheService - The caching service for state/session persistence.
 * @returns A Promise resolving to a new NodeOAuthClient.
 */

export async function initializeOAuthClient(
  tenantId: string,
  configService: ConfigService,
  elasticacheService: ElastiCacheService,
): Promise<NodeOAuthClient> {
  const redisConfig = elasticacheService.getRedisConfig();
  const requestLock = createRequestLock({
    host: redisConfig.host as string,
    port: Number(redisConfig.port),
    tls: redisConfig.tls,
    password: redisConfig.password as string | undefined,
  });

  const baseUrl = configService.get('BACKEND_DOMAIN', {
    infer: true,
  }) as string;
  if (!baseUrl) {
    throw new Error('BACKEND_DOMAIN not configured');
  }

  const keyset = await loadKeys(configService);
  if (keyset.length === 0) {
    console.warn('No valid Bluesky keys found in environment variables. Bluesky integration will not be available.');
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
    stateStore: new ElastiCacheStateStore(elasticacheService),
    sessionStore: new ElastiCacheSessionStore(elasticacheService),
    requestLock,
  };

  return new NodeOAuthClient(clientConfig);
}

async function loadKeys(configService: ConfigService): Promise<JoseKey[]> {
  const keys: JoseKey[] = [];

  for (let i = 1; i <= 3; i++) {
    const encodedKeyData: string =
      configService.get(`BLUESKY_KEY_${i}`, {
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