import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { CategoryService } from '../category/category.service';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const mockRequest = { tenantId: TESTING_TENANT_ID };
    const mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue({}),
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: EventService,
          useValue: {},
        },
        {
          provide: GroupService,
          useValue: {},
        },
        {
          provide: CategoryService,
          useValue: {},
        },
        {
          provide: GroupMemberService,
          useValue: {},
        },
        {
          provide: EventAttendeeService,
          useValue: {},
        },
      ],
    })
      .overrideProvider('REQUEST')
      .useValue(mockRequest)
      .compile();

    service = await module.resolve<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTenantSpecificRepositories', () => {
    it('should get the tenant specific repositories', async () => {
      await service.getTenantSpecificRepositories();
      expect(service['eventRepository']).toBeDefined();
      expect(service['groupRepository']).toBeDefined();
    });

    it('should throw an error if the tenant specific repositories are not found', async () => {
      const mockTenantConnectionService = service['tenantConnectionService'];
      jest
        .spyOn(mockTenantConnectionService, 'getTenantConnection')
        .mockRejectedValue(new Error('Tenant specific repositories not found'));
      await expect(service.getTenantSpecificRepositories()).rejects.toThrow();
    });
  });
});
