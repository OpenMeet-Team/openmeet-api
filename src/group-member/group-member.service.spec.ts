import { Test, TestingModule } from '@nestjs/testing';
import { GroupMemberService } from './group-member.service';
import {
  mockGroup,
  mockGroupMember,
  mockGroupMemberService,
  mockUser,
} from '../test/mocks';
import { GroupPermission, GroupRole } from '../core/constants/constant';

describe('GroupMemberService', () => {
  let service: GroupMemberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
      ],
    }).compile();
    service = module.get<GroupMemberService>(GroupMemberService);
  });

  it('should create group owner', async () => {
    const result = await service.createGroupOwner({
      userId: mockUser.id,
      groupId: mockGroup.id,
    });

    expect(result).toEqual(mockGroupMember);
  });

  it('should find group member by user id', async () => {
    const result = await service.findGroupMemberByUserId(
      mockGroup.id,
      mockUser.id,
    );

    expect(result).toEqual(mockGroupMember);
  });

  it('should update group member role', async () => {
    const result = await service.updateGroupMemberRole(
      mockGroupMember.id,
      {
        name: GroupRole.Owner,
      },
      mockUser.id, // actingUserId
    );

    expect(result).toEqual(mockGroupMember);
  });

  it('should leave group', async () => {
    const result = await service.leaveGroup(mockUser.id, mockGroup.id);

    expect(result).toEqual(mockGroupMember);
  });

  it('should remove group member', async () => {
    const result = await service.removeGroupMember(mockGroup.id, mockUser.id);

    expect(result).toEqual(mockGroupMember);
  });

  it('should find group details members', async () => {
    const result = await service.findGroupDetailsMembers(mockGroup.id, 5);

    expect(result).toEqual([mockGroupMember]);
  });

  it('should approve member', async () => {
    const result = await service.approveMember(mockGroupMember.id);

    expect(result).toEqual(mockGroupMember);
  });

  it('should reject member', async () => {
    const result = await service.rejectMember(mockGroupMember.id);

    expect(result).toEqual(mockGroupMember);
  });

  describe('createGroupMember', () => {
    it('should create group member with default role', async () => {
      const result = await service.createGroupMember({
        userId: mockUser.id,
        groupId: mockGroup.id,
      });

      expect(result).toEqual(mockGroupMember);
      // expect(result.groupRole?.name).toEqual(GroupRole.Guest);
    });
  });

  describe('getGroupMembersCount', () => {
    it('should get group members count', async () => {
      const result = await service.getGroupMembersCount(mockGroup.id);
      expect(result).toBe(1);
    });
  });

  describe('getMailServiceGroupMembersByPermission', () => {
    it('should get group members by permission', async () => {
      const result = await service.getMailServiceGroupMembersByPermission(
        mockGroup.id,
        GroupPermission.ManageMembers,
      );
      expect(result).toEqual([mockGroupMember]);
    });
  });
});
