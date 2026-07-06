import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Values needed to construct an S3Client for the file uploader/reader.
 * Sourced from `file.*` config (see file.config.ts).
 */
export interface FileS3ClientParams {
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Custom S3-compatible endpoint (e.g. DigitalOcean Spaces
   * `https://nyc3.digitaloceanspaces.com`). When unset, the AWS SDK's default
   * AWS S3 endpoint is used, preserving prior behavior.
   */
  endpoint?: string;
  /**
   * Use path-style addressing (`endpoint/bucket/key`) instead of
   * virtual-hosted-style (`bucket.endpoint/key`). Only meaningful when
   * `endpoint` is set. Leave false for DO Spaces buckets without dots.
   */
  forcePathStyle?: boolean;
}

/**
 * Build the S3ClientConfig for file storage. Adds a custom `endpoint` +
 * `forcePathStyle` only when an endpoint is provided, so AWS S3 usage is
 * unchanged when the new env vars are absent. Exported separately so the
 * mapping can be unit-tested without constructing a real client.
 */
export function buildFileS3ClientConfig(
  params: FileS3ClientParams,
): S3ClientConfig {
  const config: S3ClientConfig = {
    region: params.region,
    credentials: {
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
    },
  };

  if (params.endpoint) {
    config.endpoint = params.endpoint;
    config.forcePathStyle = params.forcePathStyle ?? false;
  }

  return config;
}

/**
 * Construct an S3Client for file storage from the given params.
 */
export function createFileS3Client(params: FileS3ClientParams): S3Client {
  return new S3Client(buildFileS3ClientConfig(params));
}
