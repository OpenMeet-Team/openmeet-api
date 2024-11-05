import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventService } from '../event/event.service';
import { REQUEST } from '@nestjs/core';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import {
  mockCategory,
  mockCategoryService,
  mockEventService,
  mockFile,
  mockFilesS3PresignedService,
  mockGroup,
  mockGroupMember,
  mockGroupMemberService,
  mockGroupsQuery,
  mockGroupUserPermission,
  mockPagination,
  mockRepository,
  mockTenantConnectionService,
} from '../test/mocks';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { mockUser } from '../test/mocks';
import { DeleteResult, Repository } from 'typeorm';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { Repository } from 'typeorm';

describe('GroupService', () => {
  let service: GroupService;
  let eventService: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CategoryService,
          useValue: mockCategoryService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: EventService,
          useValue: mockEventService,
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
      ],
    }).compile();

    service = await module.resolve<GroupService>(GroupService);
    eventService = module.get<EventService>(EventService);

    await service.getTenantSpecificGroupRepository();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGroupsWhereUserCanCreateEvents', () => {
    it('should return groups where user can create events', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getGroupsWhereUserCanCreateEvents(
        mockUser.id,
      );
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('getGroupMembers', () => {
    it('should return group members', async () => {
      jest
        .spyOn(service['groupMembersRepository'], 'find')
        .mockResolvedValue([mockGroupMember]);
      const result = await service.getGroupMembers(mockUser.id, mockGroup.id);
      expect(result).toEqual([mockGroupMember]);
    });
  });

  describe.skip('getGroupMemberPermissions', () => {
    it('should return group member permissions', async () => {
      jest
        .spyOn(service['groupMemberPermissionsRepository'], 'find')
        .mockResolvedValue([mockGroupUserPermission]);
      const result = await service.getGroupMemberPermissions(
        mockUser.id,
        mockGroup.id,
      );
      expect(result).toEqual([mockGroupUserPermission]);
    });
  });

  describe('showGroup', () => {
    it('should return group with details', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.showGroup(mockGroup.id, mockUser.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('getGroupsByCreator', () => {
    it('should return groups by creator', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getGroupsByCreator(mockUser.id);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('getGroupsByMember', () => {
    it('should return groups by member', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getGroupsByMember(mockUser.id);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('create', () => {
    it('should create a group', async () => {
      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.create(
        {
          ...mockGroup,
          categories: [mockCategory.id],
          image: mockFile,
        },
        mockUser.id,
      );
      
  describe.skip('getGroupMembers', () => {
    it('should return group members', async () => {
      const result = await service.getGroupMembers(mockUser.id, mockGroup.id);
      expect(result).toEqual([mockGroupMember]);
    });
  });

  describe.skip('getGroupMemberPermissions', () => {
    it('should return group member permissions', async () => {
      const result = await service.getGroupMemberPermissions(
        mockUser.id,
        mockGroup.id,
      );
      expect(result).toEqual([mockGroupMember]);
    });
  });

  describe.skip('showGroup', () => {
    it('should return group with details', async () => {
      const result = await service.showGroup(mockGroup.id, mockUser.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe.skip('getGroupsByCreator', () => {
    it('should return groups by creator', async () => {
      const result = await service.getGroupsByCreator(mockUser.id);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe.skip('getGroupsByMember', () => {
    it('should return groups by member', async () => {
      const result = await service.getGroupsByMember(mockUser.id);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe.skip('create', () => {
    it('should create a group', async () => {
      const result = await service.create(
        {
          ...mockGroup,
          categories: [mockCategory.id],
          image: mockFile,
        },
        mockUser.id,
      );
      expect(result).toEqual(mockGroup);
    });
  });

  describe.skip('findAll', () => {
    it('should return all groups', async () => {
      const result = await service.findAll(mockPagination, mockGroupsQuery);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe.skip('editGroup', () => {
    it('should edit a group', async () => {
      const result = await service.editGroup(mockGroup.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe.skip('findAll', () => {
    it('should return all groups', async () => {
      // Mock the expected paginated response
      const expectedResult = {
        data: [mockGroup],
        page: 1,
        total: 1,
        totalPages: 1,
      };

      // jest
      //   .spyOn(service['groupRepository'], 'findAndCount')
      //   .mockResolvedValue([[mockGroup as GroupEntity], 1]);

      const result = await service.findAll(mockPagination, mockGroupsQuery);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('editGroup', () => {
    it('should edit a group', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.editGroup(mockGroup.id);

  describe.skip('findOne', () => {
    it('should return a group', async () => {
      const result = await service.findOne(mockGroup.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe.skip('update', () => {
    it('should update a group', async () => {
      const result = await service.update(mockGroup.id, {
        ...mockGroup,
        categories: [mockCategory.id],
        image: mockFile,
      });
      expect(result).toEqual(mockGroup);
    });
  });

  describe('findOne', () => {
    it('should return a group', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.findOne(mockGroup.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('update', () => {
    it('should update a group', async () => {
      service['groupRepository'].merge = (
        target: GroupEntity,
        source: Partial<GroupEntity>,
      ) => {
        return Object.assign(target, source);
      };
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service['categoryService'], 'findOne')
        .mockResolvedValue(mockCategory as CategoryEntity);
      jest
        .spyOn(service['groupRepository'], 'merge')
        .mockImplementation(() => mockGroup as GroupEntity);
      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.update(mockGroup.id, {
        ...mockGroup,
        categories: [mockCategory.id],
        image: mockFile,
      });
      expect(result).toEqual(mockGroup);
    });
  });

  describe('remove', () => {
    it('should remove a group', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service['groupRepository'], 'remove')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service['groupMembersRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['eventService'], 'deleteEventsByGroup')
        .mockResolvedValue(undefined);

      const result = await service.remove(mockGroup.id);
      expect(result).toEqual(undefined);
    });
  });

  describe.skip('getHomePageFeaturedGroups', () => {
    it('should return featured groups', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getHomePageFeaturedGroups();
      
  describe.skip('remove', () => {
    it('should remove a group', async () => {
      const result = await service.remove(mockGroup.id);
      expect(result).toEqual(undefined);
    });
  });

  describe.skip('getHomePageFeaturedGroups', () => {
    it('should return featured groups', async () => {
      const result = await service.getHomePageFeaturedGroups();
      expect(result).toEqual([mockGroup]);
    });
  });


  describe('getHomePageUserCreatedGroups', () => {
    it('should return user created groups', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getHomePageUserCreatedGroups(mockUser.id);

      
  describe.skip('getHomePageUserParticipatedGroups', () => {
    it('should return user participated groups', async () => {
      const result = await service.getHomePageUserParticipatedGroups(
        mockUser.id,
      );
      expect(result).toEqual([mockGroup]);
    });
  });

  describe.skip('getHomePageUserParticipatedGroups', () => {
    it('should return user participated groups', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockGroup]),
        innerJoin: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue([mockGroup]),
      };
      jest
        .spyOn(service['groupRepository'], 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      const result = await service.getHomePageUserParticipatedGroups(
        mockUser.id,
      );
      expect(result).toEqual([mockGroup]);
    });
  });

  describe.skip('getTenantSpecificGroupRepository', () => {
    it('should get the tenant specific group repository', async () => {
      await service.getTenantSpecificGroupRepository();
      expect(service['groupRepository']).toBeDefined();
    });
  });

  describe.skip('getTenantSpecificGroupRepository', () => {
    it('should get the tenant specific group repository', async () => {
      await service.getTenantSpecificGroupRepository();
      expect(service['groupRepository']).toBeDefined();
    });
  });
        // TODO refactor this to use mocks
  describe('getRecommendedEvents', () => {
    it('should return recommended events if enough are found', async () => {
      const minEvents = 3;
      const maxEvents = 5;
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockEvents = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ];

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockEvents as any);

      const result = await service.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual(mockEvents);
      expect(eventService.findRecommendedEventsForGroup).toHaveBeenCalledWith(
        1,
        [1, 2],
        minEvents,
        maxEvents,
      );
      expect(eventService.findRandomEventsForGroup).not.toHaveBeenCalled();
    });

    it('should fetch additional random events if not enough recommended events are found', async () => {
      const minEvents = 3;
      const maxEvents = 5;
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockRecommendedEvents = [{ id: 1 }, { id: 2 }];
      const mockRandomEvents = [{ id: 3 }, { id: 4 }, { id: 5 }];

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockRecommendedEvents as any);
      jest
        .spyOn(eventService, 'findRandomEventsForGroup')
        .mockResolvedValue(mockRandomEvents as any);

      const result = await service.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([...mockRecommendedEvents, ...mockRandomEvents]);
      expect(eventService.findRecommendedEventsForGroup).toHaveBeenCalledWith(
        1,
        [1, 2],
        minEvents,
        maxEvents,
      );
      expect(eventService.findRandomEventsForGroup).toHaveBeenCalledWith(
        1,
        minEvents,
        maxEvents - mockRecommendedEvents.length,
      );
    });

    it.skip('should deduplicate events', async () => {
      const minEvents = 3;
      const maxEvents = 5;

      const result = await service.getRecommendedEvents(
        mockGroup.id,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });
  });
});
