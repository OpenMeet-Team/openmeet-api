import { Injectable, Logger } from '@nestjs/common';

/**
 * MatrixMessageService - Legacy service maintained for compatibility
 * 
 * NOTE: All messaging functionality has been moved to client-side Matrix JS SDK.
 * This service is kept minimal to avoid breaking existing dependency injection,
 * but should not be used for new functionality.
 * 
 * @deprecated All messaging is now handled client-side via Matrix JS SDK
 */
@Injectable()
export class MatrixMessageService {
  private readonly logger = new Logger(MatrixMessageService.name);

  constructor() {
    this.logger.warn(
      'MatrixMessageService is deprecated. All messaging is now handled client-side via Matrix JS SDK.'
    );
  }
}