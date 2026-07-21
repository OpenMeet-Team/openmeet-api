import { randomBytes } from 'crypto';
import { promises as fsPromises } from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import sharp from 'sharp';
import { EventImageBlobService } from './event-image-blob.service';
import { createFileS3Client } from '../file/s3-client.factory';
import fileConfig from '../file/config/file.config';
import appConfig from '../config/app.config';

jest.mock('../file/s3-client.factory');
jest.mock('../file/config/file.config');
jest.mock('../config/app.config');

const mockedCreateS3 = createFileS3Client as jest.MockedFunction<
  typeof createFileS3Client
>;
const mockedFileConfig = fileConfig as jest.MockedFunction<typeof fileConfig>;
const mockedAppConfig = appConfig as jest.MockedFunction<typeof appConfig>;

const MAX_BLOB_BYTES = 900 * 1024;

/** A small, valid image well under the 900KB passthrough threshold. */
async function smallImage(
  width: number,
  height: number,
  format: 'png' | 'webp' | 'jpeg' = 'png',
): Promise<Buffer> {
  const img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  });
  return format === 'png'
    ? img.png().toBuffer()
    : format === 'webp'
      ? img.webp().toBuffer()
      : img.jpeg().toBuffer();
}

/**
 * A random-noise RGB image that does not compress below the 900KB threshold and
 * whose longest edge exceeds 2048, so normalizeForBlob takes the resize+WebP
 * path. Noise is (nearly) incompressible, so the encoded PNG stays large.
 */
