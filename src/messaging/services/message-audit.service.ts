import { Injectable, Inject } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MessageAuditEntity } from '../entities/message-audit.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable()
export class MessageAuditService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantService: TenantConnectionService,
  ) {}

  private async getRepository(): Promise<Repository<MessageAuditEntity>> {
    const tenantId = this.request.tenantId;
    const dataSource = await this.tenantService.getTenantConnection(tenantId);
    return dataSource.getRepository(MessageAuditEntity);
  }

  async logAction(
    userId: number,
    action: MessageAuditEntity['action'],
    details?: {
      groupId?: number;
      eventId?: number;
      messageId?: number;
      additionalData?: Record<string, any>;
    },
  ): Promise<void> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    const auditEntry = repository.create({
      tenantId,
      userId,
      action,
      groupId: details?.groupId,
      eventId: details?.eventId,
      messageId: details?.messageId,
      details: details?.additionalData,
    });

    await repository.save(auditEntry);
  }

  async checkRateLimit(
    userId: number,
    groupId?: number,
    eventId?: number,
  ): Promise<{ allowed: boolean; count: number; limit: number }> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    // Get tenant config for rate limits (default: 1 message per hour)
    const tenantConfig = this.tenantService.getTenantConfig(tenantId);
    const rateLimit = tenantConfig.messagingRateLimit || 1;

    // Count messages sent in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const queryBuilder = repository
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId })
      .andWhere('audit.userId = :userId', { userId })
      .andWhere('audit.action = :action', { action: 'message_sent' })
      .andWhere('audit.createdAt > :oneHourAgo', { oneHourAgo });

    // If checking for specific group/event, filter by that context
    if (groupId) {
      queryBuilder.andWhere('audit.groupId = :groupId', { groupId });
    }
    if (eventId) {
      queryBuilder.andWhere('audit.eventId = :eventId', { eventId });
    }

    const count = await queryBuilder.getCount();

    return {
      allowed: count < rateLimit,
      count,
      limit: rateLimit,
    };
  }

  async getAuditLog(
    filters: {
      userId?: number;
      groupId?: number;
      eventId?: number;
      action?: MessageAuditEntity['action'];
      startDate?: Date;
      endDate?: Date;
    },
    page = 1,
    limit = 50,
  ): Promise<{ data: MessageAuditEntity[]; total: number }> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    const queryBuilder = repository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .leftJoinAndSelect('audit.group', 'group')
      .leftJoinAndSelect('audit.event', 'event')
      .leftJoinAndSelect('audit.message', 'message')
      .where('audit.tenantId = :tenantId', { tenantId });

    if (filters.userId) {
      queryBuilder.andWhere('audit.userId = :userId', {
        userId: filters.userId,
      });
    }
    if (filters.groupId) {
      queryBuilder.andWhere('audit.groupId = :groupId', {
        groupId: filters.groupId,
      });
    }
    if (filters.eventId) {
      queryBuilder.andWhere('audit.eventId = :eventId', {
        eventId: filters.eventId,
      });
    }
    if (filters.action) {
      queryBuilder.andWhere('audit.action = :action', {
        action: filters.action,
      });
    }
    if (filters.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    queryBuilder
      .orderBy('audit.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [entries, total] = await queryBuilder.getManyAndCount();

    return { data: entries, total };
  }
}
