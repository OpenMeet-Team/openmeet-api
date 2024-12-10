import { Inject, Injectable, Scope } from '@nestjs/common';
import fs from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { AllConfigType } from '../config/config.type';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class MailerService {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('mail.host', { infer: true }),
      port: configService.get('mail.port', { infer: true }),
      ignoreTLS: configService.get('mail.ignoreTLS', { infer: true }),
      secure: configService.get('mail.secure', { infer: true }),
      requireTLS: configService.get('mail.requireTLS', { infer: true }),
      auth: {
        user: configService.get('mail.user', { infer: true }),
        pass: configService.get('mail.password', { infer: true }),
      },
    });
  }

  async sendMail({
    tenantConfig,
    templatePath,
    context,
    ...mailOptions
  }: nodemailer.SendMailOptions & {
    templatePath: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    let html: string | undefined;
    if (templatePath) {
      const template = await fs.readFile(templatePath, 'utf-8');
      html = Handlebars.compile(template, {
        strict: true,
      })(context);
    }

    await this.transporter.sendMail({
      ...mailOptions,
      from: mailOptions.from
        ? mailOptions.from
        : `"${
            tenantConfig.mailDefaultName ||
            this.configService.get('mail.defaultName', {
              infer: true,
            })
          }" <${
            tenantConfig.mailDefaultEmail ||
            this.configService.get('mail.defaultEmail', {
              infer: true,
            })
          }>`,
      html: mailOptions.html ? mailOptions.html : html,
    });
  }
}
