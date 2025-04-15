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
  cloudfrontDistributionDomain?: string;
  cloudfrontKeyPairId?: string;
  cloudfrontPrivateKey?: string;
  maxFileSize: number;
};
