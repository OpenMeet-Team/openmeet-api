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
import { AppConfig } from '../config/app-config.type';
import appConfig from '../config/app.config';

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
  /** The object key the image was read from (for republish/dedup tracking). */
  sourceKey: string;
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

  /**
   * Fetch the image bytes from OpenMeet object storage, normalize if needed, and
   * upload as a blob to the repo the agent is authenticated for.
   *
   * `imageRef` is normally a raw object key. It may also be a legacy full URL
   * left in the DB by older code; such a URL is honored only when it points at a
   * recognized OpenMeet origin (CloudFront distribution, the S3/Spaces bucket,
   * or the backend domain), in which case it is mapped back to an object key and
   * read from our own bucket. An unrecognized/arbitrary URL is refused: the
   * backend never issues an outbound request to it, so a stored URL cannot be
   * used to reach loopback, private-network, or cloud-metadata endpoints (SSRF).
   *
   * Returns null on any failure or refusal so the caller can preserve or skip
   * the image rather than failing the whole publish.
   */
  async uploadEventImage(
    agent: Agent,
    imageRef: string,
  ): Promise<UploadedEventImage | null> {
    try {
      const key = this.resolveObjectKey(imageRef);
      if (!key) {
        this.logger.warn(
          `Event image ref is not a recognized OpenMeet object; skipping image ("${imageRef}")`,
        );
        return null;
      }
      const fetched = await this.fetchObject(key);
      if (!fetched) return null;
      const uploaded = await this.normalizeAndUpload(
        agent,
        fetched.bytes,
        fetched.mimeType,
      );
      return uploaded ? { ...uploaded, sourceKey: key } : null;
    } catch (err) {
      this.logger.error(
        `Failed to upload event image blob for ref "${imageRef}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Map an image reference to an object key in our own bucket, or null if it
   * cannot be resolved safely. A bare key is returned as-is. A full http(s) URL
   * is accepted only when its host is a recognized OpenMeet origin; its path
   * (with a leading bucket segment stripped for path-style URLs) becomes the
   * key. Any other URL returns null -- we never fetch it.
   */
  private resolveObjectKey(ref: string): string | null {
    if (!/^https?:\/\//i.test(ref)) {
      return ref; // already an object key
    }
    let url: URL;
    try {
      url = new URL(ref);
    } catch {
      return null;
    }
    if (!this.isOpenMeetOrigin(url.hostname)) {
      return null;
    }
    const config = fileConfig() as FileConfig;
    let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    // Path-style URLs (host is the endpoint, not <bucket>.<endpoint>) carry the
    // bucket as the first path segment; strip it to leave the object key.
    const bucket = config.awsDefaultS3Bucket;
    if (bucket && (path === bucket || path.startsWith(`${bucket}/`))) {
      path = path.slice(bucket.length).replace(/^\/+/, '');
    }
    return path.length > 0 ? path : null;
  }

  /**
   * Hostnames trusted as OpenMeet-controlled media origins, derived from config:
   * the CloudFront distribution, the S3/Spaces endpoint (path- and
   * virtual-hosted-style), and the backend domain. A legacy stored URL is only
   * mapped back to a key when its host matches one of these.
   */
  private isOpenMeetOrigin(hostname: string): boolean {
    const config = fileConfig() as FileConfig;
    const allowed = new Set<string>();
    const add = (h?: string | null) => {
      const parsed = this.hostOf(h);
      if (parsed) allowed.add(parsed);
    };

    add(config.cloudfrontDistributionDomain);

    // Retired-but-retained media origins (e.g. an old CloudFront distribution
    // still serving images baked into legacy records).
    config.mediaAllowedLegacyOrigins?.forEach((h) => add(h));

    const bucket = config.awsDefaultS3Bucket;
    const endpointHost = this.hostOf(config.awsS3Endpoint);
    if (endpointHost) {
      allowed.add(endpointHost); // path-style: <endpoint>/<bucket>/<key>
      if (bucket) allowed.add(`${bucket}.${endpointHost}`); // virtual-hosted
    } else if (bucket && config.awsS3Region) {
      // Default AWS endpoints when none is configured.
      allowed.add(`s3.${config.awsS3Region}.amazonaws.com`);
      allowed.add(`${bucket}.s3.${config.awsS3Region}.amazonaws.com`);
    }

    add((appConfig() as AppConfig).backendDomain);

    return allowed.has(hostname.toLowerCase());
  }

  /** Normalize a bare host or a full URL down to a lowercase hostname. */
  private hostOf(value?: string | null): string | null {
    if (!value) return null;
    try {
      const withScheme = value.includes('://') ? value : `https://${value}`;
      return new URL(withScheme).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private async normalizeAndUpload(
    agent: Agent,
    bytes: Buffer,
    mimeType: string,
  ): Promise<Omit<UploadedEventImage, 'sourceKey'> | null> {
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
   * Ensure the blob fits under the size ceiling and capture the final image
   * dimensions for the media entry's aspect_ratio.
   *
   * Small images (<= MAX_BLOB_BYTES) are validated and uploaded byte-for-byte
   * (best fidelity; preserves small GIFs/PNGs exactly). Larger ones are
   * auto-oriented, resized so the longest edge is <= 2048, and re-encoded to
   * WebP (which handles alpha, so a single codec covers both opaque and
   * transparent images), stepping the quality down until under the ceiling,
   * then walking a bounded fallback ladder of smaller sizes. Returns null if
   * the object is not a decodable raster image, or nothing fits under the
   * ceiling -- the caller then publishes without an image.
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
      // Validate the object really is a decodable raster image before uploading
      // it byte-for-byte. The presigned upload flow trusts the client-supplied
      // filename/size/content-type, so the stored object could be arbitrary or
      // corrupted bytes; publishing those as an image blob would hand consumers
      // an "image" they cannot decode. Derive the MIME from the detected format
      // rather than trusting the (unvalidated) stored content-type.
      let meta: sharp.Metadata;
      try {
        meta = await sharp(bytes).metadata();
      } catch {
        this.logger.warn(
          `Object is not a decodable image (${bytes.length}B); skipping image`,
        );
        return null;
      }
      const detectedMime = this.mimeFromSharpFormat(meta.format);
      if (!detectedMime || !meta.width || !meta.height) {
        this.logger.warn(
          `Object is not a supported raster image (format=${
            meta.format ?? 'unknown'
          }, ${meta.width ?? '?'}x${meta.height ?? '?'}); skipping image`,
        );
        return null;
      }
      // Validated raster preserved byte-for-byte, with a format-derived MIME.
      return {
        bytes,
        mimeType: detectedMime,
        width: meta.width,
        height: meta.height,
      };
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

  /**
   * Map a sharp-detected format to the MIME we publish, restricted to supported
   * raster images. Vector (svg) and unrecognized/undetected formats return null
   * so the object is rejected rather than published as an undecodable image.
   */
  private mimeFromSharpFormat(format?: string): string | null {
    switch (format) {
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'avif':
        return 'image/avif';
      default:
        return null;
    }
  }
}
