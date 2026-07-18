import { randomBytes } from 'crypto';
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
 * A random-noise image that does not compress below the 900KB threshold and
 * whose longest edge exceeds 2048, so normalizeForBlob takes the resize+WebP
 * path. Noise is (nearly) incompressible, so the encoded PNG stays large.
 */
async function oversizedImage(width: number, height: number): Promise<Buffer> {
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } })
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
      expect(big.length).toBeGreaterThan(900 * 1024);
      mockS3Returning({ bytes: big, contentType: 'image/png' });
      const { agent, uploadBlob } = mockAgent('bafwebp');

      const result = await service.uploadEventImage(agent, 'tenant/big.png');

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/webp');
      // longest edge clamped to 2048 (2100 -> 2048), height scaled down
      expect(result!.width).toBe(2048);
      expect(result!.height).toBeLessThanOrEqual(2048);
      expect(result!.height).toBeLessThan(500);
      const [, opts] = uploadBlob.mock.calls[0];
      expect(opts).toEqual({ encoding: 'image/webp' });
    }, 20000);

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
  });

  describe('uploadExternalImage', () => {
    function mockFetch(response: {
      ok?: boolean;
      status?: number;
      contentType?: string | null;
      contentLength?: string | null;
      body?: Buffer;
    }) {
      const headers = new Map<string, string | null>();
      headers.set('content-type', response.contentType ?? null);
      headers.set('content-length', response.contentLength ?? null);
      const fetchMock = jest.fn().mockResolvedValue({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        headers: { get: (h: string) => headers.get(h.toLowerCase()) ?? null },
        arrayBuffer: () =>
          Promise.resolve(
            response.body
              ? new Uint8Array(response.body).buffer
              : new ArrayBuffer(0),
          ),
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
