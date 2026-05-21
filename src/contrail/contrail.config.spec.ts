import { buildContrailConfig } from './contrail.config';

// A valid-shaped P-256 JWK pair is not required for config assembly — the
// config layer only base64-decodes + JSON.parses the signing blob. Use a
// minimal stand-in object.
const FAKE_SIGNING = Buffer.from(
  JSON.stringify({ privateKey: { kty: 'EC' }, publicKey: { kty: 'EC' } }),
).toString('base64');
const FAKE_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32)).toString('base64');

describe('buildContrailConfig community/spaces gating', () => {
  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('should omit spaces and community when neither secret is set', async () => {
    delete process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY;
    delete process.env.CONTRAIL_AUTHORITY_SIGNING_KEY;
    const config = await buildContrailConfig();
    expect(config.spaces).toBeUndefined();
    expect(config.community).toBeUndefined();
  });

  it('should add spaces.authority when the signing key is set', async () => {
    process.env.CONTRAIL_AUTHORITY_SIGNING_KEY = FAKE_SIGNING;
    process.env.SERVICE_DID = 'did:web:api.openmeet.net';
    delete process.env.CONTRAIL_SPACE_TYPE;
    const config = await buildContrailConfig();
    expect(config.spaces?.authority?.serviceDid).toBe(
      'did:web:api.openmeet.net',
    );
    expect(config.spaces?.authority?.type).toBe('tools.atmo.event.space');
    expect(config.spaces?.authority?.signing).toBeDefined();
  });

  it('should add community with default-deny provisioning when the encryption key is set', async () => {
    process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY = FAKE_ENCRYPTION_KEY;
    const config = await buildContrailConfig();
    const community = config.community as Record<string, unknown>;
    // `masterKey` is the vendor (contrail-community) config field name.
    expect(community.masterKey).toBe(FAKE_ENCRYPTION_KEY);
    expect(community.allowProvisioning).toBe(false);
  });
});
