export enum FileDriver {
  LOCAL = 'local',
  S3 = 's3',
  S3_PRESIGNED = 's3-presigned',
  CLOUDFRONT = 'cloudfront',
}

export type FileConfig = {
  driver: FileDriver;
  accessKeyId?: string;
  secretAccessKey?: string;
  awsDefaultS3Bucket?: string;
  awsS3Region?: string;
  awsS3Endpoint?: string;
  awsS3ForcePathStyle?: boolean;
  cloudfrontDistributionDomain?: string;
  cloudfrontKeyPairId?: string;
  cloudfrontPrivateKey?: string;
  // Extra hostnames trusted as OpenMeet-controlled media origins when mapping a
  // legacy full-URL image reference back to an object key (e.g. a retired
  // CloudFront distribution kept alive for images baked into old records). Read
  // only -- the object is still fetched from our own bucket, never these hosts.
  mediaAllowedLegacyOrigins?: string[];
  maxFileSize: number;
};
