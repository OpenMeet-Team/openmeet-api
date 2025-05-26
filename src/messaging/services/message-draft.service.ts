import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { MessageDraftEntity } from '../entities/message-draft.entity';
import { MessageAuditService } from './message-audit.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { UserService } from '../../user/user.service';
import {
  MessageType,
  MessageStatus,
  SendMessageRequest,
} from '../interfaces/message.interface';

@Injectable()
export class MessageDraftService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantService: TenantConnectionService,
    private readonly auditService: MessageAuditService,
    private readonly userService: UserService,
  ) {}

  private async getRepository(): Promise<Repository<MessageDraftEntity>> {
    const tenantId = this.request.tenantId;
    const dataSource = await this.tenantService.getTenantConnection(tenantId);
    return dataSource.getRepository(MessageDraftEntity);
  }

  async createDraft(
    authorId: number,
    request: SendMessageRequest,
    groupId?: number,
    eventId?: number,
  ): Promise<MessageDraftEntity> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    // Get author for slug
    const author = await this.userService.findOne(authorId);
    if (!author) {
      throw new NotFoundException('Author not found');
    }

    // Validate required fields
    if (!request.subject || !request.content) {
      throw new BadRequestException('Subject and content are required');
    }

    // Validate channels
    if (!request.channels || request.channels.length === 0) {
      throw new BadRequestException(
        'At least one messaging channel is required',
      );
    }

    // Validate context
    if (request.type === MessageType.GROUP_ANNOUNCEMENT && !groupId) {
      throw new BadRequestException(
        'Group ID is required for group announcements',
      );
    }
    if (request.type === MessageType.EVENT_ANNOUNCEMENT && !eventId) {
      throw new BadRequestException(
        'Event ID is required for event announcements',
      );
    }

    // Generate slug based on context
    const slug = await this.generateDraftSlug(
      request.type,
      request.subject,
      groupId,
      eventId,
      repository,
    );

    const draft = repository.create({
      tenantId,
      slug,
      type: request.type,
      subject: request.subject,
      content: request.content,
      htmlContent: request.htmlContent,
      templateId: request.templateId,
      channels: request.channels,
      groupId,
      eventId,
      recipientUserIds: request.recipientUserIds,
      recipientFilter: request.recipientFilter,
      authorId,
      status: request.requireReview
        ? MessageStatus.PENDING_REVIEW
        : MessageStatus.DRAFT,
      scheduledAt: request.scheduledAt,
    });

    const savedDraft = await repository.save(draft);

    // Log audit entry
    await this.auditService.logAction(
      tenantId,
      author.id,
      request.requireReview ? 'review_requested' : 'draft_created',
      {
        groupId,
        eventId,
        messageId: savedDraft.id,
        additionalData: {
          type: request.type,
          channels: request.channels,
          recipientFilter: request.recipientFilter,
        },
      },
    );

    return savedDraft;
  }

  private async generateDraftSlug(
    type: MessageType,
    subject: string,
    groupId?: number,
    eventId?: number,
    repository?: Repository<MessageDraftEntity>,
  ): Promise<string> {
    // Get the repository if not provided
    const repo = repository || (await this.getRepository());

    // Get context from the database to get the actual slug
    let contextSlug = 'message';
    if (groupId) {
      const dataSource = await this.tenantService.getTenantConnection(
        this.request.tenantId,
      );
      const groupRepo = dataSource.getRepository('GroupEntity');
      const group = await groupRepo.findOne({ where: { id: groupId } });
      if (group) contextSlug = group.slug;
    } else if (eventId) {
      const dataSource = await this.tenantService.getTenantConnection(
        this.request.tenantId,
      );
      const eventRepo = dataSource.getRepository('EventEntity');
      const event = await eventRepo.findOne({ where: { id: eventId } });
      if (event) contextSlug = event.slug;
    }

    // Create base slug from subject
    const baseSlug = subject
      .toLowerCase()
      .substring(0, 30)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-'); // Replace multiple hyphens with single

    // Generate unique suffix
    let slug: string;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      slug = `${contextSlug}-${baseSlug || 'draft'}-${randomSuffix}`;

      // Check if slug already exists
      const existing = await repo.findOne({
        where: { slug, tenantId: this.request.tenantId },
      });

      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    return slug!;
  }

  async getDraft(slug: string, userId: number): Promise<MessageDraftEntity> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    const draft = await repository.findOne({
      where: { slug, tenantId },
      relations: ['author', 'reviewer', 'group', 'event'],
    });

    if (!draft) {
      throw new NotFoundException('Message draft not found');
    }

    // Check if user has access to this draft
    // User ID 0 is used for system/admin access
    if (
      userId !== 0 &&
      draft.authorId !== userId &&
      draft.reviewerId !== userId
    ) {
      throw new ForbiddenException('Access denied to this message draft');
    }

    return draft;
  }

  async updateDraft(
    slug: string,
    userId: number,
    updates: Partial<SendMessageRequest>,
  ): Promise<MessageDraftEntity> {
    const repository = await this.getRepository();

    const draft = await this.getDraft(slug, userId);

    // Only author can update drafts
    if (draft.authorId !== userId) {
      throw new ForbiddenException('Only the author can update message drafts');
    }

    // Can only update drafts that haven't been sent
    if (draft.status === MessageStatus.SENT) {
      throw new BadRequestException('Cannot update sent messages');
    }

    // Update draft fields
    if (updates.subject !== undefined) draft.subject = updates.subject;
    if (updates.content !== undefined) draft.content = updates.content;
    if (updates.htmlContent !== undefined)
      draft.htmlContent = updates.htmlContent;
    if (updates.templateId !== undefined) draft.templateId = updates.templateId;
    if (updates.channels !== undefined) draft.channels = updates.channels;
    if (updates.recipientUserIds !== undefined)
      draft.recipientUserIds = updates.recipientUserIds;
    if (updates.recipientFilter !== undefined)
      draft.recipientFilter = updates.recipientFilter;
    if (updates.scheduledAt !== undefined)
      draft.scheduledAt = updates.scheduledAt;

    return await repository.save(draft);
  }

  async approveDraft(
    slug: string,
    reviewerId: number,
  ): Promise<MessageDraftEntity> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    // Fetch draft directly - approval permissions should be checked at controller level
    const draft = await repository.findOne({
      where: { slug, tenantId },
      relations: ['author', 'reviewer', 'group', 'event'],
    });

    if (!draft) {
      throw new NotFoundException('Message draft not found');
    }

    if (draft.status !== MessageStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only pending messages can be approved');
    }

    // Check for self-approval
    if (draft.authorId === reviewerId) {
      throw new BadRequestException('Cannot approve your own message');
    }

    // Get reviewer for slug
    const reviewer = await this.userService.findOne(reviewerId);
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    draft.status = MessageStatus.APPROVED;
    draft.reviewerId = reviewerId;

    const updatedDraft = await repository.save(draft);

    await this.auditService.logAction(
      tenantId,
      reviewer.id,
      'message_approved',
      {
        groupId: draft.groupId,
        eventId: draft.eventId,
        messageId: draft.id,
      },
    );

    return updatedDraft;
  }

  async rejectDraft(
    slug: string,
    reviewerId: number,
    reason?: string,
  ): Promise<MessageDraftEntity> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    // Fetch draft directly - rejection permissions should be checked at controller level
    const draft = await repository.findOne({
      where: { slug, tenantId },
      relations: ['author', 'reviewer', 'group', 'event'],
    });

    if (!draft) {
      throw new NotFoundException('Message draft not found');
    }

    if (draft.status !== MessageStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only pending messages can be rejected');
    }

    // Get reviewer for slug
    const reviewer = await this.userService.findOne(reviewerId);
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    draft.status = MessageStatus.REJECTED;
    draft.reviewerId = reviewerId;
    draft.rejectionReason = reason;

    const updatedDraft = await repository.save(draft);

    await this.auditService.logAction(
      tenantId,
      reviewer.id,
      'message_rejected',
      {
        groupId: draft.groupId,
        eventId: draft.eventId,
        messageId: draft.id,
        additionalData: { reason },
      },
    );

    return updatedDraft;
  }

  async deleteDraft(slug: string, userId: number): Promise<void> {
    const repository = await this.getRepository();

    const draft = await this.getDraft(slug, userId);

    // Only author can delete drafts
    if (draft.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete message drafts');
    }

    // Cannot delete sent messages
    if (draft.status === MessageStatus.SENT) {
      throw new BadRequestException('Cannot delete sent messages');
    }

    await repository.remove(draft);
  }

  async getUserDrafts(
    userId: number,
    filters: {
      status?: MessageStatus;
      type?: MessageType;
      groupId?: number;
      eventId?: number;
    } = {},
    page = 1,
    limit = 20,
  ): Promise<{ drafts: MessageDraftEntity[]; total: number }> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    const queryBuilder = repository
      .createQueryBuilder('draft')
      .leftJoinAndSelect('draft.author', 'author')
      .leftJoinAndSelect('draft.reviewer', 'reviewer')
      .leftJoinAndSelect('draft.group', 'group')
      .leftJoinAndSelect('draft.event', 'event')
      .where('draft.tenantId = :tenantId', { tenantId })
      .andWhere('(draft.authorId = :userId OR draft.reviewerId = :userId)', {
        userId,
      });

    if (filters.status) {
      queryBuilder.andWhere('draft.status = :status', {
        status: filters.status,
      });
    }
    if (filters.type) {
      queryBuilder.andWhere('draft.type = :type', { type: filters.type });
    }
    if (filters.groupId) {
      queryBuilder.andWhere('draft.groupId = :groupId', {
        groupId: filters.groupId,
      });
    }
    if (filters.eventId) {
      queryBuilder.andWhere('draft.eventId = :eventId', {
        eventId: filters.eventId,
      });
    }

    queryBuilder
      .orderBy('draft.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [drafts, total] = await queryBuilder.getManyAndCount();

    return { drafts, total };
  }

  async markAsSent(slug: string): Promise<MessageDraftEntity> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    const draft = await repository.findOne({
      where: { slug, tenantId },
    });

    if (!draft) {
      throw new NotFoundException('Message draft not found');
    }

    draft.status = MessageStatus.SENT;
    draft.sentAt = new Date();

    return await repository.save(draft);
  }

  async findBySlug(slug: string): Promise<MessageDraftEntity | null> {
    const tenantId = this.request.tenantId;
    const repository = await this.getRepository();

    return await repository.findOne({
      where: { slug, tenantId },
    });
  }
}
