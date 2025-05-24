import { Test, TestingModule } from '@nestjs/testing';
import { MessageAuditService } from './message-audit.service';
import { Repository } from 'typeorm';
import { MessageAuditEntity } from '../entities/message-audit.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';

describe('MessageAuditService', () => {
  let service: MessageAuditService;
  let mockRepository: Partial<Repository<MessageAuditEntity>>;
  let mockTenantService: Partial<TenantConnectionService>;
  let mockRequest: any;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    mockTenantService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
      }),
      getTenantConfig: jest.fn().mockReturnValue({
        messagingRateLimit: 1,
      }),
    };

    mockRequest = {
      tenantId: 'tenant-1',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageAuditService,
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
      ],
    }).compile();

    service = module.get<MessageAuditService>(MessageAuditService);
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should log an action', async () => {
      const mockAuditEntry = {
        tenantId: 'tenant-1',
        userId: 1,
        action: 'message_sent',
        groupId: 1,
        eventId: undefined,
        messageId: 123,
        details: { recipientCount: 5 },
      };

      mockRepository.create = jest.fn().mockReturnValue(mockAuditEntry);
      mockRepository.save = jest.fn().mockResolvedValue(mockAuditEntry);

      await service.logAction('tenant-1', 1, 'message_sent', {
        groupId: 1,
        messageId: 123,
        additionalData: { recipientCount: 5 },
      });

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 1,
        action: 'message_sent',
        groupId: 1,
        eventId: undefined,
        messageId: 123,
        details: { recipientCount: 5 },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockAuditEntry);
    });

    it('should handle actions without additional details', async () => {
      await service.logAction('tenant-1', 1, 'draft_created');

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 1,
        action: 'draft_created',
        groupId: undefined,
        eventId: undefined,
        messageId: undefined,
        details: undefined,
      });
    });
  });

  describe('checkRateLimit', () => {
    it('should allow sending when under rate limit', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      (queryBuilder.getCount as jest.Mock).mockResolvedValue(0);

      const result = await service.checkRateLimit('tenant-1', 1);

      expect(result).toEqual({
        allowed: true,
        count: 0,
        limit: 1,
      });
    });

    it('should deny sending when at rate limit', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      (queryBuilder.getCount as jest.Mock).mockResolvedValue(1);

      const result = await service.checkRateLimit('tenant-1', 1);

      expect(result).toEqual({
        allowed: false,
        count: 1,
        limit: 1,
      });
    });

    it('should filter by groupId when provided', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.checkRateLimit('tenant-1', 1, 10);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.groupId = :groupId',
        { groupId: 10 },
      );
    });

    it('should filter by eventId when provided', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.checkRateLimit('tenant-1', 1, undefined, 20);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.eventId = :eventId',
        { eventId: 20 },
      );
    });

    it('should use custom rate limit from tenant config', async () => {
      mockTenantService.getTenantConfig = jest.fn().mockReturnValue({
        messagingRateLimit: 5,
      });

      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      (queryBuilder.getCount as jest.Mock).mockResolvedValue(4);

      const result = await service.checkRateLimit('tenant-1', 1);

      expect(result).toEqual({
        allowed: true,
        count: 4,
        limit: 5,
      });
    });
  });

  describe('getAuditLog', () => {
    const mockAuditEntries = [
      {
        id: 1,
        tenantId: 'tenant-1',
        userId: 1,
        action: 'message_sent',
        createdAt: new Date(),
      },
      {
        id: 2,
        tenantId: 'tenant-1',
        userId: 2,
        action: 'draft_created',
        createdAt: new Date(),
      },
    ];

    it('should return paginated audit log', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      (queryBuilder.getManyAndCount as jest.Mock).mockResolvedValue([
        mockAuditEntries,
        2,
      ]);

      const result = await service.getAuditLog('tenant-1', {}, 1, 50);

      expect(result).toEqual({
        data: mockAuditEntries,
        total: 2,
      });

      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(50);
    });

    it('should filter by userId', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.getAuditLog('tenant-1', { userId: 1 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.userId = :userId',
        { userId: 1 },
      );
    });

    it('should filter by action', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.getAuditLog('tenant-1', { action: 'message_sent' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.action = :action',
        { action: 'message_sent' },
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.getAuditLog('tenant-1', { startDate, endDate });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.createdAt >= :startDate',
        { startDate },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.createdAt <= :endDate',
        { endDate },
      );
    });

    it('should handle pagination correctly', async () => {
      const queryBuilder = (mockRepository.createQueryBuilder as jest.Mock)();
      await service.getAuditLog('tenant-1', {}, 3, 20);

      expect(queryBuilder.skip).toHaveBeenCalledWith(40); // (page - 1) * limit
      expect(queryBuilder.take).toHaveBeenCalledWith(20);
    });
  });
});
