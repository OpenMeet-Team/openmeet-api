import { Test, TestingModule } from '@nestjs/testing';
import { MessageLoggerService } from './message-logger.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { Repository } from 'typeorm';
import { MessageLogEntity } from '../entities/message-log.entity';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

describe('MessageLoggerService', () => {
  let service: MessageLoggerService;
  let mockTenantConnection: jest.Mocked<TenantConnectionService>;
  let mockMessageLogRepository: jest.Mocked<Repository<MessageLogEntity>>;

  beforeEach(async () => {
    mockMessageLogRepository = {
      create: jest.fn(),
      save: jest.fn(),
    } as any;

    mockTenantConnection = {
      getTenantConnection: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageLoggerService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnection,
        },
      ],
    }).compile();

    service = module.get<MessageLoggerService>(MessageLoggerService);
    jest.clearAllMocks();
  });

  describe('logEmail', () => {
    const mockLogOptions = {
      tenantId: 'tenant123',
      messageId: 1,
      recipientUserId: 4,
      status: 'sent' as const,
      externalId: 'ext_123',
      error: undefined,
      channel: MessageChannel.EMAIL,
    };

    beforeEach(() => {
      mockTenantConnection.getTenantConnection.mockReturnValue({
        getRepository: jest.fn().mockReturnValue(mockMessageLogRepository),
      } as any);
    });

    it('should log email successfully', async () => {
      const mockMessageLog = { id: 1, ...mockLogOptions };
      mockMessageLogRepository.create.mockReturnValue(mockMessageLog as any);
      mockMessageLogRepository.save.mockResolvedValue(mockMessageLog as any);

      const result = await service.logEmail(mockLogOptions);

      expect(mockTenantConnection.getTenantConnection).toHaveBeenCalledWith(mockLogOptions.tenantId);
      expect(mockMessageLogRepository.create).toHaveBeenCalledWith({
        tenantId: mockLogOptions.tenantId,
        messageId: mockLogOptions.messageId,
        recipientUserId: mockLogOptions.recipientUserId,
        channel: mockLogOptions.channel,
        status: mockLogOptions.status,
        externalId: mockLogOptions.externalId,
        error: mockLogOptions.error,
        metadata: {
          isSystemMessage: !mockLogOptions.messageId,
        },
      });
      expect(mockMessageLogRepository.save).toHaveBeenCalledWith(mockMessageLog);
      expect(result).toBe(true);
    });

    it('should log email with minimal options', async () => {
      const minimalOptions = {
        tenantId: 'tenant123',
        recipientUserId: 4,
        status: 'sent' as const,
        channel: MessageChannel.EMAIL,
      };
      const mockMessageLog = { id: 1, ...minimalOptions };
      mockMessageLogRepository.create.mockReturnValue(mockMessageLog as any);
      mockMessageLogRepository.save.mockResolvedValue(mockMessageLog as any);

      const result = await service.logEmail(minimalOptions);

      expect(mockMessageLogRepository.create).toHaveBeenCalledWith({
        tenantId: minimalOptions.tenantId,
        messageId: undefined,
        recipientUserId: minimalOptions.recipientUserId,
        channel: minimalOptions.channel,
        status: minimalOptions.status,
        externalId: expect.any(String),
        error: undefined,
        metadata: {
          isSystemMessage: true,
        },
      });
      expect(result).toBe(true);
    });

    it('should handle tenant connection failure gracefully', async () => {
      mockTenantConnection.getTenantConnection.mockImplementation(() => {
        throw new Error('Tenant not found');
      });

      const result = await service.logEmail(mockLogOptions);

      expect(result).toBe(false);
    });

    it('should handle repository save failure gracefully', async () => {
      const mockMessageLog = { id: 1, ...mockLogOptions };
      mockMessageLogRepository.create.mockReturnValue(mockMessageLog as any);
      mockMessageLogRepository.save.mockRejectedValue(new Error('Database error'));

      const result = await service.logEmail(mockLogOptions);

      expect(result).toBe(false);
    });

    it('should handle repository not found gracefully', async () => {
      mockTenantConnection.getTenantConnection.mockReturnValue({
        getRepository: jest.fn().mockImplementation(() => {
          throw new Error('Repository not found');
        }),
      } as any);

      const result = await service.logEmail(mockLogOptions);

      expect(result).toBe(false);
    });
  });

  describe('logSystemEmail', () => {
    const mockSystemLogOptions = {
      tenantId: 'tenant123',
      recipientUserId: 4,
      status: 'sent' as const,
      externalId: 'sys_ext_456',
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'role_updated',
    };

    beforeEach(() => {
      mockTenantConnection.getTenantConnection.mockReturnValue({
        getRepository: jest.fn().mockReturnValue(mockMessageLogRepository),
      } as any);
    });

    it('should log system email successfully', async () => {
      const mockMessageLog = { id: 2, ...mockSystemLogOptions };
      mockMessageLogRepository.create.mockReturnValue(mockMessageLog as any);
      mockMessageLogRepository.save.mockResolvedValue(mockMessageLog as any);

      const result = await service.logSystemEmail(mockSystemLogOptions);

      expect(mockMessageLogRepository.create).toHaveBeenCalledWith({
        tenantId: mockSystemLogOptions.tenantId,
        messageId: undefined,
        recipientUserId: mockSystemLogOptions.recipientUserId,
        channel: MessageChannel.EMAIL,
        status: mockSystemLogOptions.status,
        externalId: mockSystemLogOptions.externalId,
        error: undefined,
        metadata: {
          type: mockSystemLogOptions.type,
          systemReason: mockSystemLogOptions.systemReason,
          isSystemMessage: true,
        },
      });
      expect(result).toBe(true);
    });

    it('should log failed system email with error message', async () => {
      const failedOptions = {
        ...mockSystemLogOptions,
        status: 'failed' as const,
        error: 'SMTP timeout',
      };
      const mockMessageLog = { id: 3, ...failedOptions };
      mockMessageLogRepository.create.mockReturnValue(mockMessageLog as any);
      mockMessageLogRepository.save.mockResolvedValue(mockMessageLog as any);

      const result = await service.logSystemEmail(failedOptions);

      expect(mockMessageLogRepository.create).toHaveBeenCalledWith({
        tenantId: failedOptions.tenantId,
        messageId: undefined,
        recipientUserId: failedOptions.recipientUserId,
        channel: MessageChannel.EMAIL,
        status: failedOptions.status,
        externalId: failedOptions.externalId,
        error: failedOptions.error,
        metadata: {
          type: failedOptions.type,
          systemReason: failedOptions.systemReason,
          isSystemMessage: true,
        },
      });
      expect(result).toBe(true);
    });

    it('should handle system email logging failure gracefully', async () => {
      mockTenantConnection.getTenantConnection.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const result = await service.logSystemEmail(mockSystemLogOptions);

      expect(result).toBe(false);
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have tenant connection service injected', () => {
      expect(service['tenantService']).toBeDefined();
    });
  });
});