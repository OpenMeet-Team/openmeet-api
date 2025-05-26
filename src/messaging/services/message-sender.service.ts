import { Injectable, Inject } from '@nestjs/common';
import {
  EMAIL_SENDER_TOKEN,
  IEmailSender,
} from '../interfaces/email-sender.interface';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  templatePath?: string;
  context?: any;
  tenantId: string;
}

/**
 * Core email sending service - minimal dependencies
 * Can be used in any context (controllers, event listeners, etc.)
 */
@Injectable()
export class MessageSenderService {
  constructor(
    @Inject(EMAIL_SENDER_TOKEN) private readonly emailSender: IEmailSender,
  ) {}

  async sendEmail(options: SendEmailOptions): Promise<string | null> {
    try {
      const result = await this.emailSender.sendEmail({
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        templatePath: options.templatePath,
        context: options.context,
        tenantId: options.tenantId,
      });

      return result as string;
    } catch (error) {
      console.error('Error sending email:', error);
      return null;
    }
  }

  async sendSystemEmail(options: {
    recipientEmail: string;
    subject: string;
    text: string;
    html?: string;
    tenantId: string;
  }): Promise<string | null> {
    return this.sendEmail({
      to: options.recipientEmail,
      subject: options.subject,
      text: options.text,
      html: options.html,
      tenantId: options.tenantId,
    });
  }
}
