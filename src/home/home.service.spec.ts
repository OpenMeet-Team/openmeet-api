import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { GroupService } from '../group/group.service';
import { EventService } from '../event/event.service';
import {
  mockCategoryService,
  mockConfigService,
  mockEventService,
  mockGroupService,
  mockSubCategoryService,
  mockUser,
} from '../../test/mocks';
import { CategoryService } from '../category/category.service';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { ConfigService } from '@nestjs/config';

describe('HomeService', () => {
  let service: HomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: GroupService, useValue: mockGroupService },
        { provide: EventService, useValue: mockEventService },
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: SubCategoryService, useValue: mockSubCategoryService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HomeService>(HomeService);
  });

  it('should return user home state', async () => {
    const result = await service.getUserHomeState(mockUser);

    expect(result).toEqual({
      organizedGroups: [],
      nextHostedEvent: null,
      recentEventDrafts: [],
      upcomingEvents: [],
      memberGroups: [],
      interests: [],
    });
  });

  it('should return guest home state', async () => {
    const result = await service.getGuestHomeState();

    expect(result).toEqual({
      groups: [],
      events: [],
      categories: [],
      interests: [],
    });
  });
});
