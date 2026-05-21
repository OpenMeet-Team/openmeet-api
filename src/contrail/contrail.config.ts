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

  let resolver: unknown | undefined;
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
        },
      }
    : undefined;

  // community — present only when the encryption key is configured.
  // `masterKey` is the @atmo-dev/contrail-community config field (vendor API);
  // we feed it our CONTRAIL_COMMUNITY_ENCRYPTION_KEY env var. It's the AES-GCM
  // key that envelope-encrypts stored group rotation keys + PDS app passwords.
  const encryptionKey = process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY;
  const community = encryptionKey
    ? {
        masterKey: encryptionKey,
        plcDirectory: plcUrl,
        allowProvisioning: false, // default-deny until Step 3
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
