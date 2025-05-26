import { Test, TestingModule } from '@nestjs/testing';
import { EventEmailService } from './event-email.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { UnifiedMessagingService } from './unified-messaging.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

describe('EventEmailService', () => {
  let service: EventEmailService;
  let mockGroupMemberService: jest.Mocked<GroupMemberService>;
  let mockTenantService: jest.Mocked<TenantConnectionService>;
  let mockMessagingService: jest.Mocked<UnifiedMessagingService>;

  beforeEach(async () => {
    mockGroupMemberService = {
      getGroupMemberForEmailTemplate: jest.fn(),
    } as any;

    mockTenantService = {
      getTenantConfig: jest.fn(),
    } as any;

    mockMessagingService = {
      sendSystemMessage: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventEmailService,
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
        {
          provide: UnifiedMessagingService,
          useValue: mockMessagingService,
        },
      ],
    }).compile();

    service = module.get<EventEmailService>(EventEmailService);
    jest.clearAllMocks();
  });

  describe('sendRoleUpdateEmailByMemberId', () => {
    const mockRoleUpdateData = {
      groupMemberId: 101,
      tenantId: 'tenant123',
    };

    const mockUser = {
      id: 1,
      slug: 'test-user',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    };

    const mockGroup = {
      id: 1,
      slug: 'test-group',
      name: 'Test Group',
    };

    const mockGroupMember = {
      id: 1,
      user: mockUser,
      group: mockGroup,
      groupRole: {
        id: 1,
        name: 'Admin',
      },
    };

    const mockTenantConfig = {
      id: 'tenant123',
      name: 'Test Tenant',
      frontendDomain: 'https://test.example.com',
      logoUrl: 'https://test.example.com/logo.png',
      companyDomain: 'test.example.com',
      confirmEmail: true,
      mailDefaultEmail: 'noreply@test.example.com',
      mailDefaultName: 'Test Tenant',
      googleClientId: 'test-google-client-id',
      googleClientSecret: 'test-google-client-secret',
      githubClientId: 'test-github-client-id',
      githubClientSecret: 'test-github-client-secret',
      systemUserId: 1,
      messagingRateLimit: 10,
    };

    beforeEach(() => {
      mockGroupMemberService.getGroupMemberForEmailTemplate = jest
        .fn()
        .mockResolvedValue(mockGroupMember);
      mockTenantService.getTenantConfig.mockReturnValue(mockTenantConfig);
      mockMessagingService.sendSystemMessage.mockResolvedValue({} as any);
    });

    it('should send role update email with template successfully', async () => {
      const result =
        await service.sendRoleUpdateEmailByMemberId(mockRoleUpdateData);

      expect(
        mockGroupMemberService.getGroupMemberForEmailTemplate,
      ).toHaveBeenCalledWith(mockRoleUpdateData.groupMemberId);
      expect(mockTenantService.getTenantConfig).toHaveBeenCalledWith(
        mockRoleUpdateData.tenantId,
      );

      expect(mockMessagingService.sendSystemMessage).toHaveBeenCalledWith({
        recipientEmail: mockUser.email,
        subject: 'Your group role has been updated',
        content: `Your role in the group "${mockGroup.name}" has been updated to ${mockGroupMember.groupRole.name}. Please check the group details for more information.`,
        templateId: 'group/group-member-role-updated',
        context: {
          groupMember: mockGroupMember,
          tenantConfig: mockTenantConfig,
        },
        type: MessageType.GROUP_ANNOUNCEMENT,
        channels: [MessageChannel.EMAIL],
        systemReason: 'role_updated',
        tenantId: mockRoleUpdateData.tenantId,
      });

      expect(result).toBe(true);
    });

    it('should handle group member not found', async () => {
      mockGroupMemberService.getGroupMemberForEmailTemplate.mockRejectedValue(
        new Error('Group member not found'),
      );

      const result =
        await service.sendRoleUpdateEmailByMemberId(mockRoleUpdateData);

      expect(
        mockGroupMemberService.getGroupMemberForEmailTemplate,
      ).toHaveBeenCalledWith(mockRoleUpdateData.groupMemberId);
      expect(mockMessagingService.sendSystemMessage).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should handle group member without email', async () => {
      const mockGroupMemberWithoutEmail = {
        ...mockGroupMember,
        user: { ...mockGroupMember.user, email: null },
      } as any;
      mockGroupMemberService.getGroupMemberForEmailTemplate.mockResolvedValue(
        mockGroupMemberWithoutEmail,
      );

      const result =
        await service.sendRoleUpdateEmailByMemberId(mockRoleUpdateData);

      expect(
        mockGroupMemberService.getGroupMemberForEmailTemplate,
      ).toHaveBeenCalled();
      expect(mockMessagingService.sendSystemMessage).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      mockGroupMemberService.getGroupMemberForEmailTemplate.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result =
        await service.sendRoleUpdateEmailByMemberId(mockRoleUpdateData);

      expect(result).toBe(false);
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all dependencies injected', () => {
      expect(service['groupMemberService']).toBeDefined();
      expect(service['tenantService']).toBeDefined();
      expect(service['messagingService']).toBeDefined();
    });
  });
});
