import { Test, TestingModule } from '@nestjs/testing';
import { GroupMemberService } from './group-member.service';
import {
  mockGroup,
  mockGroupMember,
  mockGroupMemberService,
  mockUser,
} from '../test/mocks';
import { GroupRole } from '../core/constants/constant';

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

  it('should join group', async () => {
    const result = await service.joinGroup(mockUser.id, mockGroup.id);

    expect(result).toEqual(mockGroupMember);
  });

  it('should update group member role', async () => {
    const result = await service.updateGroupMemberRole(
      mockGroup.id,
      mockUser.id,
      { name: GroupRole.Owner },
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
    const result = await service.findGroupDetailsMembers(mockGroup.id);

    expect(result).toEqual([mockGroupMember]);
  });

  it('should approve member', async () => {
    const result = await service.approveMember(mockGroup.id, mockUser.id);

    expect(result).toEqual(mockGroupMember);
  });

  it('should reject member', async () => {
    const result = await service.rejectMember(mockGroup.id, mockUser.id);

    expect(result).toEqual(mockGroupMember);
  });
});
