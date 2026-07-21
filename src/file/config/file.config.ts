import { registerAs } from '@nestjs/config';

import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { FileDriver, FileConfig } from './file-config.type';

class EnvironmentVariablesValidator {
  @IsEnum(FileDriver)
  FILE_DRIVER: FileDriver;

  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  ACCESS_KEY_ID: string;

  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  SECRET_ACCESS_KEY: string;

  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  AWS_DEFAULT_S3_BUCKET: string;

  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  AWS_S3_REGION: string;

  // Optional custom S3-compatible endpoint (e.g. DigitalOcean Spaces).
  // When unset, the AWS SDK targets AWS S3 as before.
  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  @IsOptional()
  AWS_S3_ENDPOINT: string;

  @ValidateIf((envValues) =>
    [FileDriver.S3, FileDriver.S3_PRESIGNED, FileDriver.CLOUDFRONT].includes(
      envValues.FILE_DRIVER,
    ),
  )
  @IsString()
  @IsOptional()
  AWS_S3_FORCE_PATH_STYLE: string;

  @ValidateIf((envValues) => envValues.FILE_DRIVER === FileDriver.CLOUDFRONT)
  @IsString()
  CLOUDFRONT_DISTRIBUTION_DOMAIN: string;

  @ValidateIf((envValues) => envValues.FILE_DRIVER === FileDriver.CLOUDFRONT)
  @IsString()
  @IsOptional()
  CLOUDFRONT_KEY_PAIR_ID: string;

  @ValidateIf((envValues) => envValues.FILE_DRIVER === FileDriver.CLOUDFRONT)
  @IsString()
  @IsOptional()
  CLOUDFRONT_PRIVATE_KEY: string;

  // Comma-separated hostnames trusted as OpenMeet media origins when mapping a
  // legacy full-URL image back to an object key (e.g. a retired CloudFront
  // distribution). Optional; applies under any driver.
  @IsString()
  @IsOptional()
  MEDIA_ALLOWED_LEGACY_ORIGINS: string;
}

export default registerAs<FileConfig>('file', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    driver:
      (process.env.FILE_DRIVER as FileDriver | undefined) ??
      FileDriver.S3_PRESIGNED,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    awsDefaultS3Bucket: process.env.AWS_DEFAULT_S3_BUCKET,
    awsS3Region: process.env.AWS_S3_REGION,
    awsS3Endpoint: process.env.AWS_S3_ENDPOINT,
    awsS3ForcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
    cloudfrontDistributionDomain: process.env.CLOUDFRONT_DISTRIBUTION_DOMAIN,
    cloudfrontKeyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    cloudfrontPrivateKey: process.env.CLOUDFRONT_PRIVATE_KEY,
    mediaAllowedLegacyOrigins: (process.env.MEDIA_ALLOWED_LEGACY_ORIGINS ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h.length > 0),
    maxFileSize: parseInt(process.env.AWS_S3_MAX_FILE_SIZE ?? '5242880', 10), // 5mb
  };
});
