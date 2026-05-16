import type { ContrailConfig } from '@atmo-dev/contrail';

// @atcute/identity-resolver ships as ESM-only. Mirrors the trick in
// contrail-loader.ts so the dynamic import survives `module: commonjs`.
const esmImport = new Function('specifier', 'return import(specifier)') as <
  T = unknown,
>(
  specifier: string,
) => Promise<T>;

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
  };
}
