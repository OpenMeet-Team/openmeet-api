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
      } else if (templateName === 'event/new-event-announcement') {
        text = this.generateNewEventAnnouncementPlainText(
          context,
          tenantConfig,
        );
      } else if (templateName === 'event/event-update-announcement') {
        text = this.generateEventUpdateAnnouncementPlainText(
          context,
          tenantConfig,
        );
      } else if (templateName === 'event/event-cancellation-announcement') {
        text = this.generateEventCancellationAnnouncementPlainText(
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

  private generateNewEventAnnouncementPlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const {
      recipientName,
      eventTitle,
      eventDescription,
      eventDateTime,
      eventEndDateTime,
      eventTimeZone,
      eventLocation,
      groupName,
      organizerName,
      eventUrl,
      groupUrl,
      organizerUrl,
    } = context;

    // Format date/time
    const startDate = new Date(eventDateTime);
    const endDate = eventEndDateTime ? new Date(eventEndDateTime) : null;
    const timeZoneDisplay =
      eventTimeZone && eventTimeZone !== 'UTC' ? eventTimeZone : 'UTC';

    const formatDateTime = (date: Date) => {
      return (
        date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }) +
        ' at ' +
        date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: eventTimeZone || 'UTC',
        })
      );
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: eventTimeZone || 'UTC',
      });
    };

    let eventDetails = `When: ${formatDateTime(startDate)}`;
    if (endDate) {
      eventDetails += `\nEnds: ${formatTime(endDate)}`;
    }
    eventDetails += `\nTimezone: ${timeZoneDisplay}`;

    if (eventLocation) {
      eventDetails += `\nWhere: ${eventLocation}`;
    }

    let organizerInfo = '';
    if (organizerName) {
      organizerInfo = `\nOrganizer: ${organizerName}`;
      if (organizerUrl) {
        organizerInfo += ` (${organizerUrl})`;
      }
    }

    return `Hello ${recipientName},

A new event has been published in ${groupName}!

${eventTitle}

${eventDescription || ''}

${eventDetails}${organizerInfo}

View Event Details: ${eventUrl}
Visit ${groupName}: ${groupUrl}

You received this email because you're a member of "${groupName}" and have opted to receive new event notifications.

To manage your notification preferences, visit your profile settings: ${tenantConfig?.frontendDomain}/dashboard/profile

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  private generateEventUpdateAnnouncementPlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const {
      recipientName,
      eventTitle,
      eventDescription,
      eventDateTime,
      eventEndDateTime,
      eventTimeZone,
      eventLocation,
      groupName,
      organizerName,
      eventUrl,
      groupUrl,
      organizerUrl,
    } = context;

    // Format date/time
    const startDate = new Date(eventDateTime);
    const endDate = eventEndDateTime ? new Date(eventEndDateTime) : null;
    const timeZoneDisplay =
      eventTimeZone && eventTimeZone !== 'UTC' ? eventTimeZone : 'UTC';

    const formatDateTime = (date: Date) => {
      return (
        date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }) +
        ' at ' +
        date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: eventTimeZone || 'UTC',
        })
      );
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: eventTimeZone || 'UTC',
      });
    };

    let eventDetails = `When: ${formatDateTime(startDate)}`;
    if (endDate) {
      eventDetails += `\nEnds: ${formatTime(endDate)}`;
    }
    eventDetails += `\nTimezone: ${timeZoneDisplay}`;

    if (eventLocation) {
      eventDetails += `\nWhere: ${eventLocation}`;
    }

    let organizerInfo = '';
    if (organizerName) {
      organizerInfo = `\nOrganizer: ${organizerName}`;
      if (organizerUrl) {
        organizerInfo += ` (${organizerUrl})`;
      }
    }

    return `Hello ${recipientName},

An event in ${groupName} has been updated with new information!

📝 This event has been updated. Please review the latest details below.

${eventTitle}

${eventDescription || ''}

${eventDetails}${organizerInfo}

View Updated Event: ${eventUrl}
Visit ${groupName}: ${groupUrl}

You received this email because you're a member of "${groupName}" and have opted to receive event update notifications.

To manage your notification preferences, visit your profile settings: ${tenantConfig?.frontendDomain}/dashboard/profile

--
${tenantConfig?.name || 'OpenMeet'}
`;
  }

  private generateEventCancellationAnnouncementPlainText(
    context: Record<string, any>,
    tenantConfig: any,
  ): string {
    const {
      recipientName,
      eventTitle,
      eventDescription,
      eventDateTime,
      eventEndDateTime,
      eventTimeZone,
      eventLocation,
      groupName,
      organizerName,
      groupUrl,
      organizerUrl,
    } = context;

    // Format date/time
    const startDate = new Date(eventDateTime);
    const endDate = eventEndDateTime ? new Date(eventEndDateTime) : null;
    const timeZoneDisplay =
      eventTimeZone && eventTimeZone !== 'UTC' ? eventTimeZone : 'UTC';

    const formatDateTime = (date: Date) => {
      return (
        date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }) +
        ' at ' +
        date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: eventTimeZone || 'UTC',
        })
      );
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: eventTimeZone || 'UTC',
      });
    };

    let eventDetails = `Was scheduled for: ${formatDateTime(startDate)}`;
    if (endDate) {
      eventDetails += `\nWas to end: ${formatTime(endDate)}`;
    }
    eventDetails += `\nTimezone: ${timeZoneDisplay}`;

    if (eventLocation) {
      eventDetails += `\nLocation: ${eventLocation}`;
    }

    let organizerInfo = '';
    if (organizerName) {
      organizerInfo = `\nOrganizer: ${organizerName}`;
      if (organizerUrl) {
        organizerInfo += ` (${organizerUrl})`;
      }
    }

    return `Hello ${recipientName},

Unfortunately, an event in ${groupName} has been cancelled.

❌ This event has been cancelled and will no longer take place.

${eventTitle}

${eventDescription || ''}

${eventDetails}${organizerInfo}

We apologize for any inconvenience this cancellation may cause. Please check the group for updates on future events.

Visit ${groupName}: ${groupUrl}

You received this email because you're a member of "${groupName}" and have opted to receive event cancellation notifications.

To manage your notification preferences, visit your profile settings: ${tenantConfig?.frontendDomain}/dashboard/profile

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
