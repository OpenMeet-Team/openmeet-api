import { Test, TestingModule } from '@nestjs/testing';
import { MessageDraftService } from './message-draft.service';
import { Repository } from 'typeorm';
import { MessageDraftEntity } from '../entities/message-draft.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { UserService } from '../../user/user.service';
import { MessageAuditService } from './message-audit.service';
import { REQUEST } from '@nestjs/core';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  MessageStatus,
  MessageType,
  MessageChannel,
  SendMessageRequest,
} from '../interfaces/message.interface';

describe('MessageDraftService', () => {
  let service: MessageDraftService;
  let mockRepository: Partial<Repository<MessageDraftEntity>>;
  let mockTenantService: Partial<TenantConnectionService>;
  let mockUserService: Partial<UserService>;
  let mockAuditService: any;
  let mockRequest: any;

  const mockUser = {
    id: 1,
    slug: 'test-user',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  };

  const mockDraft = {
    id: 1,
    slug: 'group-techies-announcement-x3k9',
    tenantId: 'tenant-1',
    authorId: 1,
    author: mockUser,
    type: MessageType.GROUP_ANNOUNCEMENT,
    subject: 'Test Message',
    content: 'Test content',
    htmlContent: '<p>Test content</p>',
    channels: [MessageChannel.EMAIL],
    status: MessageStatus.DRAFT,
    groupId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockReturnValue(mockDraft),
      save: jest.fn().mockResolvedValue(mockDraft),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockDraft], 1]),
      }),
    };

    const mockGroupRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 1, slug: 'techies' }),
    };

    const mockEventRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 2, slug: 'meetup' }),
    };

    mockTenantService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === 'GroupEntity') return mockGroupRepository;
          if (entity === 'EventEntity') return mockEventRepository;
          return mockRepository;
        }),
      }),
    };

    mockUserService = {
      findBySlug: jest.fn().mockResolvedValue(mockUser),
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    mockAuditService = {
      logAction: jest.fn().mockResolvedValue(undefined),
    };

    mockRequest = {
      tenantId: 'tenant-1',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageDraftService,
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: MessageAuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<MessageDraftService>(MessageDraftService);
    jest.clearAllMocks();
  });

  describe('createDraft', () => {
    it('should create a draft with generated slug', async () => {
      const draftData: SendMessageRequest = {
        type: MessageType.GROUP_ANNOUNCEMENT,
        subject: 'Test Announcement',
        content: 'Test content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const result = await service.createDraft(1, draftData, 1);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          authorId: 1,
          type: draftData.type,
          subject: draftData.subject,
          content: draftData.content,
          channels: draftData.channels,
          groupId: 1,
          slug: expect.stringMatching(/^techies-test-announcement-[a-z0-9]+$/),
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockDraft);
    });

    it('should handle event drafts', async () => {
      const draftData: SendMessageRequest = {
        type: MessageType.EVENT_ANNOUNCEMENT,
        subject: 'Event Update',
        content: 'Event content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      await service.createDraft(1, draftData, undefined, 2);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 2,
          slug: expect.stringMatching(/^meetup-event-update-[a-z0-9]+$/),
        }),
      );
    });

    it('should ensure unique slug generation', async () => {
      mockRepository.findOne = jest
        .fn()
        .mockResolvedValueOnce(mockDraft) // First slug exists
        .mockResolvedValueOnce(null); // Second slug is unique

      const draftData: SendMessageRequest = {
        type: MessageType.GROUP_ANNOUNCEMENT,
        subject: 'Test',
        content: 'Test',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      await service.createDraft(1, draftData, 1);

      expect(mockRepository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDraft', () => {
    it('should get draft by slug', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(mockDraft);

      const result = await service.getDraft(
        'group-techies-announcement-x3k9',
        1,
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          slug: 'group-techies-announcement-x3k9',
          tenantId: 'tenant-1',
        },
        relations: ['author', 'reviewer', 'group', 'event'],
      });
      expect(result).toEqual(mockDraft);
    });

    it('should throw NotFoundException when draft not found', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getDraft('non-existent', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should validate author access for non-admin users', async () => {
      const draftByOtherUser = { ...mockDraft, authorId: 2 };
      mockRepository.findOne = jest.fn().mockResolvedValue(draftByOtherUser);

      await expect(
        service.getDraft('group-techies-announcement-x3k9', 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateDraft', () => {
    it('should update draft content', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(mockDraft);

      const updates = {
        subject: 'Updated Subject',
        content: 'Updated content',
      };

      await service.updateDraft('group-techies-announcement-x3k9', 1, updates);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockDraft,
          ...updates,
        }),
      );
    });

    it('should not allow updates to non-draft status', async () => {
      const sentDraft = { ...mockDraft, status: MessageStatus.SENT };
      mockRepository.findOne = jest.fn().mockResolvedValue(sentDraft);

      await expect(
        service.updateDraft('group-techies-announcement-x3k9', 1, {
          subject: 'New',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveDraft', () => {
    it('should approve draft and set reviewer', async () => {
      // First call for getDraft - return draft in pending_review status
      const pendingDraft = {
        ...mockDraft,
        status: MessageStatus.PENDING_REVIEW,
      };
      mockRepository.findOne = jest.fn().mockResolvedValue(pendingDraft);

      await service.approveDraft('group-techies-announcement-x3k9', 2);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageStatus.APPROVED,
          reviewerId: 2,
        }),
      );
    });

    it('should not allow self-approval', async () => {
      const pendingDraft = {
        ...mockDraft,
        status: MessageStatus.PENDING_REVIEW,
      };
      mockRepository.findOne = jest.fn().mockResolvedValue(pendingDraft);

      await expect(
        service.approveDraft('group-techies-announcement-x3k9', 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectDraft', () => {
    it('should reject draft with reason', async () => {
      const pendingDraft = {
        ...mockDraft,
        status: MessageStatus.PENDING_REVIEW,
      };
      mockRepository.findOne = jest.fn().mockResolvedValue(pendingDraft);

      await service.rejectDraft(
        'group-techies-announcement-x3k9',
        2,
        'Inappropriate content',
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageStatus.REJECTED,
          reviewerId: 2,
          rejectionReason: 'Inappropriate content',
        }),
      );
    });
  });

  describe('markAsSent', () => {
    it('should mark approved draft as sent', async () => {
      const approvedDraft = { ...mockDraft, status: MessageStatus.APPROVED };
      mockRepository.findOne = jest.fn().mockResolvedValue(approvedDraft);

      await service.markAsSent('group-techies-announcement-x3k9');

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageStatus.SENT,
          sentAt: expect.any(Date),
        }),
      );
    });

    it('should allow sending draft status messages', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(mockDraft);

      await service.markAsSent('group-techies-announcement-x3k9');

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MessageStatus.SENT,
        }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should find draft by slug', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(mockDraft);

      const result = await service.findBySlug(
        'group-techies-announcement-x3k9',
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          slug: 'group-techies-announcement-x3k9',
          tenantId: 'tenant-1',
        },
      });
      expect(result).toEqual(mockDraft);
    });

    it('should return null when not found', async () => {
      mockRepository.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.findBySlug('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserDrafts', () => {
    it('should get paginated drafts with filters', async () => {
      const result = await service.getUserDrafts(
        1,
        {
          status: MessageStatus.DRAFT,
          type: MessageType.GROUP_ANNOUNCEMENT,
        },
        1,
        10,
      );

      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock).mock
        .results[0].value;
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'draft.tenantId = :tenantId',
        { tenantId: 'tenant-1' },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(draft.authorId = :userId OR draft.reviewerId = :userId)',
        { userId: 1 },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'draft.status = :status',
        { status: MessageStatus.DRAFT },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('draft.type = :type', {
        type: MessageType.GROUP_ANNOUNCEMENT,
      });
      expect(result).toEqual({
        drafts: [mockDraft],
        total: 1,
      });
    });
  });
});
