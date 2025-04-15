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
    cloudfrontDistributionDomain: process.env.CLOUDFRONT_DISTRIBUTION_DOMAIN,
    cloudfrontKeyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    cloudfrontPrivateKey: process.env.CLOUDFRONT_PRIVATE_KEY,
    maxFileSize: parseInt(process.env.AWS_S3_MAX_FILE_SIZE ?? '5242880', 10), // 5mb
  };
});
