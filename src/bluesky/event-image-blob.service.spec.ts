import { randomBytes } from 'crypto';
import { promises as fsPromises } from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import sharp from 'sharp';
import { EventImageBlobService } from './event-image-blob.service';
import { createFileS3Client } from '../file/s3-client.factory';
import fileConfig from '../file/config/file.config';

jest.mock('../file/s3-client.factory');
jest.mock('../file/config/file.config');

const mockedCreateS3 = createFileS3Client as jest.MockedFunction<
  typeof createFileS3Client
>;
const mockedFileConfig = fileConfig as jest.MockedFunction<typeof fileConfig>;

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
 * A high-entropy RGBA image: WebP encodes the alpha channel LOSSLESSLY, so
 * noise transparency keeps the encode oversized at any lossy quality until the
 * fallback ladder flattens the alpha away. Reproduces the over-ceiling bug the
 * bounded ladder fixes.
 */
async function oversizedAlphaImage(
  width: number,
  height: number,
): Promise<Buffer> {
  const raw = randomBytes(width * height * 4);
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

    it('should never upload an over-ceiling blob for high-entropy RGBA input (ladder or skip)', async () => {
      // WebP stores alpha losslessly, so noise transparency can defeat the
      // lossy quality loop entirely; the bounded fallback ladder must either
      // produce something under the ceiling (flattening the alpha) or give up
      // with null -- never return oversized bytes.
      const rgba = await oversizedAlphaImage(1500, 1500);
      expect(rgba.length).toBeGreaterThan(MAX_BLOB_BYTES);
      mockS3Returning({ bytes: rgba, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafalpha');

      const result = await service.uploadEventImage(agent, 'tenant/alpha.png');

      if (result === null) {
        expect(uploadBlob).not.toHaveBeenCalled();
      } else {
        expect(result.size).toBeLessThanOrEqual(MAX_BLOB_BYTES);
        expect(result.mimeType).toBe('image/webp');
        const [bytesArg] = uploadBlob.mock.calls[0];
        expect(bytesArg.length).toBeLessThanOrEqual(MAX_BLOB_BYTES);
      }
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

  describe('uploadExternalImage', () => {
    function toStream(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
      return (async function* () {
        for (const chunk of chunks) {
          yield await Promise.resolve(chunk);
        }
      })();
    }

    function mockFetch(response: {
      ok?: boolean;
      status?: number;
      contentType?: string | null;
      contentLength?: string | null;
      body?: Buffer;
      stream?: AsyncIterable<Uint8Array>;
    }) {
      const headers = new Map<string, string | null>();
      headers.set('content-type', response.contentType ?? null);
      headers.set('content-length', response.contentLength ?? null);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        headers: { get: (h: string) => headers.get(h.toLowerCase()) ?? null },
        body:
          response.stream ??
          toStream(response.body ? [new Uint8Array(response.body)] : []),
      });
      global.fetch = fetchMock as any;
      return fetchMock;
    }

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should re-host a fetched external image as a PDS blob', async () => {
      const png = await smallImage(30, 40, 'png');
      const fetchMock = mockFetch({
        contentType: 'image/png',
        contentLength: String(png.length),
        body: png,
      });
      const { agent, uploadBlob } = mockAgent('bafext');

      const result = await service.uploadExternalImage(
        agent,
        'https://legacy.example.com/pic.png',
      );

      expect(result).not.toBeNull();
      expect(result!.cid).toBe('bafext');
      expect(result!.width).toBe(30);
      expect(result!.height).toBe(40);
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://legacy.example.com/pic.png',
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('should return null when the response is not an image', async () => {
      mockFetch({
        contentType: 'text/html',
        body: Buffer.from('<html></html>'),
      });
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadExternalImage(
        agent,
        'https://legacy.example.com/notimage',
      );

      expect(result).toBeNull();
      expect(uploadBlob).not.toHaveBeenCalled();
    });

    it('should return null when the declared size exceeds the cap', async () => {
      const png = await smallImage(10, 10, 'png');
      mockFetch({
        contentType: 'image/png',
        contentLength: String(20 * 1024 * 1024),
        body: png,
      });
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadExternalImage(
        agent,
        'https://legacy.example.com/huge.png',
      );

      expect(result).toBeNull();
      expect(uploadBlob).not.toHaveBeenCalled();
    });

    it('should abort mid-stream when a lying Content-Length hides an over-cap body', async () => {
      // The server declares a small size, then streams far more than the 10MB
      // cap. The download must stop as soon as the running total crosses the
      // cap instead of buffering everything first.
      const chunk = new Uint8Array(1024 * 1024); // 1MB per chunk
      let yielded = 0;
      const lyingStream: AsyncIterable<Uint8Array> = (async function* () {
        for (let i = 0; i < 50; i++) {
          yielded++;
          yield await Promise.resolve(chunk);
        }
      })();
      mockFetch({
        contentType: 'image/png',
        contentLength: '1000', // lie
        stream: lyingStream,
      });
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadExternalImage(
        agent,
        'https://legacy.example.com/liar.png',
      );

      expect(result).toBeNull();
      expect(uploadBlob).not.toHaveBeenCalled();
      // Bailed right after crossing the 10MB cap (11 chunks), long before
      // draining all 50MB.
      expect(yielded).toBeLessThanOrEqual(11);
    });

    it('should return null (not throw) when the fetch fails', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down')) as any;
      const { agent, uploadBlob } = mockAgent();

      const result = await service.uploadExternalImage(
        agent,
        'https://legacy.example.com/pic.png',
      );

      expect(result).toBeNull();
      expect(uploadBlob).not.toHaveBeenCalled();
    });
  });
});
