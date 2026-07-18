import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventImageBlobService } from './event-image-blob.service';
import { createFileS3Client } from '../file/s3-client.factory';
import fileConfig from '../file/config/file.config';

jest.mock('../file/s3-client.factory');
jest.mock('../file/config/file.config');

const mockedCreateS3 = createFileS3Client as jest.MockedFunction<
  typeof createFileS3Client
>;
const mockedFileConfig = fileConfig as jest.MockedFunction<typeof fileConfig>;

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
    blobPublicBaseUrl: 'https://media.openmeet.net',
    maxFileSize: 5242880,
  };

  const mockConfigService = {
    get: jest.fn((key: string) =>
      key === 'pds.url' ? 'https://pds.opnmt.me' : undefined,
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedFileConfig.mockReturnValue(baseFileConfig as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventImageBlobService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EventImageBlobService>(EventImageBlobService);
  });

  describe('buildGetBlobUrl', () => {
    it('uses the CDN base URL when the owner is on OpenMeet PDS', () => {
      const url = service.buildGetBlobUrl(
        'https://pds.opnmt.me',
        'did:plc:abc',
        'bafcid',
      );
      expect(url).toBe(
        'https://media.openmeet.net/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafcid',
      );
    });

    it('uses the owner PDS host for external PDS users (CDN only fronts OpenMeet PDS)', () => {
      const url = service.buildGetBlobUrl(
        'https://mushroom.us-west.host.bsky.network',
        'did:plc:ext',
        'bafext',
      );
      expect(url).toBe(
        'https://mushroom.us-west.host.bsky.network/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aext&cid=bafext',
      );
    });

    it('falls back to the owner PDS host when no CDN base is configured', () => {
      mockedFileConfig.mockReturnValue({
        ...baseFileConfig,
        blobPublicBaseUrl: undefined,
      } as any);
      const url = service.buildGetBlobUrl(
        'https://pds.opnmt.me',
        'did:plc:abc',
        'bafcid',
      );
      expect(url).toBe(
        'https://pds.opnmt.me/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafcid',
      );
    });
  });

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

    it('uploads a small image byte-for-byte and returns the blob + cid', async () => {
      mockS3Returning({
        bytes: new Uint8Array([1, 2, 3, 4]),
        contentType: 'image/jpeg',
      });
      const uploadBlob = jest.fn().mockResolvedValue({
        data: {
          blob: {
            ref: { toString: () => 'bafuploadedcid' },
            mimeType: 'image/jpeg',
            size: 4,
          },
        },
      });
      const agent = { uploadBlob } as any;

      const result = await service.uploadEventImage(agent, 'tenant/pic.jpg');

      expect(result).not.toBeNull();
      expect(result!.cid).toBe('bafuploadedcid');
      expect(result!.mimeType).toBe('image/jpeg');
      // small image => not resized, uploaded as-is
      expect(uploadBlob).toHaveBeenCalledTimes(1);
      const [bytesArg, opts] = uploadBlob.mock.calls[0];
      expect(Buffer.isBuffer(bytesArg)).toBe(true);
      expect(bytesArg).toHaveLength(4);
      expect(opts).toEqual({ encoding: 'image/jpeg' });
    });

    it('returns null (does not throw) when the object cannot be fetched', async () => {
      const send = jest.fn().mockRejectedValue(new Error('NoSuchKey'));
      mockedCreateS3.mockReturnValue({ send } as any);
      const agent = { uploadBlob: jest.fn() } as any;

      const result = await service.uploadEventImage(agent, 'tenant/missing.jpg');

      expect(result).toBeNull();
      expect(agent.uploadBlob).not.toHaveBeenCalled();
    });

    it('infers mime type from the key when the object has no ContentType', async () => {
      mockS3Returning({ bytes: new Uint8Array([1, 2, 3]) });
      const uploadBlob = jest.fn().mockResolvedValue({
        data: {
          blob: { ref: { toString: () => 'bafpng' }, mimeType: 'image/png', size: 3 },
        },
      });

      await service.uploadEventImage({ uploadBlob } as any, 'tenant/logo.png');

      expect(uploadBlob.mock.calls[0][1]).toEqual({ encoding: 'image/png' });
    });
  });
});
