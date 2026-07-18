import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@atproto/api';
import { BlobRef } from '@atproto/lexicon';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { FileConfig } from '../file/config/file-config.type';
import fileConfig from '../file/config/file.config';
import { createFileS3Client } from '../file/s3-client.factory';

export interface UploadedEventImage {
  /** The blob reference to embed in the record (pins the blob against GC). */
  blob: BlobRef;
  /** The blob CID string, used to build the getBlob URL. */
  cid: string;
  mimeType: string;
  size: number;
}

/**
 * Uploads event images to the event owner's PDS as content-addressed blobs and
 * builds the stable, federated `com.atproto.sync.getBlob` URL that goes into the
 * durable event record.
 *
 * Why blobs instead of an S3/CDN URL: the record lives immutably in the user's
 * PDS repo, so its image must live in the same portable substrate. The bytes are
 * uploaded to the owner's PDS (user-owned, travels with the repo) and referenced
 * by CID. getBlob is a public, unauthenticated, immutable endpoint, so the URL is
 * safe to cache at a CDN and needs no signing.
 */
@Injectable()
export class EventImageBlobService {
  private readonly logger = new Logger(EventImageBlobService.name);

  // Keep blobs comfortably under the PDS default blob-upload limit (5 MB) and
  // avoid bloating user repos. Images above this are resized/re-encoded first.
  private static readonly MAX_BLOB_BYTES = 4 * 1024 * 1024;
  private static readonly MAX_EDGE = 2000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Fetch the image bytes from object storage, shrink if needed, and upload as a
   * blob to the repo the agent is authenticated for. Returns null on any failure
   * so the caller can publish the record without an image rather than failing the
   * whole publish.
   */
  async uploadEventImage(
    agent: Agent,
    imageKey: string,
  ): Promise<UploadedEventImage | null> {
    try {
      const fetched = await this.fetchObject(imageKey);
      if (!fetched) return null;

      const { bytes, mimeType } = await this.normalizeForBlob(
        fetched.bytes,
        fetched.mimeType,
      );

      const res = await agent.uploadBlob(bytes, { encoding: mimeType });
      const blob = res.data.blob;
      return {
        blob,
        cid: blob.ref.toString(),
        mimeType,
        size: bytes.length,
      };
    } catch (err) {
      this.logger.error(
        `Failed to upload event image blob for key "${imageKey}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Build the getBlob URL to bake into the record. Uses the configured public
   * base URL (a CDN fronting OpenMeet's PDS) only when the owner is on OpenMeet's
   * own PDS; otherwise the owner's real PDS host is used so the blob resolves.
   */
  buildGetBlobUrl(userPdsUrl: string, did: string, cid: string): string {
    const host = this.resolveBlobHost(userPdsUrl).replace(/\/+$/, '');
    return `${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
      did,
    )}&cid=${encodeURIComponent(cid)}`;
  }

  /**
   * The CDN base URL is only valid for blobs served by OpenMeet's own PDS (it
   * origins there). For users on any other PDS, bake their real PDS host.
   */
  private resolveBlobHost(userPdsUrl: string): string {
    const config = fileConfig() as FileConfig;
    const cdnBase = config.blobPublicBaseUrl;
    const openmeetPds = this.configService.get<string>('pds.url', {
      infer: true,
    });

    if (cdnBase && openmeetPds && this.sameHost(userPdsUrl, openmeetPds)) {
      return cdnBase;
    }
    return userPdsUrl;
  }

  private sameHost(a: string, b: string): boolean {
    try {
      return new URL(a).host === new URL(b).host;
    } catch {
      return false;
    }
  }

  private async fetchObject(
    key: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const config = fileConfig() as FileConfig;
    const s3 = createFileS3Client({
      region: config.awsS3Region ?? '',
      accessKeyId: config.accessKeyId ?? '',
      secretAccessKey: config.secretAccessKey ?? '',
      endpoint: config.awsS3Endpoint,
      forcePathStyle: config.awsS3ForcePathStyle,
    });

    const res = await s3.send(
      new GetObjectCommand({
        Bucket: config.awsDefaultS3Bucket ?? '',
        Key: key,
      }),
    );

    if (!res.Body) {
      this.logger.warn(`Object "${key}" returned no body`);
      return null;
    }

    // AWS SDK v3 stream helper -> Uint8Array
    const bytes = Buffer.from(
      await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
    );
    const mimeType =
      res.ContentType || this.mimeFromKey(key) || 'application/octet-stream';
    return { bytes, mimeType };
  }

  /**
   * Ensure the blob fits comfortably under the PDS limit. Images already small
   * enough are uploaded byte-for-byte (best fidelity); larger ones are resized
   * and re-encoded.
   */
  private async normalizeForBlob(
    bytes: Buffer,
    mimeType: string,
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    if (bytes.length <= EventImageBlobService.MAX_BLOB_BYTES) {
      return { bytes, mimeType };
    }

    const base = sharp(bytes, { failOn: 'none' }).rotate();
    const meta = await base.metadata();
    const resized = base.resize({
      width: EventImageBlobService.MAX_EDGE,
      height: EventImageBlobService.MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Preserve transparency where present; otherwise JPEG for best compression.
    let out: Buffer;
    let outMime: string;
    if (meta.hasAlpha) {
      out = await resized.clone().png({ compressionLevel: 9 }).toBuffer();
      outMime = 'image/png';
    } else {
      out = await resized.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      outMime = 'image/jpeg';
    }

    // Last-resort pass: guarantee we get under the limit even if it means
    // dropping alpha, since an oversized blob would be rejected by the PDS.
    if (out.length > EventImageBlobService.MAX_BLOB_BYTES) {
      out = await sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      outMime = 'image/jpeg';
    }

    this.logger.debug(
      `Resized event image ${bytes.length}B (${mimeType}) -> ${out.length}B (${outMime})`,
    );
    return { bytes: out, mimeType: outMime };
  }

  private mimeFromKey(key: string): string | null {
    const ext = key.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return null;
    }
  }
}
