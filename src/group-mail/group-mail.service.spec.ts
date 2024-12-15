import { Test, TestingModule } from '@nestjs/testing';
import { GroupMailService } from './group-mail.service';
import { MailService } from '../mail/mail.service';
import {
  mockGroupMailService,
  mockGroupMember,
  mockGroupMemberService,
} from '../test/mocks/group-mocks';
import { GroupMemberService } from '../group-member/group-member.service';
import { mockMailService } from '../test/mocks/mocks';

describe('GroupMailService', () => {
  let service: GroupMailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GroupMailService,
          useValue: mockGroupMailService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
      ],
    }).compile();

    service = module.get<GroupMailService>(GroupMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendGroupGuestJoined', () => {
    it('should send a group guest joined email', async () => {
      const result = await service.sendGroupGuestJoined(mockGroupMember.id);
      expect(result).toEqual(mockGroupMember);
    });
  });

  describe('sendGroupMemberRoleUpdated', () => {
    it('should send a group member role updated email', async () => {
      const result = await service.sendGroupMemberRoleUpdated(
        mockGroupMember.id,
      );
      expect(result).toEqual(mockGroupMember);
    });
  });
});
