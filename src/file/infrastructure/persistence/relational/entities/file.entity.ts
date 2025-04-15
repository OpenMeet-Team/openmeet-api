import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Transform } from 'class-transformer';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiProperty } from '@nestjs/swagger';
import { AppConfig } from '../../../../../config/app-config.type';
import appConfig from '../../../../../config/app.config';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { FileConfig, FileDriver } from '../../../../config/file-config.type';
import fileConfig from '../../../../config/file.config';
import { ulid } from 'ulid';

@Entity({ name: 'files' })
export class FileEntity extends EntityRelationalHelper {
  @ApiProperty({
    type: Number,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'char', length: 26, unique: true })
  ulid: string;

  @ApiProperty({
    type: String,
    example: 'image.jpg',
  })
  @Column()
  fileName: string;

  @ApiProperty({
    type: Number,
    example: 138723,
  })
  @Column()
  fileSize: number;

  @ApiProperty({
    type: String,
    example: 'image/jpeg',
  })
  @Column()
  mimeType: string;

  @ApiProperty({
    type: String,
    example: 'https://example.com/path/to/file.jpg',
  })
  @Column()
  @Transform(
    ({ value }) => {
      const config = fileConfig() as FileConfig;

      if (config.driver === FileDriver.LOCAL) {
        return (appConfig() as AppConfig).backendDomain + value;
      } else if (
        [FileDriver.S3_PRESIGNED, FileDriver.S3].includes(config.driver)
      ) {
        const s3 = new S3Client({
          region: config.awsS3Region ?? '',
          credentials: {
            accessKeyId: config.accessKeyId ?? '',
            secretAccessKey: config.secretAccessKey ?? '',
          },
        });

        const command = new GetObjectCommand({
          Bucket: config.awsDefaultS3Bucket ?? '',
          Key: value,
        });

        return getSignedUrl(s3, command, { expiresIn: 3600 });
      } else if (config.driver === FileDriver.CLOUDFRONT) {
        // For CloudFront, we use the CloudFront distribution domain
        if (config.cloudfrontDistributionDomain) {
          return `https://${config.cloudfrontDistributionDomain}/${value}`;
        }
      }

      return value;
    },
    {
      toPlainOnly: true,
    },
  )
  path: string;

  @BeforeInsert()
  generateUlid() {
    this.ulid = ulid().toLowerCase();
  }
}
