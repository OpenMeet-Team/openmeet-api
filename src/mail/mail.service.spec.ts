import {
  mockConfigService,
  mockRepository,
  mockTenantConnectionService,
} from '../test/mocks';
import { MailerService } from '../mailer/mailer.service';
import {
  mockEventAttendee,
  mockGroupMember,
  mockMailerService,
  mockUser,
} from '../test/mocks';
import { MailService } from './mail.service';
import { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { getTenantConfig } from '../utils/tenant-config';

describe('MailService', () => {
  let mailService: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: getTenantConfig,
          useValue: jest.fn(),
        },
      ],
    }).compile();
    mailService = module.get<MailService>(MailService);
  });

  describe('userSignUp', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'userSignUp').mockResolvedValue();
      const result = await mailService.userSignUp({
        to: mockUser.email as string,
        data: {
          hash: 'hash',
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('forgotPassword', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'forgotPassword').mockResolvedValue();
      const result = await mailService.forgotPassword({
        to: mockUser.email as string,
        data: {
          hash: 'hash',
          tokenExpires: 1000,
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('confirmNewEmail', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'confirmNewEmail').mockResolvedValue();
      const result = await mailService.confirmNewEmail({
        to: mockUser.email as string,
        data: {
          hash: 'hash',
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('groupGuestJoined', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'groupGuestJoined').mockResolvedValue();
      const result = await mailService.groupGuestJoined({
        to: mockUser.email as string,
        data: {
          groupMember: mockGroupMember,
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('groupMemberRoleUpdated', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'groupMemberRoleUpdated').mockResolvedValue();
      const result = await mailService.groupMemberRoleUpdated({
        to: mockUser.email as string,
        data: {
          groupMember: mockGroupMember,
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('renderTemplate', () => {
    it('should render template', async () => {
      jest.spyOn(mailService, 'renderTemplate').mockResolvedValue('template');
      const result = await mailService.renderTemplate('template', {
        data: {
          user: mockUser,
        },
      });
      expect(result).toBeDefined();
    });
  });

  describe('sendMailAttendeeGuestJoined', () => {
    it('should send mail to user', async () => {
      jest
        .spyOn(mailService, 'sendMailAttendeeGuestJoined')
        .mockResolvedValue();
      const result = await mailService.sendMailAttendeeGuestJoined({
        to: mockUser.email as string,
        data: {
          eventAttendee: mockEventAttendee,
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('sendMailAttendeeStatusChanged', () => {
    it('should send mail to user', async () => {
      jest
        .spyOn(mailService, 'sendMailAttendeeStatusChanged')
        .mockResolvedValue();
      const result = await mailService.sendMailAttendeeStatusChanged({
        to: mockUser.email as string,
        data: {
          eventAttendee: mockEventAttendee,
        },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('sendMailChatNewMessage', () => {
    it('should send mail to user', async () => {
      jest.spyOn(mailService, 'sendMailChatNewMessage').mockResolvedValue();
      const result = await mailService.sendMailChatNewMessage({
        to: mockUser.email as string,
        data: {
          participant: mockUser,
        },
      });
      expect(result).toBeUndefined();
    });
  });
});
