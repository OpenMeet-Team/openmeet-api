import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MessageLogEntity } from '../entities/message-log.entity';
import { MessageChannel, MessageType } from '../interfaces/message.interface';

export interface LogEmailOptions {
  tenantId: string;
  recipientUserId: number;
  channel: MessageChannel;
  status: 'sent' | 'failed';
  externalId?: string;
  error?: string;
  messageId?: number;
  metadata?: any;
}

/**
 * Service for logging email activities to database
 * Has minimal dependencies and works in event contexts
 */
@Injectable()
export class MessageLoggerService {
  constructor(private readonly tenantService: TenantConnectionService) {}

  private async getLogRepository(
    tenantId: string,
  ): Promise<Repository<MessageLogEntity> | null> {
    try {
      const dataSource = await this.tenantService.getTenantConnection(tenantId);
      return dataSource.getRepository(MessageLogEntity);
    } catch (error) {
      console.warn('Could not get log repository:', error.message);
      return null;
    }
  }

  async logEmail(options: LogEmailOptions): Promise<boolean> {
    try {
      const repository = await this.getLogRepository(options.tenantId);
      if (!repository) {
        console.warn('Database logging unavailable, email sent but not logged');
        return false;
      }

      const log = repository.create({
        tenantId: options.tenantId,
        messageId: options.messageId,
        recipientUserId: options.recipientUserId,
        channel: options.channel,
        status: options.status,
        externalId:
          options.externalId ||
          `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        error: options.error,
        metadata: {
          isSystemMessage: !options.messageId,
          ...options.metadata,
        },
      });

      await repository.save(log);
      return true;
    } catch (error) {
      console.error('Error logging email:', error);
      return false;
    }
  }

  async logSystemEmail(options: {
    tenantId: string;
    recipientUserId: number;
    status: 'sent' | 'failed';
    externalId?: string;
    error?: string;
    type: MessageType;
    systemReason?: string;
  }): Promise<boolean> {
    return this.logEmail({
      tenantId: options.tenantId,
      recipientUserId: options.recipientUserId,
      channel: MessageChannel.EMAIL,
      status: options.status,
      externalId: options.externalId,
      error: options.error,
      metadata: {
        type: options.type,
        systemReason: options.systemReason,
        isSystemMessage: true,
      },
    });
  }
}
