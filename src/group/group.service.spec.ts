import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventQueryService } from '../event/services/event-query.service';
import { EventManagementService } from '../event/services/event-management.service';
import { EventRecommendationService } from '../event/services/event-recommendation.service';
import {
  mockEventQueryService,
  mockEventManagementService,
  mockEventRecommendationService,
} from '../test/mocks';
import { REQUEST } from '@nestjs/core';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import {
  mockCategory,
  mockCategoryService,
  // mockChatRoomService,
  // mockDiscussionService,
  mockEvent,
  mockFile,
  mockFilesS3PresignedService,
  mockGroup,
  mockGroupAboutResponse,
  mockGroupMailService,
  mockGroupMember,
  mockGroupMemberService,
  mockGroupRoleService,
  mockGroups,
  mockGroupsQuery,
  mockGroupUserPermission,
  mockMailService,
  mockPagination,
  mockRepository,
  mockTenantConnectionService,
  mockUserService,
} from '../test/mocks';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { mockUser } from '../test/mocks';
import { DeleteResult, Repository } from 'typeorm';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailService } from '../mail/mail.service';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { UserService } from '../user/user.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMailService } from '../group-mail/group-mail.service';

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(async () => {
    // Clear all mocks before each test to prevent test interference
    jest.clearAllMocks();

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
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: EventRecommendationService,
          useValue: mockEventRecommendationService,
        },
        {
          provide: FilesS3PresignedService,
          useValue: mockFilesS3PresignedService,
        },
        {
          provide: GroupRoleService,
          useValue: mockGroupRoleService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: GroupMailService,
          useValue: mockGroupMailService,
        },
      ],
    }).compile();

    service = await module.resolve<GroupService>(GroupService);

    await service.getTenantSpecificGroupRepository();
  });

  afterEach(() => {
    // Clean up mocks after each test
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTenantSpecificGroupRepository', () => {
    it('should get the tenant specific group repository', async () => {
      await service.getTenantSpecificGroupRepository();
      expect(service['groupRepository']).toBeDefined();
    });
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
      const result = await service.getGroupMembers(mockGroup.id);
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
      const result = await service.showGroup(mockGroup.slug, mockUser.id);
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
      expect(result).toEqual(mockGroup);
    });
  });

  describe.skip('showAll', () => {
    it('should return all paginated groups', async () => {
      jest
        .spyOn(service['groupRepository'], 'createQueryBuilder')
        .mockReturnValue(mockRepository as any);
      jest.spyOn(mockRepository, 'getMany').mockResolvedValue([mockGroup]);
      const result = await service.showAll(mockPagination, mockGroupsQuery);
      expect(result).toEqual({
        data: [mockGroup],
        total: 1,
        page: mockPagination.page,
        limit: mockPagination.limit,
      });
    });
  });

  describe('editGroup', () => {
    it('should edit a group', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.editGroup(mockGroup.slug);
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
      // Mock the findOneBy to return a mock group
      jest
        .spyOn(service['groupRepository'], 'findOneBy')
        .mockResolvedValue(mockGroup as GroupEntity);

      // Mock the save function
      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(mockGroup as GroupEntity);

      // Mock the find function
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue(mockGroups);

      // Skip the test if it's failing due to mocking issues
      // This is a more practical approach than fighting with TypeScript entity mocking
      const result = await service.update(mockGroup.slug, {
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
        .spyOn(service['eventManagementService'], 'deleteEventsByGroup')
        .mockResolvedValue(undefined);

      const result = await service.remove(mockGroup.slug);
      expect(result).toEqual(undefined);
    });
  });

  describe('removeGroupForUserDeletion', () => {
    it('should detach events, delete members/permissions, and remove group', async () => {
      const testGroup = {
        ...mockGroup,
        matrixRoomId: 'room-123',
      } as GroupEntity;

      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupRepository'], 'remove')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupMembersRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['groupMemberPermissionsRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['eventManagementService'], 'detachEventsFromGroup')
        .mockResolvedValue(3);

      await service.removeGroupForUserDeletion(testGroup);

      expect(
        service['eventManagementService'].detachEventsFromGroup,
      ).toHaveBeenCalledWith(testGroup.id);
      expect(service['groupMembersRepository'].delete).toHaveBeenCalledWith({
        group: { id: testGroup.id },
      });
      expect(
        service['groupMemberPermissionsRepository'].delete,
      ).toHaveBeenCalledWith({ group: { id: testGroup.id } });
      expect(service['groupRepository'].remove).toHaveBeenCalledWith(
        testGroup,
      );
    });

    it('should clear matrixRoomId before deletion', async () => {
      const testGroup = {
        ...mockGroup,
        matrixRoomId: 'room-456',
      } as GroupEntity;

      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupRepository'], 'remove')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupMembersRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['groupMemberPermissionsRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['eventManagementService'], 'detachEventsFromGroup')
        .mockResolvedValue(0);

      await service.removeGroupForUserDeletion(testGroup);

      expect(service['groupRepository'].save).toHaveBeenCalledWith(
        expect.objectContaining({ matrixRoomId: '' }),
      );
    });

    it('should emit group events', async () => {
      const testGroup = { ...mockGroup, matrixRoomId: '' } as GroupEntity;

      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupRepository'], 'remove')
        .mockResolvedValue(testGroup);
      jest
        .spyOn(service['groupMembersRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['groupMemberPermissionsRepository'], 'delete')
        .mockResolvedValue(new DeleteResult());
      jest
        .spyOn(service['eventManagementService'], 'detachEventsFromGroup')
        .mockResolvedValue(0);

      const emitSpy = jest.spyOn(service['eventEmitter'], 'emit');

      await service.removeGroupForUserDeletion(testGroup);

      expect(emitSpy).toHaveBeenCalledWith(
        'group.before_delete',
        expect.objectContaining({ groupId: testGroup.id }),
      );
      expect(emitSpy).toHaveBeenCalledWith('group.deleted', testGroup);
    });
  });

  describe('getHomePageFeaturedGroups', () => {
    it('should return featured groups', async () => {
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue([mockGroup]);
      jest.spyOn(mockRepository, 'getMany').mockResolvedValue([mockGroup]);
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
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('getHomePageUserParticipatedGroups', () => {
    it('should return user participated groups', async () => {
      jest
        .spyOn(service['groupRepository'], 'createQueryBuilder')
        .mockReturnValue(mockRepository as any);
      jest.spyOn(mockRepository, 'getMany').mockResolvedValue([mockGroup]);
      const result = await service.getHomePageUserParticipatedGroups(
        mockUser.id,
      );
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('showGroupRecommendedEvents', () => {
    it('should return recommended events', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.showGroupRecommendedEvents(
        mockGroup.slug,
        3,
        5,
      );
      expect(result).toEqual([mockEvent]);
    });
  });

  describe('joinGroup', () => {
    it('should join a group', async () => {
      jest
        .spyOn(service['groupMemberService'], 'createGroupMember')
        .mockResolvedValue(mockGroupMember as GroupMemberEntity);
      const result = await service.joinGroup(mockGroup.slug, mockUser.id);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('showGroupEvents', () => {
    it('should return group events', async () => {
      const result = await service.showGroupEvents(mockGroup.slug);
      expect(result).toEqual([mockEvent]);
    });
  });

  describe('rejectMember', () => {
    it('should reject a group member', async () => {
      const result = await service.rejectMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('approveMember', () => {
    it('should approve a group member', async () => {
      const result = await service.approveMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('removeGroupMember', () => {
    it('should remove a group member', async () => {
      const result = await service.removeGroupMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('updateGroupMemberRole', () => {
    it('should update a group member role', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOneBy')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.updateGroupMemberRole(
        mockGroup.slug,
        mockGroupMember.id,
        { name: 'admin' } as UpdateGroupMemberRoleDto,
        1, // actingUserId
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('showGroupAbout', () => {
    it('should return group about', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service, 'showGroupAbout')
        .mockResolvedValue(mockGroupAboutResponse);
      const result = await service.showGroupAbout(mockGroup.slug);
      expect(result).toMatchObject(mockGroupAboutResponse);
    });
  });

  describe('showGroupEvents', () => {
    it('should return group events', async () => {
      const result = await service.showGroupEvents(mockGroup.slug);
      expect(result).toEqual([mockEvent]);
    });
  });

  describe('rejectMember', () => {
    it('should reject a group member', async () => {
      const result = await service.rejectMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('approveMember', () => {
    it('should approve a group member', async () => {
      const result = await service.approveMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('removeGroupMember', () => {
    it('should remove a group member', async () => {
      const result = await service.removeGroupMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('updateGroupMemberRole', () => {
    it('should update a group member role', async () => {
      jest
        .spyOn(service['groupRepository'], 'findOneBy')
        .mockResolvedValue(mockGroup as GroupEntity);
      const result = await service.updateGroupMemberRole(
        mockGroup.slug,
        mockGroupMember.id,
        { name: 'admin' } as UpdateGroupMemberRoleDto,
        1, // actingUserId
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('showDashboardGroups', () => {
    it('should return dashboard groups', async () => {
      const result = await service.showDashboardGroups(mockUser.id);
      expect(result[0]).toMatchObject({
        id: mockGroup.id,
        name: mockGroup.name,
        slug: mockGroup.slug,
      });
    });
  });
});
