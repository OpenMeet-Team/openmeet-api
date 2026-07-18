import { promises as fsPromises } from 'fs';
import { basename, join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { Agent } from '@atproto/api';
import { BlobRef } from '@atproto/lexicon';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { FileConfig, FileDriver } from '../file/config/file-config.type';
import fileConfig from '../file/config/file.config';
import { createFileS3Client } from '../file/s3-client.factory';

export interface UploadedEventImage {
  /** The blob reference to embed in the record (pins the blob against GC). */
  blob: BlobRef;
  /** The blob CID string (a stable content identifier for the uploaded blob). */
  cid: string;
  mimeType: string;
  size: number;
  /** Final pixel width of the uploaded image, when it could be determined. */
  width?: number;
  /** Final pixel height of the uploaded image, when it could be determined. */
  height?: number;
}

/**
 * Uploads event images to the event owner's PDS as content-addressed blobs so
 * they can be referenced from the durable event record via the ecosystem
 * `media[]` convention (`{ role, content: <blob>, aspect_ratio }`).
 *
 * Why blobs instead of an S3/CDN URL: the record lives immutably in the user's
 * PDS repo, so its image must live in the same portable substrate. The bytes are
 * uploaded to the owner's PDS (user-owned, travels with the repo) and referenced
 * by the blob ref pinned in the record. No URL is baked into the record at all --
 * consumers build a getBlob/CDN URL at render time from the blob ref and the
 * owner's DID, so the CDN becomes a display-side concern rather than record data.
 */
@Injectable()
export class EventImageBlobService {
  private readonly logger = new Logger(EventImageBlobService.name);

  // Upload byte-for-byte below this size (best fidelity, preserves small
  // GIFs/PNGs exactly); above it, re-encode to WebP under this ceiling. Matches
  // atmo's 900KB skip-if-small threshold.
  private static readonly MAX_BLOB_BYTES = 900 * 1024;
  private static readonly MAX_EDGE = 2048;
  private static readonly QUALITY_START = 80;
  private static readonly QUALITY_FLOOR = 45;

  // Descending fallback ladder for images the 2048px quality loop cannot fit
  // under the ceiling. WebP encodes the alpha channel losslessly, so a
  // high-entropy RGBA image can stay oversized at any quality; the later rungs
  // flatten the alpha away to break that. If even the last rung is oversized,
  // the caller publishes without an image.
  private static readonly FALLBACK_LADDER: ReadonlyArray<{
    edge: number;
    quality: number;
    flatten: boolean;
  }> = [
    { edge: 1280, quality: 70, flatten: false },
    { edge: 1024, quality: 60, flatten: false },
    { edge: 800, quality: 55, flatten: true },
    { edge: 640, quality: 50, flatten: true },
  ];

  // Guards for re-hosting legacy full-URL images (see uploadExternalImage).
  private static readonly EXTERNAL_MAX_BYTES = 10 * 1024 * 1024;
  private static readonly EXTERNAL_TIMEOUT_MS = 10_000;

  /**
   * Fetch the image bytes from object storage, normalize if needed, and upload
   * as a blob to the repo the agent is authenticated for. Returns null on any
   * failure so the caller can publish the record without an image rather than
   * failing the whole publish.
   */
  async uploadEventImage(
    agent: Agent,
    imageKey: string,
  ): Promise<UploadedEventImage | null> {
    try {
      const fetched = await this.fetchObject(imageKey);
      if (!fetched) return null;
      return await this.normalizeAndUpload(
        agent,
        fetched.bytes,
        fetched.mimeType,
      );
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
   * Re-host a legacy/corrupted full-URL image as a PDS blob. Fetches the URL
   * server-side (bounded by a timeout and size cap, image content-types only),
   * runs it through the same normalize+upload pipeline, and returns null on any
   * failure so the caller publishes without an image rather than baking the URL.
   */
  async uploadExternalImage(
    agent: Agent,
    url: string,
  ): Promise<UploadedEventImage | null> {
    try {
      const fetched = await this.fetchExternalImage(url);
      if (!fetched) return null;
      return await this.normalizeAndUpload(
        agent,
        fetched.bytes,
        fetched.mimeType,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to re-host external event image "${url}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async normalizeAndUpload(
    agent: Agent,
    bytes: Buffer,
    mimeType: string,
  ): Promise<UploadedEventImage | null> {
    const normalized = await this.normalizeForBlob(bytes, mimeType);
    if (!normalized) return null;
    const res = await agent.uploadBlob(normalized.bytes, {
      encoding: normalized.mimeType,
    });
    const blob = res.data.blob;
    return {
      blob,
      cid: blob.ref.toString(),
      mimeType: normalized.mimeType,
      size: normalized.bytes.length,
      width: normalized.width,
      height: normalized.height,
    };
  }

  private async fetchObject(
    key: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const config = fileConfig() as FileConfig;

    // Local file driver (dev/CI environments): the object lives on disk under
    // ./files/<name>, which is also where the local download route serves it
    // from. Reduce the stored path to its basename to address the file (this
    // doubles as path-traversal protection).
    if (config.driver === FileDriver.LOCAL) {
      const name = basename(key);
      const bytes = await fsPromises.readFile(join('./files', name));
      return {
        bytes: Buffer.from(bytes),
        mimeType: this.mimeFromKey(name) || 'application/octet-stream',
      };
    }

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
      await (
        res.Body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray(),
    );
    const mimeType =
      res.ContentType || this.mimeFromKey(key) || 'application/octet-stream';
    return { bytes, mimeType };
  }

  /**
   * Fetch an image from an arbitrary http(s) URL for re-hosting. Rejects
   * non-image responses and anything over the size cap, and aborts on timeout,
   * returning null so the caller publishes without an image.
   */
  private async fetchExternalImage(
    url: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      EventImageBlobService.EXTERNAL_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(
          `External image fetch for "${url}" returned HTTP ${res.status}`,
        );
        return null;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        this.logger.warn(
          `External image fetch for "${url}" has non-image content-type "${contentType}"`,
        );
        return null;
      }

      const declaredLength = Number(res.headers.get('content-length') ?? '0');
      if (declaredLength > EventImageBlobService.EXTERNAL_MAX_BYTES) {
        this.logger.warn(
          `External image "${url}" declares ${declaredLength}B, over the ${EventImageBlobService.EXTERNAL_MAX_BYTES}B cap`,
        );
        return null;
      }

      if (!res.body) {
        this.logger.warn(`External image fetch for "${url}" returned no body`);
        return null;
      }

      // Read the body incrementally so a server that omits or lies about
      // Content-Length cannot force an arbitrarily large allocation: stop and
      // abort the transfer the moment the running total exceeds the cap.
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > EventImageBlobService.EXTERNAL_MAX_BYTES) {
          controller.abort();
          this.logger.warn(
            `External image "${url}" exceeded the ${EventImageBlobService.EXTERNAL_MAX_BYTES}B cap mid-download; aborting`,
          );
          return null;
        }
        chunks.push(Buffer.from(chunk));
      }

      return {
        bytes: Buffer.concat(chunks),
        mimeType: contentType.split(';')[0].trim(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ensure the blob fits under the size ceiling and capture the final image
   * dimensions for the media entry's aspect_ratio.
   *
   * Small images (<= MAX_BLOB_BYTES) are uploaded byte-for-byte (best fidelity;
   * preserves small GIFs/PNGs exactly). Larger ones are auto-oriented, resized
   * so the longest edge is <= 2048, and re-encoded to WebP (which handles alpha,
   * so a single codec covers both opaque and transparent images), stepping the
   * quality down until under the ceiling, then walking a bounded fallback
   * ladder of smaller sizes. Returns null if nothing fits -- the caller then
   * publishes without an image rather than uploading an over-ceiling blob.
   */
  private async normalizeForBlob(
    bytes: Buffer,
    mimeType: string,
  ): Promise<{
    bytes: Buffer;
    mimeType: string;
    width?: number;
    height?: number;
  } | null> {
    if (bytes.length <= EventImageBlobService.MAX_BLOB_BYTES) {
      // Uploaded as-is; probe dimensions for aspect_ratio. If the probe fails
      // (odd/unsupported format), omit dimensions rather than fail the upload.
      let width: number | undefined;
      let height: number | undefined;
      try {
        const meta = await sharp(bytes, { failOn: 'none' }).metadata();
        width = meta.width;
        height = meta.height;
      } catch {
        // leave width/height undefined
      }
      return { bytes, mimeType, width, height };
    }

    const pipeline = sharp(bytes, { failOn: 'none' }).rotate().resize({
      width: EventImageBlobService.MAX_EDGE,
      height: EventImageBlobService.MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

    let quality = EventImageBlobService.QUALITY_START;
    let out: Buffer;
    let info: sharp.OutputInfo;
    for (;;) {
      const result = await pipeline
        .clone()
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      out = result.data;
      info = result.info;
      if (
        out.length <= EventImageBlobService.MAX_BLOB_BYTES ||
        quality <= EventImageBlobService.QUALITY_FLOOR
      ) {
        break;
      }
      quality = Math.max(EventImageBlobService.QUALITY_FLOOR, quality - 10);
    }

    // Fallback ladder: shrink harder until it fits. Bounded -- if the last
    // rung is still oversized, give up rather than upload an over-ceiling blob.
    if (out.length > EventImageBlobService.MAX_BLOB_BYTES) {
      for (const rung of EventImageBlobService.FALLBACK_LADDER) {
        let step = sharp(bytes, { failOn: 'none' }).rotate().resize({
          width: rung.edge,
          height: rung.edge,
          fit: 'inside',
          withoutEnlargement: true,
        });
        if (rung.flatten) {
          // Drop the alpha channel: WebP stores alpha losslessly, so
          // high-entropy transparency alone can keep the encode oversized.
          step = step.flatten();
        }
        const result = await step
          .webp({ quality: rung.quality })
          .toBuffer({ resolveWithObject: true });
        out = result.data;
        info = result.info;
        if (out.length <= EventImageBlobService.MAX_BLOB_BYTES) break;
      }
    }

    if (out.length > EventImageBlobService.MAX_BLOB_BYTES) {
      this.logger.warn(
        `Could not normalize event image under ${EventImageBlobService.MAX_BLOB_BYTES}B (best attempt ${out.length}B from ${bytes.length}B ${mimeType}); skipping image`,
      );
      return null;
    }

    this.logger.debug(
      `Normalized event image ${bytes.length}B (${mimeType}) -> ${out.length}B (image/webp, ${info.width}x${info.height})`,
    );
    return {
      bytes: out,
      mimeType: 'image/webp',
      width: info.width,
      height: info.height,
    };
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
