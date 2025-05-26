import { Test, TestingModule } from '@nestjs/testing';
import {
  GroupEmailListener,
  GroupMemberRoleUpdatedEvent,
  GroupMemberJoinedEvent,
} from './group-email.listener';
import { EventEmailService } from '../services/event-email.service';
import { UnifiedMessagingService } from '../services/unified-messaging.service';

describe('GroupEmailListener', () => {
  let listener: GroupEmailListener;
  let mockEventEmailService: jest.Mocked<EventEmailService>;
  let mockMessagingService: jest.Mocked<any>;

  beforeEach(async () => {
    mockEventEmailService = {
      sendRoleUpdateEmailByMemberId: jest.fn(),
    } as any;

    mockMessagingService = {
      sendSystemMessage: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupEmailListener,
        {
          provide: EventEmailService,
          useValue: mockEventEmailService,
        },
        {
          provide: UnifiedMessagingService,
          useValue: mockMessagingService,
        },
      ],
    }).compile();

    listener = module.get<GroupEmailListener>(GroupEmailListener);
    jest.clearAllMocks();
  });

  describe('handleGroupMemberRoleUpdated', () => {
    const mockRoleUpdatedEvent: GroupMemberRoleUpdatedEvent = {
      userSlug: 'test-user',
      groupSlug: 'test-group',
      tenantId: 'tenant123',
      groupMemberId: 1,
    };

    it('should handle role updated event successfully', async () => {
      mockEventEmailService.sendRoleUpdateEmailByMemberId.mockResolvedValue(
        true,
      );

      await listener.handleGroupMemberRoleUpdated(mockRoleUpdatedEvent);

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).toHaveBeenCalledWith({
        groupMemberId: mockRoleUpdatedEvent.groupMemberId,
        tenantId: mockRoleUpdatedEvent.tenantId,
      });
      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle email sending failure gracefully', async () => {
      mockEventEmailService.sendRoleUpdateEmailByMemberId.mockResolvedValue(
        false,
      );

      // Should not throw an error
      await expect(
        listener.handleGroupMemberRoleUpdated(mockRoleUpdatedEvent),
      ).resolves.toBeUndefined();

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).toHaveBeenCalledWith({
        groupMemberId: mockRoleUpdatedEvent.groupMemberId,
        tenantId: mockRoleUpdatedEvent.tenantId,
      });
    });

    it('should handle service error gracefully', async () => {
      mockEventEmailService.sendRoleUpdateEmailByMemberId.mockRejectedValue(
        new Error('Service unavailable'),
      );

      // Should not throw an error
      await expect(
        listener.handleGroupMemberRoleUpdated(mockRoleUpdatedEvent),
      ).resolves.toBeUndefined();

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle missing groupMemberId gracefully', async () => {
      const incompleteEvent = {
        ...mockRoleUpdatedEvent,
        groupMemberId: undefined,
      } as any;

      await listener.handleGroupMemberRoleUpdated(incompleteEvent);

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).not.toHaveBeenCalled();
    });

    it('should handle invalid groupMemberId gracefully', async () => {
      const incompleteEvent = {
        ...mockRoleUpdatedEvent,
        groupMemberId: 0,
      } as any;

      await listener.handleGroupMemberRoleUpdated(incompleteEvent);

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).not.toHaveBeenCalled();
    });

    it('should handle missing tenantId gracefully', async () => {
      const incompleteEvent = {
        ...mockRoleUpdatedEvent,
        tenantId: undefined,
      } as any;

      await listener.handleGroupMemberRoleUpdated(incompleteEvent);

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).not.toHaveBeenCalled();
    });

    it('should handle empty tenantId gracefully', async () => {
      const eventWithEmptyStrings = {
        ...mockRoleUpdatedEvent,
        tenantId: '',
      };

      await listener.handleGroupMemberRoleUpdated(eventWithEmptyStrings);

      expect(
        mockEventEmailService.sendRoleUpdateEmailByMemberId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('handleGroupMemberJoined', () => {
    const mockMemberJoinedEvent: GroupMemberJoinedEvent = {
      groupMemberId: 2,
      tenantId: 'tenant456',
      userSlug: 'new-user',
      groupSlug: 'welcome-group',
    };

    it('should handle member joined event successfully', async () => {
      mockMessagingService.sendSystemMessage.mockResolvedValue(undefined);

      await listener.handleGroupMemberJoined(mockMemberJoinedEvent);

      expect(mockMessagingService.sendSystemMessage).toHaveBeenCalledWith({
        tenantId: mockMemberJoinedEvent.tenantId,
        type: 'group_announcement',
        subject: 'New member joined your group',
        content:
          'A new member has joined your group. You can view the member details in the group management section.',
        channels: ['email'],
        templateId: 'group/group-guest-joined',
        metadata: {
          eventType: 'group.member.joined',
          groupMemberId: mockMemberJoinedEvent.groupMemberId,
          tenantId: mockMemberJoinedEvent.tenantId,
        },
        targetUser: {
          type: 'group_admins',
          groupMemberId: mockMemberJoinedEvent.groupMemberId,
        },
      });
      expect(mockMessagingService.sendSystemMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle service error gracefully', async () => {
      mockMessagingService.sendSystemMessage.mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Should not throw an error
      await expect(
        listener.handleGroupMemberJoined(mockMemberJoinedEvent),
      ).resolves.toBeUndefined();

      expect(mockMessagingService.sendSystemMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('error logging behavior', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    afterEach(() => {
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
    });

    afterAll(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log warning when role update email fails', async () => {
      const mockEvent: GroupMemberRoleUpdatedEvent = {
        userSlug: 'test-user',
        groupSlug: 'test-group',
        tenantId: 'tenant123',
        groupMemberId: 1,
      };
      mockEventEmailService.sendRoleUpdateEmailByMemberId.mockResolvedValue(
        false,
      );

      await listener.handleGroupMemberRoleUpdated(mockEvent);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Role update email failed, but role change succeeded',
      );
    });

    it('should log warning when required event data is missing', async () => {
      const incompleteEvent = {
        groupMemberId: undefined,
        tenantId: 'tenant',
      } as any;

      await listener.handleGroupMemberRoleUpdated(incompleteEvent);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Missing required event data for role update email:',
        incompleteEvent,
      );
    });

    it('should log error when service throws exception', async () => {
      const mockEvent: GroupMemberRoleUpdatedEvent = {
        userSlug: 'test-user',
        groupSlug: 'test-group',
        tenantId: 'tenant123',
        groupMemberId: 1,
      };
      const error = new Error('Service crashed');
      mockEventEmailService.sendRoleUpdateEmailByMemberId.mockRejectedValue(
        error,
      );

      await listener.handleGroupMemberRoleUpdated(mockEvent);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error handling group member role updated event:',
        error,
      );
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(listener).toBeDefined();
    });

    it('should have event email service injected', () => {
      expect(listener['eventEmailService']).toBeDefined();
    });
  });
});
