import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { MessagingController } from './messaging.controller';
import { UnifiedMessagingService } from './services/unified-messaging.service';
import { MessageDraftService } from './services/message-draft.service';
import { MessageAuditService } from './services/message-audit.service';
import { MessagePauseService } from './services/message-pause.service';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';
import { UserService } from '../user/user.service';
import {
  MessageStatus,
  MessageType,
  MessageChannel,
} from './interfaces/message.interface';
import { PermissionsGuard } from '../shared/guard/permissions.guard';

describe('MessagingController', () => {
  let controller: MessagingController;
  let mockMessagingService: jest.Mocked<UnifiedMessagingService>;
  let mockDraftService: jest.Mocked<MessageDraftService>;
  let mockAuditService: jest.Mocked<MessageAuditService>;
  let mockPauseService: jest.Mocked<MessagePauseService>;
  let mockGroupService: jest.Mocked<GroupService>;
  let mockEventService: jest.Mocked<EventQueryService>;
  let mockUserService: jest.Mocked<UserService>;

  const mockUser = {
    id: 1,
    slug: 'test-user',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  } as any;

  const mockRequest = {
    tenantId: 'test-tenant',
  } as any;

  beforeEach(async () => {
    mockMessagingService = {
      sendGroupMessage: jest.fn(),
      sendEventMessage: jest.fn(),
      sendMessage: jest.fn(),
    } as any;

    mockDraftService = {
      getUserDrafts: jest.fn(),
      getDraft: jest.fn(),
      updateDraft: jest.fn(),
      deleteDraft: jest.fn(),
      approveDraft: jest.fn(),
      rejectDraft: jest.fn(),
    } as any;

    mockAuditService = {
      getAuditLog: jest.fn(),
      checkRateLimit: jest.fn(),
    } as any;

    mockPauseService = {
      pauseMessaging: jest.fn(),
      resumeMessaging: jest.fn(),
      isMessagingPaused: jest.fn(),
      getPauseTTL: jest.fn(),
      extendPause: jest.fn(),
    } as any;

    mockGroupService = {
      findGroupBySlug: jest.fn(),
    } as any;

    mockEventService = {
      findEventBySlug: jest.fn(),
    } as any;

    mockUserService = {
      findBySlug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagingController],
      providers: [
        { provide: UnifiedMessagingService, useValue: mockMessagingService },
        { provide: MessageDraftService, useValue: mockDraftService },
        { provide: MessageAuditService, useValue: mockAuditService },
        { provide: MessagePauseService, useValue: mockPauseService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: EventQueryService, useValue: mockEventService },
        { provide: UserService, useValue: mockUserService },
        {
          provide: Reflector,
          useValue: { get: jest.fn(), getAllAndOverride: jest.fn() },
        },
        {
          provide: PermissionsGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        { provide: 'AuthService', useValue: { validateUser: jest.fn() } },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MessagingController>(MessagingController);
  });

  describe('sendGroupMessage', () => {
    it('should send group message successfully', async () => {
      const groupSlug = 'test-group';
      const messageRequest = {
        subject: 'Test Subject',
        content: 'Test Content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all' as const,
      };

      const expectedResult = {
        draftSlug: 'draft-123',
        recipientCount: 5,
        requiresReview: false,
      };

      mockMessagingService.sendGroupMessage.mockResolvedValue(expectedResult);

      const result = await controller.sendGroupMessage(
        groupSlug,
        mockUser,
        messageRequest,
        mockRequest,
      );

      expect(mockMessagingService.sendGroupMessage).toHaveBeenCalledWith(
        mockRequest.tenantId,
        groupSlug,
        mockUser.slug,
        {
          ...messageRequest,
          type: MessageType.GROUP_ANNOUNCEMENT,
        },
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle messaging service errors', async () => {
      const groupSlug = 'test-group';
      const messageRequest = {
        subject: 'Test Subject',
        content: 'Test Content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all' as const,
      };

      mockMessagingService.sendGroupMessage.mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(
        controller.sendGroupMessage(
          groupSlug,
          mockUser,
          messageRequest,
          mockRequest,
        ),
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('sendEventMessage', () => {
    it('should send event message successfully', async () => {
      const eventSlug = 'test-event';
      const messageRequest = {
        subject: 'Event Update',
        content: 'Event Content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'attendees' as const,
      };

      const expectedResult = {
        draftSlug: 'draft-456',
        recipientCount: 10,
        requiresReview: true,
      };

      mockMessagingService.sendEventMessage.mockResolvedValue(expectedResult);

      const result = await controller.sendEventMessage(
        eventSlug,
        mockUser,
        messageRequest,
        mockRequest,
      );

      expect(mockMessagingService.sendEventMessage).toHaveBeenCalledWith(
        mockRequest.tenantId,
        eventSlug,
        mockUser.slug,
        {
          ...messageRequest,
          type: MessageType.EVENT_ANNOUNCEMENT,
        },
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle messaging service errors', async () => {
      const eventSlug = 'test-event';
      const messageRequest = {
        subject: 'Test Subject',
        content: 'Test Content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all' as const,
      };

      mockMessagingService.sendEventMessage.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(
        controller.sendEventMessage(
          eventSlug,
          mockUser,
          messageRequest,
          mockRequest,
        ),
      ).rejects.toThrow('User not found');
    });
  });

  describe('getUserDrafts', () => {
    it('should get user drafts with default pagination', async () => {
      const expectedDrafts = {
        drafts: [
          {
            id: 1,
            slug: 'draft-1',
            subject: 'Test Subject',
            status: MessageStatus.DRAFT,
          } as any,
        ],
        total: 1,
      };

      mockDraftService.getUserDrafts.mockResolvedValue(expectedDrafts);

      const result = await controller.getUserDrafts(mockUser);

      expect(mockDraftService.getUserDrafts).toHaveBeenCalledWith(
        mockUser.id,
        {},
        1,
        20,
      );
      expect(result).toEqual(expectedDrafts);
    });

    it('should get user drafts with filters and custom pagination', async () => {
      const expectedDrafts = {
        drafts: [],
        total: 0,
      };

      mockDraftService.getUserDrafts.mockResolvedValue(expectedDrafts);

      const result = await controller.getUserDrafts(
        mockUser,
        MessageStatus.APPROVED,
        MessageType.GROUP_ANNOUNCEMENT,
        1,
        2,
        2,
        10,
      );

      expect(mockDraftService.getUserDrafts).toHaveBeenCalledWith(
        mockUser.id,
        {
          status: MessageStatus.APPROVED,
          type: MessageType.GROUP_ANNOUNCEMENT,
          groupId: 1,
          eventId: 2,
        },
        2,
        10,
      );
      expect(result).toEqual(expectedDrafts);
    });
  });

  describe('getDraft', () => {
    it('should get draft by slug', async () => {
      const slug = 'draft-123';
      const expectedDraft = {
        id: 1,
        slug,
        subject: 'Test Subject',
        content: 'Test Content',
        status: MessageStatus.DRAFT,
      } as any;

      mockDraftService.getDraft.mockResolvedValue(expectedDraft);

      const result = await controller.getDraft(slug, mockUser);

      expect(mockDraftService.getDraft).toHaveBeenCalledWith(slug, mockUser.id);
      expect(result).toEqual(expectedDraft);
    });
  });

  describe('updateDraft', () => {
    it('should update draft successfully', async () => {
      const slug = 'draft-123';
      const updates = {
        subject: 'Updated Subject',
        content: 'Updated Content',
      };

      const expectedDraft = {
        id: 1,
        slug,
        subject: 'Updated Subject',
        content: 'Updated Content',
        status: MessageStatus.DRAFT,
      } as any;

      mockDraftService.updateDraft.mockResolvedValue(expectedDraft);

      const result = await controller.updateDraft(slug, mockUser, updates);

      expect(mockDraftService.updateDraft).toHaveBeenCalledWith(
        slug,
        mockUser.id,
        updates,
      );
      expect(result).toEqual(expectedDraft);
    });
  });

  describe('deleteDraft', () => {
    it('should delete draft successfully', async () => {
      const slug = 'draft-123';

      mockDraftService.deleteDraft.mockResolvedValue(undefined);

      const result = await controller.deleteDraft(slug, mockUser);

      expect(mockDraftService.deleteDraft).toHaveBeenCalledWith(
        slug,
        mockUser.id,
      );
      expect(result).toEqual({ message: 'Draft deleted successfully' });
    });
  });

  describe('approveDraft', () => {
    it('should approve and send draft successfully', async () => {
      const slug = 'draft-123';
      const approvedDraft = {
        id: 1,
        slug,
        status: MessageStatus.APPROVED,
      } as any;

      mockDraftService.approveDraft.mockResolvedValue(approvedDraft);
      mockMessagingService.sendMessage.mockResolvedValue(undefined);

      const result = await controller.approveDraft(slug, mockUser, mockRequest);

      expect(mockDraftService.approveDraft).toHaveBeenCalledWith(
        slug,
        mockUser.id,
      );
      expect(mockMessagingService.sendMessage).toHaveBeenCalledWith(
        mockRequest.tenantId,
        slug,
      );
      expect(result).toEqual(approvedDraft);
    });
  });

  describe('rejectDraft', () => {
    it('should reject draft successfully', async () => {
      const slug = 'draft-123';
      const rejectDto = { reason: 'Inappropriate content' };
      const rejectedDraft = {
        id: 1,
        slug,
        status: MessageStatus.REJECTED,
        rejectionReason: 'Inappropriate content',
      } as any;

      mockDraftService.rejectDraft.mockResolvedValue(rejectedDraft);

      const result = await controller.rejectDraft(slug, mockUser, rejectDto);

      expect(mockDraftService.rejectDraft).toHaveBeenCalledWith(
        slug,
        mockUser.id,
        'Inappropriate content',
      );
      expect(result).toEqual(rejectedDraft);
    });
  });

  describe('getAuditLog', () => {
    it('should get audit log without filters', async () => {
      const expectedAuditLog = {
        data: [
          {
            id: 1,
            action: 'message_sent',
            userId: 1,
            createdAt: expect.any(Date),
          } as any,
        ],
        total: 1,
      };

      mockAuditService.getAuditLog.mockResolvedValue(expectedAuditLog);

      const result = await controller.getAuditLog(mockRequest);

      expect(mockAuditService.getAuditLog).toHaveBeenCalledWith(
        'test-tenant',
        {},
        1,
        50,
      );
      expect(result).toEqual(expectedAuditLog);
    });

    it('should get audit log with slug filters converted to IDs', async () => {
      const mockUserObj = { id: 2, slug: 'other-user' };
      const mockGroup = { id: 3, slug: 'test-group' };
      const mockEvent = { id: 4, slug: 'test-event' };

      mockUserService.findBySlug.mockResolvedValue(mockUserObj as any);
      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup as any);
      mockEventService.findEventBySlug.mockResolvedValue(mockEvent as any);

      const expectedAuditLog = {
        data: [],
        total: 0,
      };

      mockAuditService.getAuditLog.mockResolvedValue(expectedAuditLog);

      const result = await controller.getAuditLog(
        mockRequest,
        'other-user',
        'test-group',
        'test-event',
        'message_sent',
        '2023-01-01',
        '2023-12-31',
        2,
        25,
      );

      expect(mockUserService.findBySlug).toHaveBeenCalledWith('other-user');
      expect(mockGroupService.findGroupBySlug).toHaveBeenCalledWith(
        'test-group',
      );
      expect(mockEventService.findEventBySlug).toHaveBeenCalledWith(
        'test-event',
      );

      expect(mockAuditService.getAuditLog).toHaveBeenCalledWith(
        'test-tenant',
        {
          userId: 2,
          groupId: 3,
          eventId: 4,
          action: 'message_sent',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-12-31'),
        },
        2,
        25,
      );
      expect(result).toEqual(expectedAuditLog);
    });

    it('should handle non-existent entities gracefully', async () => {
      mockUserService.findBySlug.mockResolvedValue(null);
      mockGroupService.findGroupBySlug.mockResolvedValue(null as any);
      mockEventService.findEventBySlug.mockResolvedValue(null);

      const expectedAuditLog = {
        data: [],
        total: 0,
      };

      mockAuditService.getAuditLog.mockResolvedValue(expectedAuditLog);

      const result = await controller.getAuditLog(
        mockRequest,
        'non-existent-user',
        'non-existent-group',
        'non-existent-event',
      );

      expect(mockAuditService.getAuditLog).toHaveBeenCalledWith(
        'test-tenant',
        {},
        1,
        50,
      );
      expect(result).toEqual(expectedAuditLog);
    });
  });

  describe('checkRateLimit', () => {
    it('should check rate limit without filters', async () => {
      const expectedRateLimit = {
        allowed: true,
        limit: 1,
        count: 0,
      };

      mockAuditService.checkRateLimit.mockResolvedValue(expectedRateLimit);

      const result = await controller.checkRateLimit(mockRequest, mockUser);

      expect(mockAuditService.checkRateLimit).toHaveBeenCalledWith(
        'test-tenant',
        mockUser.id,
        undefined,
        undefined,
      );
      expect(result).toEqual(expectedRateLimit);
    });

    it('should check rate limit with group and event filters', async () => {
      const mockGroup = { id: 3, slug: 'test-group' };
      const mockEvent = { id: 4, slug: 'test-event' };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup as any);
      mockEventService.findEventBySlug.mockResolvedValue(mockEvent as any);

      const expectedRateLimit = {
        allowed: false,
        limit: 1,
        count: 1,
      };

      mockAuditService.checkRateLimit.mockResolvedValue(expectedRateLimit);

      const result = await controller.checkRateLimit(
        mockRequest,
        mockUser,
        'test-group',
        'test-event',
      );

      expect(mockGroupService.findGroupBySlug).toHaveBeenCalledWith(
        'test-group',
      );
      expect(mockEventService.findEventBySlug).toHaveBeenCalledWith(
        'test-event',
      );
      expect(mockAuditService.checkRateLimit).toHaveBeenCalledWith(
        'test-tenant',
        mockUser.id,
        3,
        4,
      );
      expect(result).toEqual(expectedRateLimit);
    });
  });

  describe('pause management', () => {
    describe('pauseMessaging', () => {
      it('should pause messaging successfully', async () => {
        const pauseStatus = {
          paused: true,
          reason: 'System maintenance',
          pausedAt: new Date().toISOString(),
          pausedBy: 'admin',
        };

        mockPauseService.pauseMessaging.mockResolvedValue(undefined);
        mockPauseService.isMessagingPaused.mockResolvedValue(pauseStatus);

        const result = await controller.pauseMessaging(
          'System maintenance',
          3600,
        );

        expect(mockPauseService.pauseMessaging).toHaveBeenCalledWith(
          'System maintenance',
          3600,
        );
        expect(result).toEqual({
          message: 'Messaging paused successfully',
          status: pauseStatus,
        });
      });
    });

    describe('resumeMessaging', () => {
      it('should resume messaging successfully', async () => {
        mockPauseService.resumeMessaging.mockResolvedValue(undefined);

        const result = await controller.resumeMessaging();

        expect(mockPauseService.resumeMessaging).toHaveBeenCalled();
        expect(result).toEqual({ message: 'Messaging resumed successfully' });
      });
    });

    describe('getPauseStatus', () => {
      it('should get pause status successfully', async () => {
        const status = {
          paused: false,
          reason: undefined,
          pausedAt: undefined,
          pausedBy: undefined,
        };
        const ttl = 0;

        mockPauseService.isMessagingPaused.mockResolvedValue(status);
        mockPauseService.getPauseTTL.mockResolvedValue(ttl);

        const result = await controller.getPauseStatus();

        expect(mockPauseService.isMessagingPaused).toHaveBeenCalled();
        expect(mockPauseService.getPauseTTL).toHaveBeenCalled();
        expect(result).toEqual({ ...status, ttl });
      });
    });

    describe('extendPause', () => {
      it('should extend pause successfully', async () => {
        const additionalSeconds = 1800;
        const newTtl = 5400;

        mockPauseService.extendPause.mockResolvedValue(undefined);
        mockPauseService.getPauseTTL.mockResolvedValue(newTtl);

        const result = await controller.extendPause(additionalSeconds);

        expect(mockPauseService.extendPause).toHaveBeenCalledWith(
          additionalSeconds,
        );
        expect(result).toEqual({
          message: `Pause extended by ${additionalSeconds} seconds`,
          newTtl,
        });
      });
    });
  });
});
