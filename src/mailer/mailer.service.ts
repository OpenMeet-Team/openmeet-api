import { Inject, Injectable, Scope } from '@nestjs/common';
import fs from 'node:fs/promises';
import ejs from 'ejs';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { AllConfigType } from '../config/config.type';
import { REQUEST } from '@nestjs/core';
import path from 'node:path';
import mjml from 'mjml';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  private readonly templateCache = new Map<string, string>();
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

  async sendEjsMail({
    to,
    subject,
    templateName,
    context,
    tenantConfig,
  }: {
    to: string;
    subject: string;
    templateName: string;
    context: Record<string, any>;
    tenantConfig: any;
  }) {
    try {
      const templatePath = this.getTemplatePath(templateName);

      // Read and render the EJS template
      const template = await fs.readFile(templatePath, 'utf-8');
      const html = await ejs.render(
        template,
        {
          ...context,
          tenantConfig,
          currentYear: new Date().getFullYear(),
        },
        {
          filename: templatePath, // Required for includes/extends
        },
      );

      // Send the email
      await this.transporter.sendMail({
        from: {
          name: this.configService.get('mail.defaultName', { infer: true }),
          address: this.configService.get('mail.defaultEmail', { infer: true }),
        },
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error('Failed to send mjml email:', error);
      throw error;
    }
  }

  private getTemplatePath(templateName: string): string {
    return path.join(
      this.configService.getOrThrow('app.workingDirectory', { infer: true }),
      'src',
      'mail',
      'mail-templates',
      `${templateName}.ejs`,
    );
  }

  async sendMjmlMail({
    to,
    subject,
    templateName,
    context,
    tenantConfig,
  }: {
    to: string;
    subject: string;
    templateName: string;
    context: Record<string, any>;
    tenantConfig: any;
  }) {
    try {
      const html = await this.renderTemplate(templateName, {
        ...context,
        tenantConfig,
        currentYear: new Date().getFullYear(),
      });

      // Generate plain text version for all templates
      let text: string | undefined;
      if (templateName === 'group/admin-message-to-members') {
        text = this.generateGroupAdminMessagePlainText(context, tenantConfig);
      } else if (templateName === 'event/admin-message-to-attendees') {
        text = this.generateEventAdminMessagePlainText(context, tenantConfig);
      } else if (templateName === 'group/member-contact-notification') {
        text = this.generateMemberContactNotificationPlainText(
          context,
          tenantConfig,
        );
      } else if (templateName === 'event/attendee-contact-notification') {
        text = this.generateAttendeeContactNotificationPlainText(
          context,
          tenantConfig,
        );
      }

      await this.transporter.sendMail({
        from: {
          name:
            tenantConfig.mailDefaultName ||
            this.configService.get('mail.defaultName', { infer: true }),
          address:
            tenantConfig.mailDefaultEmail ||
            this.configService.get('mail.defaultEmail', { infer: true }),
        },
        to,
        subject,
        html,
        text,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  private generateGroupAdminMessagePlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const { group, admin, subject, message } = context;
    const groupUrl = `${tenantConfig?.frontendDomain}/groups/${group?.slug}`;

    return `Hello,

${admin?.firstName} ${admin?.lastName} from ${group?.name} has sent you a message:

${subject}

${message}

View Group: ${groupUrl}

This message was sent by ${admin?.firstName} ${admin?.lastName} from the group "${group?.name}".

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  private generateEventAdminMessagePlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const { event, admin, subject, message } = context;
    const eventUrl = `${tenantConfig?.frontendDomain}/events/${event?.slug}`;

    return `Hello,

${admin?.firstName} ${admin?.lastName} from ${event?.name} has sent you a message:

${subject}

${message}

View Event: ${eventUrl}

This message was sent by ${admin?.firstName} ${admin?.lastName} from the event "${event?.name}".

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  private generateMemberContactNotificationPlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const { group, member, subject, message, contactType } = context;
    const groupUrl = `${tenantConfig?.frontendDomain}/groups/${group?.slug}`;
    const membersUrl = `${tenantConfig?.frontendDomain}/groups/${group?.slug}/members`;

    return `Hello,

${member?.firstName} ${member?.lastName} from the group ${group?.name} has sent you a ${contactType}:

${subject}

${message}

View Group Members: ${membersUrl}
View Group: ${groupUrl}

This ${contactType} was sent by ${member?.firstName} ${member?.lastName} from the group "${group?.name}".
Contact type: ${contactType}

To reply to this member, visit the group page and use the group messaging features.

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  private generateAttendeeContactNotificationPlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const { event, attendee, subject, message, contactType } = context;
    const eventUrl = `${tenantConfig?.frontendDomain}/events/${event?.slug}`;
    const attendeesUrl = `${tenantConfig?.frontendDomain}/events/${event?.slug}/attendees`;

    return `Hello,

${attendee?.firstName} ${attendee?.lastName} from the event ${event?.name} has sent you a ${contactType}:

${subject}

${message}

View Event Attendees: ${attendeesUrl}
View Event: ${eventUrl}

This ${contactType} was sent by ${attendee?.firstName} ${attendee?.lastName} from the event "${event?.name}".
Contact type: ${contactType}

To reply to this attendee, visit the event page and use the event messaging features.

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  async renderTemplate(
    templateName: string,
    context: Record<string, any>,
  ): Promise<string> {
    const templatePath = path.join(
      this.configService.getOrThrow('app.workingDirectory', { infer: true }),
      'src/mail/mail-templates',
      `${templateName}.mjml.ejs`,
    );

    // Check cache first
    const cacheKey = `${templateName}:${JSON.stringify(context)}`;
    if (this.templateCache.has(cacheKey) && !context.preview) {
      return this.templateCache.get(cacheKey) as string;
    }

    const ejsTemplate = await fs.readFile(templatePath, 'utf-8');
    const renderedTemplate = await ejs.render(
      ejsTemplate,
      {
        ...context,
        currentYear: new Date().getFullYear(),
      },
      {
        filename: templatePath,
      },
    );

    const { html } = mjml(renderedTemplate, {
      validationLevel: 'strict',
      keepComments: false,
      fonts: {
        Inter:
          'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
      },
      // beautify: false,
      // minify: true,
    });

    // Cache the result
    this.templateCache.set(cacheKey, html);

    return html;
  }
}
