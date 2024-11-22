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
  mockDiscussions,
  mockEvent,
  mockEventService,
  mockFile,
  mockFilesS3PresignedService,
  mockGroup,
  mockGroupAboutResponse,
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
  mockZulipMessage,
  mockZulipService,
} from '../test/mocks';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { mockUser } from '../test/mocks';
import { DeleteResult, Repository } from 'typeorm';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailService } from '../mail/mail.service';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from '../user/user.service';

describe('GroupService', () => {
  let service: GroupService;

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
        {
          provide: GroupRoleService,
          useValue: mockGroupRoleService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: ZulipService,
          useValue: mockZulipService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = await module.resolve<GroupService>(GroupService);

    await service.getTenantSpecificGroupRepository();
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
      jest
        .spyOn(service['groupRepository'], 'findOneBy')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service['groupRepository'], 'save')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(service['groupRepository'], 'find')
        .mockResolvedValue(mockGroups);
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
        .spyOn(service['eventService'], 'deleteEventsByGroup')
        .mockResolvedValue(undefined);

      const result = await service.remove(mockGroup.slug);
      expect(result).toEqual(undefined);
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
        .spyOn(service['groupRepository'], 'findOneBy')
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
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe.skip('showGroupDiscussions', () => {
    it('should return group discussions', async () => {
      const result = await service.showGroupDiscussions(mockGroup.slug);
      expect(result).toEqual(mockDiscussions);
    });
  });

  describe.skip('showGroupAbout', () => {
    it('should return group about', async () => {
      const result = await service.showGroupAbout(mockGroup.slug);
      expect(result).toEqual(mockGroupAboutResponse);
    });
  });

  describe.skip('sendGroupDiscussionMessage', () => {
    it('should send a group discussion message', async () => {
      const result = await service.sendGroupDiscussionMessage(
        mockGroup.slug,
        mockUser.id,
        { message: 'test', topicName: 'test' },
      );
      expect(result).toEqual(mockZulipMessage);
    });
  });

  describe.skip('updateGroupDiscussionMessage', () => {
    it('should update a group discussion message', async () => {
      const result = await service.updateGroupDiscussionMessage(
        mockZulipMessage.id,
        'test',
        mockUser.id,
      );
      expect(result).toEqual(mockZulipMessage);
    });
  });

  describe.skip('deleteGroupDiscussionMessage', () => {
    it('should delete a group discussion message', async () => {
      const result = await service.deleteGroupDiscussionMessage(
        mockZulipMessage.id,
      );
      expect(result).toEqual(mockZulipMessage);
    });
  });
});
