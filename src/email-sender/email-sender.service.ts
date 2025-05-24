import { Injectable } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
import { IEmailSender } from '../messaging/interfaces/email-sender.interface';

/**
 * Low-level email sending service that can be used by both
 * MailService and MessagingService without circular dependencies
 */
@Injectable()
export class EmailSenderService implements IEmailSender {
  constructor(private readonly mailerService: MailerService) {}

  async sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    templatePath?: string;
    context?: any;
    from?: { name: string; email: string };
  }): Promise<string | void> {
    await this.mailerService.sendMail({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      templatePath: options.templatePath,
      context: options.context,
      from: options.from,
    });

    // TODO: Return actual message ID from mailer service
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
