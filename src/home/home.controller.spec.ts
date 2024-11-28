import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { SubCategoryEntity } from '../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import { HomeController } from './home.controller';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { AuthService } from '../auth/auth.service';
import {
  mockEvent,
  mockGroup,
  mockHomeQuery,
  mockPagination,
  mockUser,
} from '../test/mocks';

describe('HomeController', () => {
  let controller: HomeController;
  let homeService: HomeService;

  const mockHomeService = {
    getGuestHomeState: jest.fn(),
    getUserHomeState: jest.fn(),
    globalSearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [
        {
          provide: HomeService,
          useValue: mockHomeService,
        },
        {
          provide: AuthService,
          useValue: {
            validateToken: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<HomeController>(HomeController);
    homeService = module.get<HomeService>(HomeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getGuestHomeState', () => {
    it('should return guest home state', async () => {
      const mockGuestHomeState = {
        groups: [] as GroupEntity[],
        events: [] as EventEntity[],
        categories: [] as CategoryEntity[],
        interests: [] as SubCategoryEntity[],
      };

      mockHomeService.getGuestHomeState.mockResolvedValue(mockGuestHomeState);

      const result = await controller.getGuestHomeState();

      expect(result).toEqual(mockGuestHomeState);
      expect(homeService.getGuestHomeState).toHaveBeenCalled();
    });
  });

  describe('getUserHomeState', () => {
    it('should return user home state', async () => {
      const mockUserHomeState = {
        organizedGroups: [] as GroupEntity[],
        nextHostedEvent: {} as EventEntity,
        recentEventDrafts: [] as EventEntity[],
        upcomingEvents: [] as EventEntity[],
        memberGroups: [] as GroupEntity[],
        interests: [] as SubCategoryEntity[],
      };

      mockHomeService.getUserHomeState.mockResolvedValue(mockUserHomeState);

      const result = await controller.getUserHomeState(mockUser);

      expect(result).toEqual(mockUserHomeState);
      expect(homeService.getUserHomeState).toHaveBeenCalled();
    });
  });

  describe('searchEventGroup', () => {
    it('should return events and groups based on search query', async () => {
      const mockSearchResult = {
        events: [mockEvent],
        groups: [mockGroup],
      };

      mockHomeService.globalSearch.mockResolvedValue(mockSearchResult);

      const result = await controller.searchEventGroup(
        mockPagination,
        mockHomeQuery,
      );

      expect(result).toEqual(mockSearchResult);
      expect(homeService.globalSearch).toHaveBeenCalled();
    });
  });
});
