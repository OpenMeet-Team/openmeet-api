import { Injectable } from '@nestjs/common';
import { UnifiedMessagingService } from './unified-messaging.service';
import { MessageType } from '../interfaces/message.interface';
import { MailData } from '../../mail/interfaces/mail-data.interface';

/**
 * MailAdapterService provides a compatibility layer between the old mail service
 * and the new unified messaging system. This allows gradual migration.
 */
@Injectable()
export class MailAdapterService {
  constructor(private readonly messagingService: UnifiedMessagingService) {}

  /**
   * Send user signup confirmation email
   */
  async userSignUp(
    mailData: MailData<{ hash: string }>,
    context: any,
  ): Promise<void> {
    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title || 'Confirm your email',
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
      htmlContent: undefined, // Will use template
      templateId: 'auth/activation.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'user_signup',
    });
  }

  /**
   * Send password reset email
   */
  async forgotPassword(
    mailData: MailData<{ hash: string; tokenExpires: number }>,
    context: any,
  ): Promise<void> {
    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title || 'Reset your password',
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}\n\n${context.text4}`,
      htmlContent: undefined,
      templateId: 'auth/reset-password.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'password_reset',
    });
  }

  /**
   * Send email change confirmation
   */
  async confirmNewEmail(
    mailData: MailData<{ hash: string }>,
    context: any,
  ): Promise<void> {
    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title || 'Confirm your new email',
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}`,
      htmlContent: undefined,
      templateId: 'auth/confirm-new-email.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_change',
    });
  }

  /**
   * Send custom message (generic fallback)
   */
  async sendCustomMessage(options: {
    to: string;
    subject: string;
    content: string;
    htmlContent?: string;
    templateId?: string;
    context?: any;
  }): Promise<void> {
    await this.messagingService.sendSystemMessage({
      recipientEmail: options.to,
      subject: options.subject,
      content: options.content,
      htmlContent: options.htmlContent,
      templateId: options.templateId,
      context: options.context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'custom_message',
    });
  }
}
