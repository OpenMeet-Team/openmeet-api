import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FileRepository } from '../../persistence/file.repository';
import { AllConfigType } from '../../../../config/config.type';
import { FileType } from '../../../domain/file';
import { BillingService } from '../../../../billing/billing.service';
import { UsageService } from '../../../../usage/usage.service';

@Injectable()
export class FilesLocalService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly fileRepository: FileRepository,
    private readonly billingService: BillingService,
    private readonly usageService: UsageService,
  ) {}

  async create(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ file: FileType }> {
    if (!file) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'selectFile',
        },
      });
    }

    // Check current usage and limits
    const canUpload = await this.billingService.checkUserLimits(
      userId,
      'storage',
    );

    if (!canUpload) {
      throw new ForbiddenException('Storage limit exceeded');
    }

    // Track the file size usage
    await this.usageService.trackUsage(userId, 'storage', file.size, {
      fileName: file.originalname,
      mimeType: file.mimetype,
    });

    return {
      file: await this.fileRepository.create({
        path: `/${this.configService.get('app.apiPrefix', {
          infer: true,
        })}/v1/${file.path}`,
      }),
    };
  }
}
