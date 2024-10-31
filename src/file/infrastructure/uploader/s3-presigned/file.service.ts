import {
  HttpStatus,
  Inject,
  Injectable,
  PayloadTooLargeException,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
// import { FileRepository } from '../../persistence/file.repository';

import { FileUploadDto } from './dto/file.dto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { ConfigService } from '@nestjs/config';
import { FileType } from '../../../domain/file';
import { FileEntity } from '../../persistence/relational/entities/file.entity';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../../../tenant/tenant.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
@Injectable()
export class FilesS3PresignedService {
  private s3: S3Client;
  private fileRepository: Repository<FileEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    // private readonly fileRepository: FileRepository,
    private readonly configService: ConfigService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    this.s3 = new S3Client({
      region: configService.get('file.awsS3Region', { infer: true }),
      credentials: {
        accessKeyId: configService.getOrThrow('file.accessKeyId', {
          infer: true,
        }),
        secretAccessKey: configService.getOrThrow('file.secretAccessKey', {
          infer: true,
        }),
      },
    });
  }

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.fileRepository = dataSource.getRepository(FileEntity);
  }

  async create(
    file: FileUploadDto,
  ): Promise<{ file: FileType; uploadSignedUrl: string }> {
    await this.getTenantSpecificGroupRepository();
    // Validate if the file object exists
    if (!file) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'selectFile',
        },
      });
    }

    // Validate the file extension
    if (!file.fileName.match(/\.(jpg|jpeg|png|gif)$/i)) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: `cantUploadFileType`,
        },
      });
    }

    // Validate the file size
    const maxFileSize = this.configService.get<number>('file.maxFileSize', {
      infer: true,
    });
    if (file.fileSize > (maxFileSize || 0)) {
      throw new PayloadTooLargeException({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        message: 'File too large',
      });
    }

    // Generate a unique key for the file in S3
    const key = `${randomStringGenerator()}.${file.fileName
      .split('.')
      .pop()
      ?.toLowerCase()}`;

    // Create an S3 PutObjectCommand with necessary parameters
    const command = new PutObjectCommand({
      Bucket: this.configService.getOrThrow<string>('file.awsDefaultS3Bucket', {
        infer: true,
      }),
      Key: key,
      ContentLength: file.fileSize,
      ContentType: file.mimeType, // Set the MIME type from the request body
    });

    // Generate a presigned URL for the client to upload the file
    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 });

    const tenantId = this.request.tenantId;
    // Save the file metadata in the database
    const data = await this.fileRepository.create({
      path: key,
      fileName: `${tenantId}/${file.fileName}`,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    });

    const savedFile = await this.fileRepository.save(data);
    return {
      file: savedFile,
      uploadSignedUrl: signedUrl,
    };
  }

  async findById(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();

    return this.fileRepository.findOne({ where: { id } });
  }
}
