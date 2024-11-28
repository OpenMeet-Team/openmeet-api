import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { GroupService } from '../group/group.service';
import { EventService } from '../event/event.service';
import {
  mockCategory,
  mockCategoryService,
  mockConfigService,
  mockEvent,
  mockEventService,
  mockGroup,
  mockGroupService,
  mockHomeQuery,
  mockPagination,
  mockSubCategory,
  mockSubCategoryService,
  mockTenantConnectionService,
  mockUser,
} from '../test/mocks';
import { CategoryService } from '../category/category.service';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';

describe('HomeService', () => {
  let service: HomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: GroupService, useValue: mockGroupService },
        { provide: EventService, useValue: mockEventService },
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: SubCategoryService, useValue: mockSubCategoryService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('should return user home state', async () => {
    const result = await service.getUserHomeState(mockUser);

    expect(result).toEqual({
      organizedGroups: [mockGroup],
      nextHostedEvent: mockEvent,
      recentEventDrafts: [mockEvent],
      upcomingEvents: [mockEvent],
      memberGroups: [mockGroup],
      interests: [mockSubCategory],
    });
  });

  it('should return guest home state', async () => {
    const result = await service.getGuestHomeState();

    expect(result).toEqual({
      groups: [mockGroup],
      events: [mockEvent],
      categories: [mockCategory],
      interests: [mockSubCategory],
    });
  });

  it('should return a list of events and groups based on search query', async () => {
    const result = await service.globalSearch(mockPagination, mockHomeQuery);

    expect(result).toBeDefined();

    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('groups');
  });
});
