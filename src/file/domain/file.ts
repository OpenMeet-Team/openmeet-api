import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { Transform } from 'class-transformer';
import fileConfig from '../config/file.config';
import { FileConfig, FileDriver } from '../config/file-config.type';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../../config/app-config.type';
import appConfig from '../../config/app.config';
import { createFileS3Client } from '../s3-client.factory';

export class FileType {
  @ApiProperty({
    type: Number,
  })
  @Allow()
  id: number;

  @ApiProperty({
    type: String,
    example: 'https://example.com/path/to/file.jpg',
  })
  @Transform(
    ({ value }) => {
      if ((fileConfig() as FileConfig).driver === FileDriver.LOCAL) {
        return (appConfig() as AppConfig).backendDomain + value;
      } else if (
        [FileDriver.S3_PRESIGNED, FileDriver.S3].includes(
          (fileConfig() as FileConfig).driver,
        )
      ) {
        const s3 = createFileS3Client({
          region: (fileConfig() as FileConfig).awsS3Region ?? '',
          accessKeyId: (fileConfig() as FileConfig).accessKeyId ?? '',
          secretAccessKey: (fileConfig() as FileConfig).secretAccessKey ?? '',
          endpoint: (fileConfig() as FileConfig).awsS3Endpoint,
          forcePathStyle: (fileConfig() as FileConfig).awsS3ForcePathStyle,
        });

        const command = new GetObjectCommand({
          Bucket: (fileConfig() as FileConfig).awsDefaultS3Bucket ?? '',
          Key: value,
        });

        return getSignedUrl(s3, command, { expiresIn: 3600 });
      }

      return value;
    },
    {
      toPlainOnly: true,
    },
  )
  path: string;
}
