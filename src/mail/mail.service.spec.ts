import {
  mockConfigService,
  mockRepository,
  mockTenantConnectionService,
  mockTenantConfig,
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
    jest.clearAllMocks();

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
    it('should call sendMjmlMail with auth/activation template', async () => {
      await mailService.userSignUp({
        to: mockUser.email as string,
        data: {
          hash: 'test-hash',
        },
      });

      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledTimes(1);
      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          templateName: 'auth/activation',
          context: expect.objectContaining({
            tenantConfig: mockTenantConfig,
            url: expect.stringContaining('test-hash'),
          }),
        }),
      );
      // Must NOT call the legacy sendMail
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should call sendMjmlMail with auth/reset-password template', async () => {
      await mailService.forgotPassword({
        to: mockUser.email as string,
        data: {
          hash: 'reset-hash',
          tokenExpires: 1000,
        },
      });

      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledTimes(1);
      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          templateName: 'auth/reset-password',
          context: expect.objectContaining({
            tenantConfig: mockTenantConfig,
            url: expect.stringContaining('reset-hash'),
          }),
        }),
      );
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('confirmNewEmail', () => {
    it('should call sendMjmlMail with auth/confirm-new-email template', async () => {
      await mailService.confirmNewEmail({
        to: mockUser.email as string,
        data: {
          hash: 'confirm-hash',
        },
      });

      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledTimes(1);
      expect(mockMailerService.sendMjmlMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          templateName: 'auth/confirm-new-email',
          context: expect.objectContaining({
            tenantConfig: mockTenantConfig,
            url: expect.stringContaining('confirm-hash'),
          }),
        }),
      );
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
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


});
