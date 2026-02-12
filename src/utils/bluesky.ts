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

  // Create a fetch wrapper that can handle:
  // 1. PLC fallback: tries private PLC before public plc.directory (for dev environments)
  // 2. Handle resolution: resolves local PDS handles via com.atproto.identity.resolveHandle
  const didPlcUrl = configService.get('DID_PLC_URL', {
    infer: true,
  }) as string | undefined;
  const pdsUrl = configService.get('PDS_URL', {
    infer: true,
  }) as string | undefined;
  const handleDomains = configService.get('PDS_SERVICE_HANDLE_DOMAINS', {
    infer: true,
  }) as string | undefined;
  const customFetch = createPlcFallbackFetch(
    didPlcUrl,
    globalThis.fetch,
    pdsUrl,
    handleDomains,
  );

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
 * Creates a custom fetch wrapper that can intercept two kinds of requests:
 *
 * 1. **PLC fallback**: Intercepts requests to public plc.directory and tries a
 *    private PLC server first. Needed in environments where the private PLC
 *    doesn't federate with public plc.directory.
 *
 * 2. **Handle resolution**: Intercepts `.well-known/atproto-did` requests for
 *    handles matching configured domain suffixes (e.g. `.pds.test`) and resolves
 *    them via the local PDS's `com.atproto.identity.resolveHandle` XRPC method.
 *    Needed when custodial PDS handles have no public DNS.
 *
 * @param didPlcUrl - The private PLC URL (e.g. "http://plc:2582"). Optional.
 * @param fetchFn - The underlying fetch function to use (defaults to globalThis.fetch).
 * @param pdsUrl - The local PDS URL for handle resolution (e.g. "http://localhost:3101"). Optional.
 * @param handleDomains - Comma-separated handle domain suffixes with leading dots (e.g. ".pds.test"). Optional.
 * @returns A custom fetch function, or undefined if no features are configured.
 */
export function createPlcFallbackFetch(
  didPlcUrl: string | undefined,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  pdsUrl?: string,
  handleDomains?: string,
): typeof globalThis.fetch | undefined {
  const hasPlcFallback = !!didPlcUrl;
  const hasHandleResolution = !!pdsUrl && !!handleDomains;

  if (!hasPlcFallback && !hasHandleResolution) {
    return undefined;
  }

  const privatePlcOrigin = hasPlcFallback
    ? new URL(didPlcUrl!).origin
    : undefined;

  // Parse handle domains into an array of suffixes
  const domainSuffixes = hasHandleResolution
    ? handleDomains!.split(',').map((d) => d.trim())
    : [];

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

    // Handle resolution: intercept .well-known/atproto-did requests for
    // handles matching configured domain suffixes.
    // Strategy: try normal DNS/.well-known fetch first (canonical path that
    // handles account migration), fall back to local PDS resolveHandle when
    // the normal path fails (e.g. .pds.test handles with no public DNS).
    if (
      hasHandleResolution &&
      url.pathname === '/.well-known/atproto-did' &&
      domainSuffixes.some((suffix) =>
        url.hostname.endsWith(suffix.replace(/^\./, '')),
      )
    ) {
      const handle = url.hostname;
      const resolveUrl = `${pdsUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`;

      // Step 1: Try normal fetch with a short timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 3000);
      let normalResponse: Response | undefined;
      try {
        normalResponse = await fetchFn(input, {
          ...init,
          signal: abortController.signal,
        });
        clearTimeout(timeoutId);
        if (normalResponse.ok) {
          return normalResponse;
        }
      } catch {
        clearTimeout(timeoutId);
        // Normal fetch failed (timeout, network error, etc.) — try PDS
      }

      // Step 2: Fall back to PDS resolveHandle
      try {
        const pdsResponse = await fetchFn(resolveUrl, init);
        if (pdsResponse.ok) {
          const data = await pdsResponse.json();
          return new Response(data.did, {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          });
        }
      } catch {
        // PDS also failed
      }

      // Step 3: Both failed — return the original failed response or a synthetic error
      if (normalResponse) {
        return normalResponse;
      }
      return new Response('Handle resolution failed', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      });
    }

    // PLC fallback: intercept requests to public plc.directory for DID lookups
    // and try the private PLC first
    if (
      privatePlcOrigin &&
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
