import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from '../group/group.controller';
import { GroupService } from '../group/group.service';
import { GroupDIDFollowService } from './group-did-follow.service';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { User } from '../user/domain/user';
import {
  mockGroup,
  mockUser,
  mockGroupService,
  mockGroupMemberService,
  mockGroupMemberQueryService,
  mockRepository,
  mockEventAttendeeService,
  mockGroupMailService,
  mockEventQueryService,
} from '../test/mocks';
import { GroupMemberService } from '../group-member/group-member.service';
import { GroupMemberQueryService } from '../group-member/group-member-query.service';
import { Repository } from 'typeorm';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupMailService } from '../group-mail/group-mail.service';
import { GroupDIDFollowResponseDto } from './dto/group-did-follow-response.dto';

describe('GroupController - DID Follow endpoints', () => {
  let controller: GroupController;
  let groupDidFollowService: GroupDIDFollowService;

  const mockFollowResponse: GroupDIDFollowResponseDto = {
    id: 1,
    did: 'did:plc:abc123',
    createdAt: new Date('2026-01-01'),
    createdById: 42,
  };

  const mockGroupDIDFollowService = {
    addFollow: jest.fn().mockResolvedValue(mockFollowResponse),
    listFollows: jest.fn().mockResolvedValue([mockFollowResponse]),
    removeFollow: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        { provide: GroupService, useValue: mockGroupService },
        { provide: GroupDIDFollowService, useValue: mockGroupDIDFollowService },
        { provide: GroupMemberService, useValue: mockGroupMemberService },
        {
          provide: GroupMemberQueryService,
          useValue: mockGroupMemberQueryService,
        },
        { provide: Repository, useValue: mockRepository },
        {
          provide: AuthService,
          useValue: {
            getUserPermissions: jest
              .fn()
              .mockResolvedValue(['READ_PERMISSION']),
          },
        },
        { provide: EventAttendeeService, useValue: mockEventAttendeeService },
        { provide: EventQueryService, useValue: mockEventQueryService },
        { provide: GroupMailService, useValue: mockGroupMailService },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'permissions') return ['READ_PERMISSION'];
              return null;
            }),
          },
        },
        PermissionsGuard,
        VisibilityGuard,
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
    groupDidFollowService = module.get<GroupDIDFollowService>(
      GroupDIDFollowService,
    );
  });

  describe('createDidFollow', () => {
    it('should create a DID follow', async () => {
      const result = await controller.createDidFollow(
        mockGroup.slug,
        { did: 'did:plc:abc123' },
        mockUser as User,
      );

      expect(result).toEqual(mockFollowResponse);
      expect(groupDidFollowService.addFollow).toHaveBeenCalledWith(
        mockGroup.slug,
        { did: 'did:plc:abc123' },
        mockUser.id,
      );
    });
  });

  describe('listDidFollows', () => {
    it('should list DID follows for a group', async () => {
      const result = await controller.listDidFollows(
        mockGroup.slug,
        mockUser as User,
      );

      expect(result).toEqual([mockFollowResponse]);
      expect(groupDidFollowService.listFollows).toHaveBeenCalledWith(
        mockGroup.slug,
        mockUser.id,
      );
    });
  });

  describe('removeDidFollow', () => {
    it('should remove a DID follow', async () => {
      const result = await controller.removeDidFollow(
        mockGroup.slug,
        'did:plc:abc123',
        mockUser as User,
      );

      expect(result).toBeUndefined();
      expect(groupDidFollowService.removeFollow).toHaveBeenCalledWith(
        mockGroup.slug,
        'did:plc:abc123',
        mockUser.id,
      );
    });
  });
});
