import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingService } from './billing.service';
import { UsageService } from '../usage/usage.service';
import { UserSubscription } from './entities/user-subscription.entity';

describe('BillingService', () => {
  let service: BillingService;
  let mockUserSubscriptionRepo: Partial<Repository<UserSubscription>>;
  let mockUsageService: Partial<UsageService>;

  beforeEach(async () => {
    mockUserSubscriptionRepo = {
      findOne: jest.fn(),
    } as Partial<Repository<UserSubscription>>;

    mockUsageService = {
      getUsage: jest.fn(),
    } as Partial<UsageService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: mockUserSubscriptionRepo,
        },
        {
          provide: UsageService,
          useValue: mockUsageService,
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
