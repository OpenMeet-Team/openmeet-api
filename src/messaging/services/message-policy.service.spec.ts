import { Test, TestingModule } from '@nestjs/testing';
import { MessagePolicyService } from './message-policy.service';
import { MessageAuditService } from './message-audit.service';
import { MessagePauseService } from './message-pause.service';

describe('MessagePolicyService', () => {
  let service: MessagePolicyService;
  let mockMessageAudit: jest.Mocked<MessageAuditService>;
  let mockMessagePause: jest.Mocked<MessagePauseService>;

  beforeEach(async () => {
    mockMessageAudit = {
      checkRateLimit: jest.fn(),
    } as any;

    mockMessagePause = {
      isMessagingPaused: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagePolicyService,
        {
          provide: MessageAuditService,
          useValue: mockMessageAudit,
        },
        {
          provide: MessagePauseService,
          useValue: mockMessagePause,
        },
      ],
    }).compile();

    service = module.get<MessagePolicyService>(MessagePolicyService);
    jest.clearAllMocks();
  });

  describe('checkPolicies', () => {
    const mockPolicyOptions = {
      tenantId: 'tenant123',
      userId: 1,
      systemReason: 'role_updated',
    };

    it('should allow when all policies pass', async () => {
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockResolvedValue({
        allowed: true,
        count: 2,
        limit: 10,
      });

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: true,
      });
      expect(mockMessagePause.isMessagingPaused).toHaveBeenCalledTimes(1);
      expect(mockMessageAudit.checkRateLimit).toHaveBeenCalledWith(
        mockPolicyOptions.tenantId,
        mockPolicyOptions.userId,
        undefined,
        undefined,
      );
    });

    it('should deny when messaging is paused', async () => {
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: true,
        reason: 'System maintenance',
      });

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: false,
        reason: 'Messaging is paused: System maintenance',
      });
      expect(mockMessagePause.isMessagingPaused).toHaveBeenCalledTimes(1);
      expect(mockMessageAudit.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should deny when rate limit is exceeded', async () => {
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockResolvedValue({
        allowed: false,
        count: 15,
        limit: 10,
      });

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: false,
        reason: 'Rate limit exceeded: 15/10',
        rateLimit: {
          allowed: false,
          count: 15,
          limit: 10,
        },
      });
    });

    it('should skip rate limit check when skipRateLimit is true', async () => {
      const optionsWithSkip = {
        ...mockPolicyOptions,
        skipRateLimit: true,
      };
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });

      const result = await service.checkPolicies(optionsWithSkip);

      expect(result).toEqual({
        allowed: true,
      });
      expect(mockMessagePause.isMessagingPaused).toHaveBeenCalledTimes(1);
      expect(mockMessageAudit.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should handle pause check failure gracefully', async () => {
      mockMessagePause.isMessagingPaused.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: true,
        reason: 'Policy check failed, allowing by default',
      });
    });

    it('should handle rate limit check failure gracefully', async () => {
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockRejectedValue(new Error('Database connection failed'));

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: true,
        reason: 'Policy check failed, allowing by default',
      });
    });

    it('should work with missing optional parameters', async () => {
      const minimalOptions = {
        tenantId: 'tenant123',
        userId: 1,
      };
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockResolvedValue({
        allowed: true,
        count: 1,
        limit: 10,
      });

      const result = await service.checkPolicies(minimalOptions);

      expect(result.allowed).toBe(true);
      expect(mockMessageAudit.checkRateLimit).toHaveBeenCalledWith(
        minimalOptions.tenantId,
        minimalOptions.userId,
        undefined,
        undefined,
      );
    });

    it('should handle both pause and rate limit checks when both enabled', async () => {
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockResolvedValue({
        allowed: true,
        count: 5,
        limit: 10,
      });

      const result = await service.checkPolicies(mockPolicyOptions);

      expect(result).toEqual({
        allowed: true,
      });
      expect(mockMessagePause.isMessagingPaused).toHaveBeenCalledTimes(1);
      expect(mockMessageAudit.checkRateLimit).toHaveBeenCalledTimes(1);
    });

    it('should pass correct parameters to rate limit check', async () => {
      const customOptions = {
        tenantId: 'tenant456',
        userId: 999,
        systemReason: 'password_reset',
      };
      mockMessagePause.isMessagingPaused.mockResolvedValue({
        paused: false,
      });
      mockMessageAudit.checkRateLimit.mockResolvedValue({
        allowed: true,
        count: 0,
        limit: 5,
      });

      await service.checkPolicies(customOptions);

      expect(mockMessageAudit.checkRateLimit).toHaveBeenCalledWith(
        'tenant456',
        999,
        undefined,
        undefined,
      );
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have message audit service injected', () => {
      expect(service['auditService']).toBeDefined();
    });

    it('should have message pause service injected', () => {
      expect(service['pauseService']).toBeDefined();
    });
  });
});