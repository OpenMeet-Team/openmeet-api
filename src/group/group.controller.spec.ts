import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import {
  mockGroup,
  mockGroupMembers,
  mockUser,
  mockEvents,
  mockGroupService,
  mockGroupMemberService,
  mockGroupMember,
  mockEventService,
  mockRepository,
} from '../test/mocks';
import { GroupMemberService } from '../group-member/group-member.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { EventService } from '../event/event.service';
import { Repository } from 'typeorm';

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
          provide: EventService,
          useValue: mockEventService,
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
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
      const result = await controller.editGroup(1);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('showGroup', () => {
    it('should show a group', async () => {
      const result = await controller.showGroup(1);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('updateGroup', () => {
    it('should update a group', async () => {
      const result = await controller.updateGroup(1, {
        ...mockGroup,
        image: undefined,
        categories: [],
      } as UpdateGroupDto);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('removeGroup', () => {
    it('should remove a group', async () => {
      const result = await controller.removeGroup(mockGroup.id);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('showGroupEvents', () => {
    it('should show group events', async () => {
      const result = await controller.showGroupEvents(1);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('showGroupMembers', () => {
    it('should show group members', async () => {
      const result = await controller.showGroupMembers(1);
      expect(result).toEqual(mockGroupMembers);
    });
  });

  describe('joinGroup', () => {
    it('should join a group', async () => {
      const result = await controller.joinGroup(mockUser, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('leaveGroup', () => {
    it('should leave a group', async () => {
      const result = await controller.leaveGroup(mockUser, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('removeGroupMember', () => {
    it('should remove a group member', async () => {
      const result = await controller.removeGroupMember(1, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('updateGroupMemberRole', () => {
    it('should update a group member role', async () => {
      const result = await controller.updateGroupMemberRole(1, 1, {
        name: 'admin',
      } as UpdateGroupMemberRoleDto);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('approveMember', () => {
    it('should approve a group member', async () => {
      const result = await controller.approveMember(1, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('rejectMember', () => {
    it('should reject a group member', async () => {
      const result = await controller.rejectMember(1, 1);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('showGroupsWhereUserCanCreateEvents', () => {
    it('should return groups where user can create events', async () => {
      const result =
        await controller.showGroupsWhereUserCanCreateEvents(mockUser);
      expect(
        groupService.getGroupsWhereUserCanCreateEvents,
      ).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([mockGroup]);
    });
  });

  // TODO refactor this to use mocks
  describe('getRecommendedEvents', () => {
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
        .spyOn(groupService, 'getRecommendedEvents')
        .mockResolvedValue(mockEvents as EventEntity[]);

      const result = await controller.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result.length).toBeGreaterThanOrEqual(minEvents);
      expect(result.length).toBeLessThanOrEqual(maxEvents);
    });

    it('should return empty array when limits are not valid', async () => {
      jest.spyOn(groupService, 'getRecommendedEvents').mockResolvedValue([]);

      const result = await controller.getRecommendedEvents(1, -1, 5);
      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when group is not found', async () => {
      const eventId = 99999999;
      jest
        .spyOn(groupService, 'getRecommendedEvents')
        .mockRejectedValue(new Error('Not Found'));

      await expect(controller.getRecommendedEvents(eventId)).rejects.toThrow(
        HttpException,
      );
      await expect(
        controller.getRecommendedEvents(eventId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
