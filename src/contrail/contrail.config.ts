import type { ContrailConfig, CredentialKeyMaterial } from '@atmo-dev/contrail';

// @atcute/identity-resolver ships as ESM-only. Mirrors the trick in
// contrail-loader.ts so the dynamic import survives `module: commonjs`.
const esmImport = new Function('specifier', 'return import(specifier)') as <
  T = unknown,
>(
  specifier: string,
) => Promise<T>;

function parseAuthoritySigningKey(
  raw?: string,
): CredentialKeyMaterial | undefined {
  if (!raw) return undefined;
  const json = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(json) as CredentialKeyMaterial;
}

export async function buildContrailConfig(): Promise<ContrailConfig> {
  const plcUrl = process.env.CONTRAIL_PLC_URL;

  // Typed `unknown` because the ESM-only @atcute resolver type isn't cleanly
  // importable under this project's moduleResolution; it's attached to the
  // config below via spread (which skips excess-property checks) and consumed
  // structurally at runtime by contrail-base's buildVerifier.
  let resolver: unknown;
  if (plcUrl) {
    const ir = await esmImport<typeof import('@atcute/identity-resolver')>(
      '@atcute/identity-resolver',
    );
    resolver = new ir.CompositeDidDocumentResolver({
      methods: {
        plc: new ir.PlcDidDocumentResolver({ apiUrl: plcUrl }),
        web: new ir.WebDidDocumentResolver(),
      },
    });
  }

  const slingshotUrl = process.env.CONTRAIL_SLINGSHOT_URL || undefined;
  const additionalAllowedHosts =
    process.env.CONTRAIL_ALLOWED_HOSTS?.split(',') || undefined;

  const networkOverrides =
    resolver || slingshotUrl || additionalAllowedHosts
      ? { resolver, slingshotUrl, additionalAllowedHosts }
      : undefined;

  // spaces.authority — present only when the signing key is configured.
  const authoritySigningKey = parseAuthoritySigningKey(
    process.env.CONTRAIL_AUTHORITY_SIGNING_KEY,
  );
  const spaces = authoritySigningKey
    ? {
        authority: {
          type: process.env.CONTRAIL_SPACE_TYPE ?? 'tools.atmo.event.space',
          serviceDid: process.env.SERVICE_DID ?? 'did:web:api.openmeet.net',
          signing: authoritySigningKey,
          // Without this the spaces-authority verifier (buildVerifier in
          // contrail-base) defaults to a public plc.directory resolver and
          // can't resolve caller DIDs minted on a non-public PLC — the auth
          // middleware then 401s with "failed to retrieve did document".
          // Only set when CONTRAIL_PLC_URL is configured; otherwise the vendor
          // default (public PLC) is correct.
          ...(resolver ? { resolver } : {}),
        },
      }
    : undefined;

  // community — present only when BOTH the encryption key AND spaces.authority
  // are configured. The community routes are service-auth gated against
  // credentials the authority signs/verifies, so an encryption key alone is a
  // half-configured mount that the vendor integration can't serve. Drop it
  // (and warn) rather than hand a partial config to createCommunityIntegration
  // at startup. `masterKey` is the @atmo-dev/contrail-community config field
  // (vendor API); we feed it our CONTRAIL_COMMUNITY_ENCRYPTION_KEY env var —
  // the AES-GCM key that envelope-encrypts stored rotation keys + app passwords.
  const encryptionKey = process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY;
  if (encryptionKey && !spaces) {
    console.warn(
      'CONTRAIL_COMMUNITY_ENCRYPTION_KEY is set but CONTRAIL_AUTHORITY_SIGNING_KEY ' +
        'is not; community routes need spaces.authority to function. Dropping the ' +
        'community config — set both keys to mount /xrpc/net.openmeet.community.*.',
    );
  }
  const community =
    encryptionKey && spaces
      ? {
          masterKey: encryptionKey,
          plcDirectory: plcUrl,
          // Same rationale as spaces.authority.resolver above: the community
          // adopt/identity-resolution paths use cfg.resolver; without it they
          // fall back to public PLC and can't see non-public-PLC DIDs.
          ...(resolver ? { resolver } : {}),
          // Default-deny: the one-shot Step-3 provision window opens by setting
          // CONTRAIL_ALLOW_PROVISIONING=true (no code edit), then unsetting it.
          // Strict `=== 'true'` so only a deliberate value lifts the route's
          // default-deny posture (router returns 403 ProvisioningDisabled).
          allowProvisioning: process.env.CONTRAIL_ALLOW_PROVISIONING === 'true',
          allowedPdsEndpoints:
            process.env.CONTRAIL_ALLOWED_PDS_ENDPOINTS?.split(',') || undefined,
        }
      : undefined;

  return {
    namespace: 'net.openmeet',
    collections: {
      event: {
        collection: 'community.lexicon.calendar.event',
        queryable: {
          mode: {},
          name: {},
          status: {},
          startsAt: { type: 'range' },
          endsAt: { type: 'range' },
          createdAt: { type: 'range' },
        },
        searchable: ['name', 'description'],
        relations: {
          rsvps: {
            collection: 'rsvp',
            groupBy: 'status',
            count: true,
            groups: {
              interested: 'community.lexicon.calendar.rsvp#interested',
              going: 'community.lexicon.calendar.rsvp#going',
              notgoing: 'community.lexicon.calendar.rsvp#notgoing',
            },
          },
        },
      },
      rsvp: {
        collection: 'community.lexicon.calendar.rsvp',
        queryable: {
          status: {},
          'subject.uri': {},
        },
        references: {
          event: {
            collection: 'event',
            field: 'subject.uri',
          },
        },
      },
    },
    jetstreams: process.env.CONTRAIL_JETSTREAM_URLS?.split(',') || undefined,
    relays: process.env.CONTRAIL_RELAYS?.split(',') || undefined,
    networkOverrides,
    ...(spaces ? { spaces } : {}),
    ...(community ? { community } : {}),
  };
}
