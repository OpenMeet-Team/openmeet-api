import { Test, TestingModule } from '@nestjs/testing';
import { CategoryEntity } from '../../src/category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEntity } from '../../src/event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../src/group/infrastructure/persistence/relational/entities/group.entity';
import { HomeController } from '../../src/home/home.controller';
import { HomeService } from '../../src/home/home.service';
import { SubCategoryEntity } from '../../src/sub-category/infrastructure/persistence/relational/entities/sub-category.entity';
import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('HomeController', () => {
  let controller: HomeController;
  let homeService: HomeService;

  const mockHomeService = {
    getGuestHomeState: jest.fn(),
    getUserHomeState: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [
        {
          provide: HomeService,
          useValue: mockHomeService,
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
      const authToken = await getAuthToken(
        APP_URL,
        TESTER_EMAIL,
        TESTER_PASSWORD,
      );

      return await request
        .agent(APP_URL)
        .set('tenant-id', '1')
        .set('Authorization', `Bearer ${authToken}`)
        .get(`/api/home/user`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(
            expect.objectContaining({
              organizedGroups: expect.any(Array),
              nextHostedEvent: expect.any(Object),
              recentEventDrafts: expect.any(Array),
              upcomingEvents: expect.any(Array),
              memberGroups: expect.any(Array),
              interests: expect.any(Array),
            }),
          );
        });
    });
  });
});
