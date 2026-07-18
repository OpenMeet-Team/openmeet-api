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
  maxFileSize: number;
  // Public base URL fronting the PDS `com.atproto.sync.getBlob` endpoint (e.g. a
  // managed CDN at https://media.openmeet.net). Baked into federated event
  // records for images stored as PDS blobs on OpenMeet's own PDS. Unset => the
  // user's own PDS host is used instead. See src/bluesky/event-image-blob.service.ts.
  blobPublicBaseUrl?: string;
};
