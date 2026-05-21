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

  it('should add community with default-deny provisioning when BOTH keys are set', async () => {
    // Community needs the authority to sign/verify the service-auth credentials
    // its routes depend on, so it only assembles when spaces.authority is also
    // present (i.e. the authority signing key is configured too).
    process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY = FAKE_ENCRYPTION_KEY;
    process.env.CONTRAIL_AUTHORITY_SIGNING_KEY = FAKE_SIGNING;
    const config = await buildContrailConfig();
    const community = config.community as Record<string, unknown>;
    // `masterKey` is the vendor (contrail-community) config field name.
    expect(community.masterKey).toBe(FAKE_ENCRYPTION_KEY);
    expect(community.allowProvisioning).toBe(false);
  });

  it('should drop community (and warn) when the encryption key is set without the authority signing key', async () => {
    process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY = FAKE_ENCRYPTION_KEY;
    delete process.env.CONTRAIL_AUTHORITY_SIGNING_KEY;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const config = await buildContrailConfig();

    // Partial config is not a valid mount: without spaces.authority the
    // community routes can't function, so the block is dropped rather than
    // handed half-configured to the vendor integration at startup.
    expect(config.community).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('CONTRAIL_AUTHORITY_SIGNING_KEY'),
    );

    warn.mockRestore();
  });
});
