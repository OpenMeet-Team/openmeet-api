import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { CategoryService } from '../category/category.service';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: TenantConnectionService,
          useValue: {
            // Add mock methods here if needed
          },
        },
        {
          provide: EventService,
          useValue: {
            // Add mock methods here if needed
          },
        },
        {
          provide: GroupService,
          useValue: {
            // Add mock methods here if needed
          },
        },
        {
          provide: CategoryService,
          useValue: {
            // Add mock methods here if needed
          },
        },
      ],
    }).compile();

    service = await module.resolve<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
