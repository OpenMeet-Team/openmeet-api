import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GroupMailService } from './group-mail.service';
import { MailService } from '../mail/mail.service';
import { UserService } from '../user/user.service';
import { mockGroupMember, mockGroup } from '../test/mocks/group-mocks';
import { GroupMemberService } from '../group-member/group-member.service';
import { mockUser } from '../test/mocks/user-mocks';

describe('GroupMailService', () => {
  let service: GroupMailService;
  let mailService: jest.Mocked<MailService>;
  let groupMemberService: jest.Mocked<GroupMemberService>;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupMailService, // Use real service for TDD
        {
          provide: MailService,
          useValue: {
            groupGuestJoined: jest.fn(),
            groupMemberRoleUpdated: jest.fn(),
            sendAdminGroupMessage: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            getMailServiceGroupMember: jest.fn(),
            getMailServiceGroupMembersByPermission: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GroupMailService>(GroupMailService);
    mailService = module.get(MailService);
    groupMemberService = module.get(GroupMemberService);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendGroupGuestJoined', () => {
    it('should send a group guest joined email', async () => {
      groupMemberService.getMailServiceGroupMember.mockResolvedValue(
        mockGroupMember,
      );
      groupMemberService.getMailServiceGroupMembersByPermission.mockResolvedValue(
        [mockUser],
      );

      await service.sendGroupGuestJoined(mockGroupMember.id);

      expect(groupMemberService.getMailServiceGroupMember).toHaveBeenCalledWith(
        mockGroupMember.id,
      );
      expect(mailService.groupGuestJoined).toHaveBeenCalledWith({
        to: mockUser.email,
        data: {
          groupMember: mockGroupMember,
        },
      });
    });
  });

  describe('sendGroupMemberRoleUpdated', () => {
    it('should send a group member role updated email', async () => {
      groupMemberService.getMailServiceGroupMember.mockResolvedValue(
        mockGroupMember,
      );

      await service.sendGroupMemberRoleUpdated(mockGroupMember.id);

      expect(groupMemberService.getMailServiceGroupMember).toHaveBeenCalledWith(
        mockGroupMember.id,
      );
      expect(mailService.groupMemberRoleUpdated).toHaveBeenCalledWith({
        to: mockGroupMember.user.email,
        data: {
          groupMember: mockGroupMember,
        },
      });
    });
  });

  describe('sendAdminMessageToMembers', () => {
    const mockMembers = [
      { id: 1, email: 'member1@example.com', name: 'Member 1' } as any,
      { id: 2, email: 'member2@example.com', name: 'Member 2' } as any,
      { id: 3, email: null, name: 'Member 3' } as any, // No email
    ];

    beforeEach(() => {
      userService.findById.mockResolvedValue(mockUser);
      groupMemberService.getMailServiceGroupMembersByPermission.mockResolvedValue(
        mockMembers,
      );
      mailService.sendAdminGroupMessage = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('should send admin message to all group members with emails', async () => {
      const result = await service.sendAdminMessageToMembers(
        mockGroup, // group object instead of groupId
        1,
        'Important Update',
        'This is an important message for all members.',
      );

      expect(userService.findById).toHaveBeenCalledWith(1);
      expect(
        groupMemberService.getMailServiceGroupMembersByPermission,
      ).toHaveBeenCalledWith(
        mockGroup.id,
        expect.anything(), // We'll define the permission constant later
      );

      expect(mailService.sendAdminGroupMessage).toHaveBeenCalledTimes(3); // 2 members + 1 admin copy
      expect(result.success).toBe(true);
      expect(result.deliveredCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.messageId).toBeDefined();
    });

    it('should handle email send failures gracefully', async () => {
      mailService.sendAdminGroupMessage
        .mockResolvedValueOnce(undefined) // First email succeeds
        .mockResolvedValueOnce(undefined) // Second email succeeds
        .mockRejectedValueOnce(new Error('SMTP Error')); // Third email fails

      const result = await service.sendAdminMessageToMembers(
        mockGroup,
        1,
        'Test Subject',
        'Test message',
      );

      expect(result.success).toBe(false);
      expect(result.deliveredCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('SMTP Error');
    });

    it('should throw NotFoundException when no members found for group', async () => {
      groupMemberService.getMailServiceGroupMembersByPermission.mockResolvedValue(
        [],
      );

      await expect(
        service.sendAdminMessageToMembers(mockGroup, 1, 'Subject', 'Message'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when admin user not found', async () => {
      userService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.sendAdminMessageToMembers(mockGroup, 999, 'Subject', 'Message'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('previewAdminMessage', () => {
    beforeEach(() => {
      userService.findById.mockResolvedValue(mockUser);
      mailService.sendAdminGroupMessage = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('should send preview email to test address', async () => {
      await service.previewAdminMessage(
        mockGroup,
        1,
        'Test Subject',
        'Test message',
        'test@example.com',
      );

      expect(userService.findById).toHaveBeenCalledWith(1);
      expect(mailService.sendAdminGroupMessage).toHaveBeenCalledWith({
        to: 'test@example.com',
        data: expect.objectContaining({
          group: mockGroup,
          admin: mockUser,
          subject: '[PREVIEW] Test Subject',
          message: 'Test message',
        }),
      });
    });

    it('should throw NotFoundException when admin user not found', async () => {
      userService.findById.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        service.previewAdminMessage(
          mockGroup,
          1,
          'Subject',
          'Message',
          'test@example.com',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
