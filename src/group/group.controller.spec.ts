import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { User } from '../user/domain/user';
import {
  mockGroup,
  mockGroupMembers,
  mockUser,
  mockEvents,
  mockGroupService,
  mockGroupMemberService,
  mockGroupMemberQueryService,
  mockGroupMember,
  mockRepository,
  mockGroupAboutResponse,
  mockEventAttendeeService,
  mockGroupMailService,
} from '../test/mocks';
import { GroupMemberService } from '../group-member/group-member.service';
import { GroupMemberQueryService } from '../group-member/group-member-query.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { Repository } from 'typeorm';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventQueryService } from '../event/services/event-query.service';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { mockEventQueryService } from '../test/mocks';
import { GroupMailService } from '../group-mail/group-mail.service';

describe('GroupController', () => {
  let controller: GroupController;
  let groupService: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: GroupMemberQueryService,
          useValue: mockGroupMemberQueryService,
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: AuthService,
          useValue: {
            getUserPermissions: jest
              .fn()
              .mockResolvedValue(['READ_PERMISSION']),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: GroupMailService,
          useValue: mockGroupMailService,
        },
        // Mock Reflector
        {
          provide: Reflector,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'permissions') return ['READ_PERMISSION'];
              return null;
            }),
          },
        },
        PermissionsGuard, // Include the PermissionsGuard in providers
        VisibilityGuard, // Include the VisibilityGuard in providers
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
    groupService = module.get<GroupService>(GroupService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a group', async () => {
      const result = await controller.create(
        { ...mockGroup, image: undefined, categories: [] } as CreateGroupDto,
        mockUser,
      );
      expect(result).toEqual(mockGroup);
    });
  });

  describe('editGroup', () => {
    it('should edit a group', async () => {
      const result = await controller.editGroup(mockGroup.slug);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('showGroup', () => {
    it('should show a group', async () => {
      const result = await controller.showGroup(mockGroup.slug);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('updateGroup', () => {
    it('should update a group', async () => {
      const result = await controller.updateGroup(mockGroup.slug, {
        ...mockGroup,
        image: undefined,
        categories: [],
      } as UpdateGroupDto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('showGroupEvents', () => {
    it('should show group events', async () => {
      jest.spyOn(groupService, 'showGroupEvents').mockResolvedValue(mockEvents);
      const result = await controller.showGroupEvents(mockGroup.slug);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('removeGroup', () => {
    it('should remove a group', async () => {
      const result = await controller.removeGroup(mockGroup.slug);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('showGroupEvents', () => {
    it('should show group events', async () => {
      const result = await controller.showGroupEvents(mockGroup.slug);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('showGroupMembers', () => {
    it('should show group members', async () => {
      const result = await controller.showGroupMembers(mockGroup.slug);
      expect(result).toEqual(mockGroupMembers);
    });
  });

  describe('joinGroup', () => {
    it('should join a group', async () => {
      const result = await controller.joinGroup(mockUser, mockGroup.slug);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('leaveGroup', () => {
    it('should leave a group', async () => {
      const result = await controller.leaveGroup(mockUser, mockGroup.slug);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('removeGroupMember', () => {
    it('should remove a group member', async () => {
      const result = await controller.removeGroupMember(
        mockGroup.slug,
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('updateGroupMemberRole', () => {
    it('should update a group member role', async () => {
      const result = await controller.updateGroupMemberRole(
        mockGroup.slug,
        mockGroupMember.id,
        {
          name: 'admin',
        } as UpdateGroupMemberRoleDto,
        mockUser as User,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('approveMember', () => {
    it('should approve a group member', async () => {
      const result = await controller.approveMember(mockGroup.slug, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('rejectMember', () => {
    it('should reject a group member', async () => {
      const result = await controller.rejectMember(mockGroup.slug, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('showGroupsWhereUserCanCreateEvents', () => {
    it('should return groups where user can create events', async () => {
      const result =
        await controller.showGroupsWhereUserCanCreateEvents(mockUser);
      expect(result).toEqual([mockGroup]);
    });
  });

  describe('showGroupRecommendedEvents', () => {
    it('should return 3-5 recommended events', async () => {
      const mockEvents = [
        { id: 1, name: 'Event 1' },
        { id: 2, name: 'Event 2' },
        { id: 3, name: 'Event 3' },
        { id: 4, name: 'Event 4' },
      ];
      const minEvents = 3;
      const maxEvents = 5;
      jest
        .spyOn(groupService, 'showGroupRecommendedEvents')
        .mockResolvedValue(mockEvents as EventEntity[]);

      const result = await controller.showGroupRecommendedEvents(
        mockGroup.slug,
      );

      expect(result.length).toBeGreaterThanOrEqual(minEvents);
      expect(result.length).toBeLessThanOrEqual(maxEvents);
    });
  });

  describe('showGroupAbout', () => {
    it('should return group about', async () => {
      jest
        .spyOn(groupService, 'showGroupAbout')
        .mockResolvedValue(mockGroupAboutResponse);

      const result = await controller.showGroupAbout(mockGroup.slug);
      expect(result).toEqual(mockGroupAboutResponse);
    });
  });

  describe('showDashboardGroups', () => {
    it('should return paginated dashboard groups', async () => {
      const pagination = { page: 1, limit: 10 };
      const query = { role: undefined };
      const result = await controller.showDashboardGroups(
        mockUser,
        pagination,
        query,
      );
      expect(result).toEqual({
        data: [mockGroup],
        total: 1,
        page: 1,
        totalPages: 1,
      });
    });
  });
});
