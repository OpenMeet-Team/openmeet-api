import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { MailData } from './interfaces/mail-data.interface';

import { MaybeType } from '../utils/types/maybe.type';
import { MailerService } from '../mailer/mailer.service';
import path from 'path';
import { AllConfigType } from '../config/config.type';
import { REQUEST } from '@nestjs/core';
import { TenantConfig } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from 'src/group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { EventAttendeesEntity } from 'src/event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class MailService {
  private tenantConfig: TenantConfig;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly tenantService: TenantConnectionService,
  ) {}

  getTenantConfig() {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    this.tenantConfig = this.tenantService.getTenantConfig(tenantId);
  }

  async userSignUp(mailData: MailData<{ hash: string }>): Promise<void> {
    this.getTenantConfig();

    const i18n = I18nContext.current();
    let emailConfirmTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;

    if (i18n) {
      [emailConfirmTitle, text1, text2, text3] = await Promise.all([
        i18n.t('common.confirmEmail'),
        i18n.t('confirm-email.text1'),
        i18n.t('confirm-email.text2'),
        i18n.t('confirm-email.text3'),
      ]);
    }

    const url = new URL(
      this.tenantConfig.frontendDomain + '/auth/confirm-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.mailerService.sendMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: emailConfirmTitle,
      text: `${url.toString()} ${emailConfirmTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'auth',
        'activation.hbs',
      ),
      context: {
        title: emailConfirmTitle,
        url: url.toString(),
        actionTitle: emailConfirmTitle,
        app_name: this.tenantConfig.name,
        text1,
        text2,
        text3,
      },
    });
  }

  async forgotPassword(
    mailData: MailData<{ hash: string; tokenExpires: number }>,
  ): Promise<void> {
    this.getTenantConfig();

    const i18n = I18nContext.current();
    let resetPasswordTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;
    let text4: MaybeType<string>;

    if (i18n) {
      [resetPasswordTitle, text1, text2, text3, text4] = await Promise.all([
        i18n.t('common.resetPassword'),
        i18n.t('reset-password.text1'),
        i18n.t('reset-password.text2'),
        i18n.t('reset-password.text3'),
        i18n.t('reset-password.text4'),
      ]);
    }

    const url = new URL(
      this.tenantConfig.frontendDomain + '/auth/password-change',
    );
    url.searchParams.set('hash', mailData.data.hash);
    url.searchParams.set('expires', mailData.data.tokenExpires.toString());

    await this.mailerService.sendMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: resetPasswordTitle,
      text: `${url.toString()} ${resetPasswordTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'auth',
        'reset-password.hbs',
      ),
      context: {
        title: resetPasswordTitle,
        url: url.toString(),
        actionTitle: resetPasswordTitle,
        app_name: this.tenantConfig.name,
        text1,
        text2,
        text3,
        text4,
      },
    });
  }

  async confirmNewEmail(mailData: MailData<{ hash: string }>): Promise<void> {
    this.getTenantConfig();

    const i18n = I18nContext.current();
    let emailConfirmTitle: MaybeType<string>;
    let text1: MaybeType<string>;
    let text2: MaybeType<string>;
    let text3: MaybeType<string>;

    if (i18n) {
      [emailConfirmTitle, text1, text2, text3] = await Promise.all([
        i18n.t('common.confirmEmail'),
        i18n.t('confirm-new-email.text1'),
        i18n.t('confirm-new-email.text2'),
        i18n.t('confirm-new-email.text3'),
      ]);
    }

    const url = new URL(
      this.tenantConfig.frontendDomain + '/auth/confirm-new-email',
    );
    url.searchParams.set('hash', mailData.data.hash);

    await this.mailerService.sendMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: emailConfirmTitle,
      text: `${url.toString()} ${emailConfirmTitle}`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'auth',
        'confirm-new-email.hbs',
      ),
      context: {
        title: emailConfirmTitle,
        url: url.toString(),
        actionTitle: emailConfirmTitle,
        app_name: this.tenantConfig.name,
        text1,
        text2,
        text3,
      },
    });
  }

  async groupGuestJoined(
    mailData: MailData<{
      groupMember: GroupMemberEntity;
    }>,
  ): Promise<void> {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: 'New member applied to join your group',
      templateName: 'group/group-guest-joined',
      context: {
        tenantConfig: this.tenantConfig,
        groupMember: mailData.data.groupMember,
      },
    });
  }

  async groupMemberRoleUpdated(
    mailData: MailData<{ groupMember: GroupMemberEntity }>,
  ): Promise<void> {
    this.getTenantConfig();
    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: 'Your role in the group has been updated',
      templateName: 'group/group-member-role-updated',
      context: {
        tenantConfig: this.tenantConfig,
        groupMember: mailData.data.groupMember,
      },
    });
  }

  async renderTemplate(template: string, data: Record<string, any>) {
    return this.mailerService.renderTemplate(template, data);
  }

  async sendMailAttendeeGuestJoined(
    mailData: MailData<{ eventAttendee: EventAttendeesEntity }>,
  ) {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: 'New attendee applied to attend your event',
      templateName: 'event/attendee-guest-joined',
      context: {
        eventAttendee: mailData.data.eventAttendee,
      },
    });
  }

  async sendMailAttendeeStatusChanged(
    mailData: MailData<{ eventAttendee: EventAttendeesEntity }>,
  ) {
    this.getTenantConfig();
    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: 'Attendee status in the event has been updated',
      templateName: 'event/attendee-status-changed',
      context: {
        eventAttendee: mailData.data.eventAttendee,
      },
    });
  }

  async sendMailChatNewMessage(
    mailData: MailData<{ participant: UserEntity }>,
  ) {
    this.getTenantConfig();
    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: 'New message from your chat',
      templateName: 'chat/chat-new-message',
      context: {
        participant: mailData.data.participant,
      },
    });
  }

  async sendAdminGroupMessage(
    mailData: MailData<{
      group: any;
      admin: any;
      subject: string;
      message: string;
    }>,
  ): Promise<void> {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: `[${mailData.data.group.name}] ${mailData.data.subject}`,
      templateName: 'group/admin-message-to-members',
      context: {
        tenantConfig: this.tenantConfig,
        group: mailData.data.group,
        admin: mailData.data.admin,
        subject: mailData.data.subject,
        message: mailData.data.message,
      },
    });
  }

  async sendAdminEventMessage(
    mailData: MailData<{
      event: any;
      admin: any;
      subject: string;
      message: string;
    }>,
  ): Promise<void> {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: `[${mailData.data.event.name}] ${mailData.data.subject}`,
      templateName: 'event/admin-message-to-attendees',
      context: {
        tenantConfig: this.tenantConfig,
        event: mailData.data.event,
        admin: mailData.data.admin,
        subject: mailData.data.subject,
        message: mailData.data.message,
      },
    });
  }

  async sendMemberContactNotification(
    mailData: MailData<{
      group: any;
      member: any;
      contactType: string;
      subject: string;
      message: string;
    }>,
  ): Promise<void> {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: `Member ${mailData.data.contactType} - ${mailData.data.subject}`,
      templateName: 'group/member-contact-notification',
      context: {
        tenantConfig: this.tenantConfig,
        group: mailData.data.group,
        member: mailData.data.member,
        contactType: mailData.data.contactType,
        subject: mailData.data.subject,
        message: mailData.data.message,
      },
    });
  }

  async sendAttendeeContactNotification(
    mailData: MailData<{
      event: any;
      attendee: any;
      contactType: string;
      subject: string;
      message: string;
    }>,
  ): Promise<void> {
    this.getTenantConfig();

    await this.mailerService.sendMjmlMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      subject: `Attendee ${mailData.data.contactType} - ${mailData.data.subject}`,
      templateName: 'event/attendee-contact-notification',
      context: {
        tenantConfig: this.tenantConfig,
        event: mailData.data.event,
        attendee: mailData.data.attendee,
        contactType: mailData.data.contactType,
        subject: mailData.data.subject,
        message: mailData.data.message,
      },
    });
  }
}
