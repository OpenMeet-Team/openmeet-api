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
  const requestLock = await createRequestLock({
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
    console.warn(
      'No valid Bluesky keys found in environment variables. Bluesky integration will not be available.',
    );
    throw new Error('No valid keys found in environment variables');
  }

  // When DID_PLC_URL is set (e.g. in dev), create a fetch wrapper that
  // tries the private PLC before falling back to public plc.directory.
  // This is needed because the private PLC doesn't federate with public plc.directory.
  const didPlcUrl = configService.get('DID_PLC_URL', {
    infer: true,
  }) as string | undefined;
  const customFetch = createPlcFallbackFetch(didPlcUrl);

  // Use path-based tenant routing for OAuth metadata URLs.
  // The PDS strips query parameters when fetching client metadata,
  // so we must embed tenantId in the URL path instead.
  const clientConfig: NodeOAuthClientOptions = {
    ...(customFetch && { fetch: customFetch }),
    clientMetadata: {
      client_id: `${baseUrl}/api/v1/auth/bluesky/t/${tenantId}/client-metadata.json`,
      client_name: 'OpenMeet',
      client_uri: baseUrl,
      logo_uri: `${baseUrl}/logo.png`,
      tos_uri: `${baseUrl}/terms`,
      policy_uri: `${baseUrl}/policy`,
      redirect_uris: [`${baseUrl}/api/v1/auth/bluesky/t/${tenantId}/callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope:
        'atproto account:email rpc:app.bsky.actor.getProfile?aud=did:web:api.bsky.app#bsky_appview repo:community.lexicon.calendar.event repo:community.lexicon.calendar.rsvp',
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${baseUrl}/api/v1/auth/bluesky/t/${tenantId}/jwks.json`,
    },
    keyset,
    stateStore: new ElastiCacheStateStore(elasticacheService),
    sessionStore: new ElastiCacheSessionStore(elasticacheService),
    requestLock,
  };

  return new NodeOAuthClient(clientConfig);
}

/**
 * Creates a custom fetch wrapper that intercepts requests to public plc.directory
 * and tries a private PLC server first. This is needed in environments (like dev)
 * where the private PLC doesn't federate with public plc.directory.
 *
 * When the private PLC returns a non-ok response (e.g. 404 for BYOD DIDs),
 * the request falls through to the public plc.directory.
 *
 * @param didPlcUrl - The private PLC URL (e.g. "http://plc:2582"). If falsy, returns undefined.
 * @param fetchFn - The underlying fetch function to use (defaults to globalThis.fetch).
 * @returns A custom fetch function, or undefined if no didPlcUrl is provided.
 */
export function createPlcFallbackFetch(
  didPlcUrl: string | undefined,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch | undefined {
  if (!didPlcUrl) {
    return undefined;
  }

  const privatePlcOrigin = new URL(didPlcUrl).origin;

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);

    // Intercept requests to public plc.directory for DID lookups
    // and try the private PLC first
    if (
      url.hostname === 'plc.directory' &&
      url.pathname.startsWith('/did:plc:')
    ) {
      const privateUrl = new URL(url.pathname + url.search, privatePlcOrigin);
      const privateResponse = await fetchFn(privateUrl.toString(), init);
      if (privateResponse.ok) {
        return privateResponse;
      }
      // Fall through to public PLC if private returns non-ok (e.g. 404 for BYOD DIDs)
    }

    return fetchFn(input, init);
  };
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
