import { buildFileS3ClientConfig } from './s3-client.factory';

describe('buildFileS3ClientConfig', () => {
  const base = {
    region: 'us-east-1',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'secret',
  };

  it('sets region and credentials', () => {
    const config = buildFileS3ClientConfig(base);

    expect(config.region).toBe('us-east-1');
    expect(config.credentials).toEqual({
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret',
    });
  });

  it('omits endpoint/forcePathStyle when no endpoint is given (AWS S3 default)', () => {
    const config = buildFileS3ClientConfig(base);

    expect(config.endpoint).toBeUndefined();
    expect(config.forcePathStyle).toBeUndefined();
  });

  it('applies a custom endpoint (e.g. DigitalOcean Spaces)', () => {
    const config = buildFileS3ClientConfig({
      ...base,
      region: 'nyc3',
      endpoint: 'https://nyc3.digitaloceanspaces.com',
    });

    expect(config.endpoint).toBe('https://nyc3.digitaloceanspaces.com');
    // defaults to virtual-hosted style when not explicitly forced
    expect(config.forcePathStyle).toBe(false);
  });

  it('honors forcePathStyle when an endpoint is set', () => {
    const config = buildFileS3ClientConfig({
      ...base,
      endpoint: 'https://nyc3.digitaloceanspaces.com',
      forcePathStyle: true,
    });

    expect(config.forcePathStyle).toBe(true);
  });

  it('ignores forcePathStyle when no endpoint is set', () => {
    const config = buildFileS3ClientConfig({ ...base, forcePathStyle: true });

    expect(config.endpoint).toBeUndefined();
    expect(config.forcePathStyle).toBeUndefined();
  });
});
