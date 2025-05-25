import { Test, TestingModule } from '@nestjs/testing';
import { EventEmailService } from './event-email.service';
import { MessageSenderService } from './message-sender.service';
import { MessageLoggerService } from './message-logger.service';
import { MessagePolicyService } from './message-policy.service';
import { UserService } from '../../user/user.service';
import { MessageType } from '../interfaces/message.interface';

describe('EventEmailService', () => {
  let service: EventEmailService;
  let mockMessageSender: jest.Mocked<MessageSenderService>;
  let mockMessageLogger: jest.Mocked<MessageLoggerService>;
  let mockMessagePolicy: jest.Mocked<MessagePolicyService>;
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(async () => {
    mockMessageSender = {
      sendSystemEmail: jest.fn(),
    } as any;

    mockMessageLogger = {
      logSystemEmail: jest.fn(),
    } as any;

    mockMessagePolicy = {
      checkPolicies: jest.fn(),
    } as any;

    mockUserService = {
      findBySlug: jest.fn(),
    } as any;


    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventEmailService,
        {
          provide: MessageSenderService,
          useValue: mockMessageSender,
        },
        {
          provide: MessageLoggerService,
          useValue: mockMessageLogger,
        },
        {
          provide: MessagePolicyService,
          useValue: mockMessagePolicy,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<EventEmailService>(EventEmailService);
    jest.clearAllMocks();
  });

  describe('sendRoleUpdateEmail', () => {
    const mockRoleUpdateData = {
      userSlug: 'test-user',
      groupSlug: 'test-group',
      tenantId: 'tenant123',
    };

    const mockUser = {
      id: 1,
      slug: 'test-user',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    };

    beforeEach(() => {
      mockUserService.findBySlug.mockResolvedValue(mockUser as any);
      mockMessagePolicy.checkPolicies.mockResolvedValue({ allowed: true });
      mockMessageSender.sendSystemEmail.mockResolvedValue('ext_123');
      mockMessageLogger.logSystemEmail.mockResolvedValue(true);
    });

    it('should send role update email successfully', async () => {
      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(mockUserService.findBySlug).toHaveBeenCalledWith(mockRoleUpdateData.userSlug);
      
      expect(mockMessagePolicy.checkPolicies).toHaveBeenCalledWith({
        tenantId: mockRoleUpdateData.tenantId,
        userId: mockUser.id,
        systemReason: 'role_updated',
        skipRateLimit: true,
      });

      expect(mockMessageSender.sendSystemEmail).toHaveBeenCalledWith({
        recipientEmail: mockUser.email,
        subject: 'Your group role has been updated',
        text: `Your role in the group "${mockRoleUpdateData.groupSlug}" has been updated. Please check the group details for more information.`,
        html: `<p>Your role in the group "<strong>${mockRoleUpdateData.groupSlug}</strong>" has been updated.</p><p>Please check the group details for more information.</p>`,
        tenantId: mockRoleUpdateData.tenantId,
      });

      expect(mockMessageLogger.logSystemEmail).toHaveBeenCalledWith({
        tenantId: mockRoleUpdateData.tenantId,
        recipientUserId: mockUser.id,
        status: 'sent',
        externalId: 'ext_123',
        type: MessageType.GROUP_ANNOUNCEMENT,
        systemReason: 'role_updated',
      });

      expect(result).toBe(true);
    });

    it('should handle user not found', async () => {
      mockUserService.findBySlug.mockResolvedValue(null);

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(mockUserService.findBySlug).toHaveBeenCalledWith(mockRoleUpdateData.userSlug);
      expect(mockMessageSender.sendSystemEmail).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });


    it('should handle policy check denial', async () => {
      mockMessagePolicy.checkPolicies.mockResolvedValue({
        allowed: false,
        reason: 'Messaging is paused',
      });

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(mockMessagePolicy.checkPolicies).toHaveBeenCalled();
      expect(mockMessageSender.sendSystemEmail).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should handle email sending failure', async () => {
      mockMessageSender.sendSystemEmail.mockResolvedValue(null);

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(mockMessageSender.sendSystemEmail).toHaveBeenCalled();
      expect(mockMessageLogger.logSystemEmail).toHaveBeenCalledWith({
        tenantId: mockRoleUpdateData.tenantId,
        recipientUserId: mockUser.id,
        status: 'failed',
        type: MessageType.GROUP_ANNOUNCEMENT,
        systemReason: 'role_updated',
      });
      expect(result).toBe(false);
    });

    it('should handle user service error', async () => {
      mockUserService.findBySlug.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(result).toBe(false);
    });

    it('should handle group service error', async () => {
      mockUserService.findBySlug.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(result).toBe(false);
    });

    it('should handle policy check error', async () => {
      mockMessagePolicy.checkPolicies.mockRejectedValue(new Error('Policy service unavailable'));

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(result).toBe(false);
    });

    it('should continue even if logging fails', async () => {
      mockMessageLogger.logSystemEmail.mockResolvedValue(false);

      const result = await service.sendRoleUpdateEmail(mockRoleUpdateData);

      expect(mockMessageSender.sendSystemEmail).toHaveBeenCalled();
      expect(mockMessageLogger.logSystemEmail).toHaveBeenCalled();
      expect(result).toBe(true); // Still succeeds even if logging fails
    });

  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all dependencies injected', () => {
      expect(service['messageSender']).toBeDefined();
      expect(service['messageLogger']).toBeDefined();
      expect(service['messagePolicy']).toBeDefined();
      expect(service['userService']).toBeDefined();
    });
  });
});