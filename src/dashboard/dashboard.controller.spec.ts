import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventService } from '../events/events.service';
import { GroupService } from '../groups/groups.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../categories/categories.service';
describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
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

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
