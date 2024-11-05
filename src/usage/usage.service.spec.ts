import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository, DataSource } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { UsageRecord } from './entities/usage-record.entity';
import { UsageAggregate } from './entities/usage-aggregate.entity';

describe('UsageService', () => {
  let service: UsageService;
  let mockTenantConnectionService: Partial<TenantConnectionService>;
  let mockDataSource: Partial<DataSource>;
  let mockUsageRecordRepo: Partial<Repository<any>>;
  let mockUsageAggregateRepo: Partial<Repository<any>>;

  beforeEach(async () => {
    mockUsageRecordRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      find: jest.fn().mockImplementation(() => Promise.resolve([])),
    } as Partial<Repository<UsageRecord>>;

    mockUsageAggregateRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(null)),
    } as Partial<Repository<UsageAggregate>>;

    mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === UsageRecord) return mockUsageRecordRepo;
        if (entity === UsageAggregate) return mockUsageAggregateRepo;
        return mockUsageRecordRepo; // Default return to avoid null
      }),
    };

    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockDataSource),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<UsageService>(UsageService);
    await service.ensureInitialized();

  });

  describe('trackUsage', () => {
    it('should create a new usage record', async () => {
      const mockRecord = {
        userId: 'user1',
        resourceType: 'image_size',
        quantity: 10000,
      };

      (mockUsageRecordRepo.create as jest.Mock).mockReturnValue(mockRecord);
      (mockUsageRecordRepo.save as jest.Mock).mockResolvedValue(mockRecord);
      (mockUsageAggregateRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.trackUsage('user1', 'image_size', 10000);

      expect(result).toEqual(mockRecord);
    });

    it('should include metadata in the usage record', async () => {
      const metadata = { units: 'ms', description: 'API call duration' };

      await service.trackUsage('user1', 'api_time', 128, metadata);

      expect(mockUsageRecordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining(metadata),
        }),
      );
    });
  });

  describe('getUserResourceUsage', () => {
    it('should return total quantity from usage aggregate', async () => {
      const mockAggregate = {
        totalQuantity: 100,
      };

      (mockUsageAggregateRepo.findOne as jest.Mock).mockResolvedValue(
        mockAggregate,
      );

      const result = await service.getUserResourceUsage('user1', 'api_time');

      expect(result).toBe(100);
    });

    it('should return 0 when no usage found', async () => {
      (mockUsageAggregateRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getUserResourceUsage('user1', 'api_time');

      expect(result).toBe(0);
    });

    it('should use provided billing period', async () => {
      await service.getUserResourceUsage('user1', 'api_time', '2024-03');

      expect(mockUsageAggregateRepo.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          billingPeriod: '2024-03',
        }),
      });
    });
  });

  describe('updateUsageAggregate', () => {
    it('should create new aggregate if none exists', async () => {
      (mockUsageAggregateRepo.findOne as jest.Mock).mockResolvedValue(null);

      await service.trackUsage('user1', 'api_time', 10);

      expect(mockUsageAggregateRepo.create).toHaveBeenCalled();
      expect(mockUsageAggregateRepo.save).toHaveBeenCalled();
    });

    it('should update existing aggregate', async () => {
      const existingAggregate = {
        totalQuantity: 90,
        lastUpdated: new Date(),
      };

      (mockUsageAggregateRepo.findOne as jest.Mock).mockResolvedValue(
        existingAggregate,
      );

      await service.trackUsage('user1', 'api_time', 10);

      expect(mockUsageAggregateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalQuantity: 100,
        }),
      );
    });
  });

  describe('initialization', () => {
    it('should initialize repositories on first method call', async () => {
      await service.getUsage('user1', 'api_time');

      expect(
        mockTenantConnectionService.getTenantConnection,
      ).toHaveBeenCalledWith('test-tenant');
    });

    it('should not reinitialize repositories on subsequent calls', async () => {
      await service.getUsage('user1', 'api_time');
      await service.getUsage('user1', 'api_time');

      expect(
        mockTenantConnectionService.getTenantConnection,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
