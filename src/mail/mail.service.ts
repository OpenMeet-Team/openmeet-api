import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { MailData } from './interfaces/mail-data.interface';

import { MaybeType } from '../utils/types/maybe.type';
import { MailerService } from '../mailer/mailer.service';
import path from 'path';
import { AllConfigType } from '../config/config.type';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { getTenantConfig } from '../utils/tenant-config';
import { REQUEST } from '@nestjs/core';
import fs from 'fs';
import handlebars from 'handlebars';
import { TenantConfig } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';

@Injectable()
export class MailService {
  private partials: { [key: string]: string } = {};
  private tenantConfig: TenantConfig;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly tenantService: TenantConnectionService,
  ) {
    this.registerPartials();
  }

  getTenantConfig() {
    const tenantId = this.request.tenantId;
    this.tenantConfig = this.tenantService.getTenantConfig(tenantId);
  }

  private registerPartials() {
    // Load and register partial templates
    const partialsDir = path.join(
      this.configService.getOrThrow('app.workingDirectory', { infer: true }),
      'src',
      'mail',
      'mail-templates',
      'partials',
    );

    fs.readdirSync(partialsDir).forEach((file) => {
      const partialName = file.replace('.hbs', '');
      const partialContent = fs.readFileSync(
        path.join(partialsDir, file),
        'utf8',
      );
      handlebars.registerPartial(partialName, partialContent);
      this.partials[partialName] = partialContent;
    });
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
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/auth/confirm-email',
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
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/auth/password-change',
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
      this.configService.getOrThrow('app.frontendDomain', {
        infer: true,
      }) + '/auth/confirm-new-email',
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

  async groupMemberJoined(
    mailData: MailData<{ group: GroupEntity; user: UserEntity }>,
  ): Promise<void> {
    this.getTenantConfig();

    const tenantConfig = getTenantConfig(this.request.tenantId);
    const url = tenantConfig.frontendDomain + '/auth/confirm-email';

    await this.mailerService.sendMail({
      tenantConfig: this.tenantConfig,
      to: mailData.to,
      title: 'New member has joined your group',
      subject: 'New member has joined your group',
      text: `${url.toString()} New member has joined your group`,
      templatePath: path.join(
        this.configService.getOrThrow('app.workingDirectory', {
          infer: true,
        }),
        'src',
        'mail',
        'mail-templates',
        'partials',
        'layout.hbs',
      ),
      context: {
        title: 'Title. New member has joined your group',
        subject: 'Subject. New member has joined your group',
        body: `Group member ${mailData.data.user.name} joined ${mailData.data.group.name}.`,
        memberName: mailData.data.user.name,
        groupName: mailData.data.group.name,
        tenantFrontendDomain: tenantConfig.frontendDomain,
        tenantLogoUrl: tenantConfig.logoUrl,
        tenantName: tenantConfig.name,
        tenantCompanyDomain: tenantConfig.companyDomain,
        tenantEmail: tenantConfig.mailDefaultEmail,
      },
    });
  }
}