async function oversizedImage(width: number, height: number): Promise<Buffer> {
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/**
 * A DETERMINISTIC high-entropy RGBA image (xorshift32 fill, fixed seed). WebP
 * encodes the alpha channel LOSSLESSLY, so noise transparency keeps the encode
 * oversized at any lossy quality until the fallback ladder flattens the alpha
 * away. Deterministic bytes mean the ladder's outcome is fixed run-to-run, so
 * the test can assert a single expected result instead of "success or null".
 */
async function deterministicAlphaNoise(
  width: number,
  height: number,
  seed = 0x9e3779b9,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  let state = seed >>> 0;
  for (let i = 0; i < raw.length; i++) {
    // xorshift32: cheap, high-entropy, fully deterministic.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    raw[i] = state & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

describe('EventImageBlobService', () => {
  let service: EventImageBlobService;

  const baseFileConfig = {
    driver: 's3-presigned',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    awsDefaultS3Bucket: 'openmeet-media',
    awsS3Region: 'us-east-1',
    awsS3Endpoint: 'https://nyc3.digitaloceanspaces.com',
    awsS3ForcePathStyle: false,
    maxFileSize: 5242880,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedFileConfig.mockReturnValue(baseFileConfig as any);
    mockedAppConfig.mockReturnValue({
      backendDomain: 'https://api.openmeet.net',
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventImageBlobService],
    }).compile();

    service = module.get<EventImageBlobService>(EventImageBlobService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockAgent(cid = 'bafuploadedcid') {
    const uploadBlob = jest.fn().mockResolvedValue({
      data: { blob: { ref: { toString: () => cid } } },
    });
    return { agent: { uploadBlob } as any, uploadBlob };
  }

  describe('uploadEventImage', () => {
    function mockS3Returning(body: {
      bytes: Uint8Array;
      contentType?: string;
    }) {
      const send = jest.fn().mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(body.bytes),
        },
        ContentType: body.contentType,
      });
      mockedCreateS3.mockReturnValue({ send } as any);
      return send;
    }

    it('should upload a small image byte-for-byte and capture its dimensions', async () => {
      const png = await smallImage(10, 20, 'png');
      mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafsmall');

      const result = await service.uploadEventImage(agent, 'tenant/pic.png');

      expect(result).not.toBeNull();
      expect(result!.cid).toBe('bafsmall');
      // small image => uploaded unchanged, mime preserved
      expect(result!.mimeType).toBe('image/png');
      expect(result!.width).toBe(10);
      expect(result!.height).toBe(20);
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      const [bytesArg, opts] = uploadBlob.mock.calls[0];
      expect(Buffer.isBuffer(bytesArg)).toBe(true);
      expect(Buffer.compare(bytesArg, png)).toBe(0); // byte-for-byte
      expect(opts).toEqual({ encoding: 'image/png' });
    });

    it('should omit dimensions when the passthrough image cannot be probed', async () => {
      // Not a decodable image, but under the threshold => uploaded as-is.
      mockS3Returning({
        bytes: new Uint8Array([1, 2, 3, 4]),
        contentType: 'image/gif',
      });
      const { agent, uploadBlob } = mockAgent('bafodd');

      const result = await service.uploadEventImage(agent, 'tenant/odd.gif');

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/gif');
      expect(result!.width).toBeUndefined();
      expect(result!.height).toBeUndefined();
      expect(uploadBlob).toHaveBeenCalledTimes(1);
    });

    it('should resize and re-encode oversized images to WebP, capturing final dimensions', async () => {
      const big = await oversizedImage(2100, 500);
      expect(big.length).toBeGreaterThan(MAX_BLOB_BYTES);
      mockS3Returning({ bytes: big, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafwebp');

      const result = await service.uploadEventImage(agent, 'tenant/big.png');

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/webp');
      // longest edge clamped to 2048 (2100 -> 2048), height scaled down
      expect(result!.width).toBe(2048);
      expect(result!.height).toBeLessThanOrEqual(2048);
      expect(result!.height).toBeLessThan(500);
      expect(result!.size).toBeLessThanOrEqual(MAX_BLOB_BYTES);
      const [, opts] = uploadBlob.mock.calls[0];
      expect(opts).toEqual({ encoding: 'image/webp' });
    }, 30000);

    it('should flatten alpha via the fallback ladder to fit high-entropy RGBA under the ceiling', async () => {
      // WebP stores alpha losslessly, so noise transparency defeats the lossy
      // quality loop; the bounded fallback ladder must flatten the alpha away
      // and land under the ceiling. The input is deterministic, so the ladder
      // resolves to one fixed outcome: a WebP blob under the ceiling (never a
      // skip, never oversized bytes).
      const rgba = await deterministicAlphaNoise(1500, 1500);
      expect(rgba.length).toBeGreaterThan(MAX_BLOB_BYTES);
      mockS3Returning({ bytes: rgba, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafalpha');

      const result = await service.uploadEventImage(agent, 'tenant/alpha.png');

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/webp');
      expect(result!.size).toBeLessThanOrEqual(MAX_BLOB_BYTES);
      const [bytesArg] = uploadBlob.mock.calls[0];
      expect(bytesArg.length).toBeLessThanOrEqual(MAX_BLOB_BYTES);
    }, 60000);

    it('should return null (not throw) when the object cannot be fetched', async () => {
      const send = jest.fn().mockRejectedValue(new Error('NoSuchKey'));
      mockedCreateS3.mockReturnValue({ send } as any);
      const agent = { uploadBlob: jest.fn() } as any;

      const result = await service.uploadEventImage(
        agent,
        'tenant/missing.jpg',
      );

      expect(result).toBeNull();
      expect(agent.uploadBlob).not.toHaveBeenCalled();
    });

    it('should infer mime type from the key when the object has no ContentType', async () => {
      const png = await smallImage(5, 5, 'png');
      mockS3Returning({ bytes: png });
      const { agent, uploadBlob } = mockAgent('bafpng');

      await service.uploadEventImage(agent, 'tenant/logo.png');

      expect(uploadBlob.mock.calls[0][1]).toEqual({ encoding: 'image/png' });
    });

    it('should read the object from local disk when the local file driver is active', async () => {
      mockedFileConfig.mockReturnValue({
        ...baseFileConfig,
        driver: 'local',
      } as any);
      const png = await smallImage(12, 8, 'png');
      const readFileSpy = jest
        .spyOn(fsPromises, 'readFile')
        .mockResolvedValue(png as any);
      const { agent, uploadBlob } = mockAgent('baflocal');

      const result = await service.uploadEventImage(
        agent,
        '/api/v1/files/abc123.png',
      );

      expect(result).not.toBeNull();
      expect(result!.width).toBe(12);
      expect(result!.height).toBe(8);
      // Reads ./files/<basename> -- where the local driver stores uploads.
      expect(readFileSpy).toHaveBeenCalledWith('files/abc123.png');
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      expect(uploadBlob.mock.calls[0][1]).toEqual({ encoding: 'image/png' });
      // No S3 client involved on this path.
      expect(mockedCreateS3).not.toHaveBeenCalled();
    });
  });

  describe('legacy full-URL image references (origin recognition, no SSRF)', () => {
    // An OpenMeet-origin URL is mapped back to an object key and read from our
    // own bucket via the S3 path; the backend never fetch()es the URL. An
    // unrecognized/arbitrary URL is refused outright -- no fetch, no S3 read --
    // so a stored URL cannot be used to reach loopback/private/metadata hosts.

    function mockS3Returning(body: {
      bytes: Uint8Array;
      contentType?: string;
    }) {
      const send = jest.fn().mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(body.bytes),
        },
        ContentType: body.contentType,
      });
      mockedCreateS3.mockReturnValue({ send } as any);
      return send;
    }

    let fetchSpy: jest.Mock;
    beforeEach(() => {
      // Fail loudly if the service ever fetches an external URL.
      fetchSpy = jest.fn();
      global.fetch = fetchSpy as any;
    });
    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should map a virtual-hosted Spaces URL back to a key and read it from our bucket, never fetching', async () => {
      const png = await smallImage(30, 40, 'png');
      const send = mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafspaces');

      const result = await service.uploadEventImage(
        agent,
        'https://openmeet-media.nyc3.digitaloceanspaces.com/events/pic.png',
      );

      expect(result).not.toBeNull();
      expect(result!.cid).toBe('bafspaces');
      expect(result!.sourceKey).toBe('events/pic.png');
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: 'openmeet-media',
        Key: 'events/pic.png',
      });
    });

    it('should strip the bucket segment from a path-style Spaces URL', async () => {
      const png = await smallImage(10, 10, 'png');
      const send = mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent } = mockAgent();

      const result = await service.uploadEventImage(
        agent,
        'https://nyc3.digitaloceanspaces.com/openmeet-media/events/pic.png',
      );

      expect(result).not.toBeNull();
      expect(result!.sourceKey).toBe('events/pic.png');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(send.mock.calls[0][0].input.Key).toBe('events/pic.png');
    });

    it('should ignore presigned query params when deriving the key', async () => {
      const png = await smallImage(10, 10, 'png');
      const send = mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent } = mockAgent();

      const result = await service.uploadEventImage(
        agent,
        'https://openmeet-media.nyc3.digitaloceanspaces.com/events/pic.png?X-Amz-Signature=abc&X-Amz-Expires=3600',
      );

      expect(result!.sourceKey).toBe('events/pic.png');
      expect(send.mock.calls[0][0].input.Key).toBe('events/pic.png');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should map a configured CloudFront-origin URL back to a key', async () => {
      mockedFileConfig.mockReturnValue({
        ...baseFileConfig,
        cloudfrontDistributionDomain: 'cdn.openmeet.net',
      } as any);
      const png = await smallImage(10, 10, 'png');
      const send = mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent } = mockAgent();

      const result = await service.uploadEventImage(
        agent,
        'https://cdn.openmeet.net/events/pic.png',
      );

      expect(result!.sourceKey).toBe('events/pic.png');
      expect(send.mock.calls[0][0].input.Key).toBe('events/pic.png');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should map a configured legacy origin (retired CloudFront) back to a key', async () => {
      mockedFileConfig.mockReturnValue({
        ...baseFileConfig,
        mediaAllowedLegacyOrigins: ['d111legacy222.cloudfront.net'],
      } as any);
      const png = await smallImage(10, 10, 'png');
      const send = mockS3Returning({ bytes: png, contentType: 'image/png' });
      const { agent } = mockAgent();

      const result = await service.uploadEventImage(
        agent,
        'https://d111legacy222.cloudfront.net/events/legacy.png',
      );

      expect(result!.sourceKey).toBe('events/legacy.png');
      expect(send.mock.calls[0][0].input.Key).toBe('events/legacy.png');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should refuse an unrecognized external URL without fetching or reading S3 (SSRF guard)', async () => {
      const send = mockS3Returning({ bytes: await smallImage(10, 10) });
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadEventImage(
        agent,
        'https://legacy.example.com/pic.png',
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(uploadBlob).not.toHaveBeenCalled();
    });

    it.each([
      'http://127.0.0.1/x.png',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://localhost:9000/openmeet-media/events/pic.png',
      'http://[::1]/x.png',
    ])('should refuse loopback/private/metadata target %s', async (url) => {
      const send = mockS3Returning({ bytes: await smallImage(10, 10) });
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadEventImage(agent, url);

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(uploadBlob).not.toHaveBeenCalled();
    });
  });
});
