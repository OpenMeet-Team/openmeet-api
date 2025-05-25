import { Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { MailData } from '../messaging/interfaces/mail-data.interface';
import { UnifiedMessagingService } from '../messaging/services/unified-messaging.service';
import { MessageType } from '../messaging/interfaces/message.interface';

/**
 * AuthEmailService handles authentication-related emails using the messaging system.
 * This service is isolated to avoid circular dependencies between AuthModule and MessagingModule.
 */
@Injectable()
export class AuthEmailService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly messagingService: UnifiedMessagingService,
  ) {}

  /**
   * Send user signup confirmation email
   */
  async userSignUp(mailData: MailData<{ hash: string }>): Promise<void> {
    // Generate context similar to original MailService
    const context = {
      title: 'Confirm your email',
      text1: 'Welcome to our platform! Please confirm your email address.',
      text2: 'Click the link above to activate your account.',
      text3: 'If you did not create this account, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-email/${mailData.data?.hash}`,
      hash: mailData.data?.hash,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
      htmlContent: undefined, // Will use template
      templateId: 'auth/activation.mjml.ejs',
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
  ): Promise<void> {
    // Generate context similar to original MailService
    const context = {
      title: 'Reset your password',
      text1: 'You requested a password reset for your account.',
      text2: 'Click the link above to reset your password.',
      text3: 'This link will expire soon for security reasons.',
      text4: 'If you did not request this reset, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/password-change/${mailData.data?.hash}`,
      hash: mailData.data?.hash,
      tokenExpires: mailData.data?.tokenExpires,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}\n\n${context.text4}`,
      htmlContent: undefined,
      templateId: 'auth/reset-password.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'password_reset',
    });
  }

  /**
   * Send email change confirmation
   */
  async confirmNewEmail(mailData: MailData<{ hash: string }>): Promise<void> {
    // Generate context similar to original MailService
    const context = {
      title: 'Confirm your new email',
      text1: 'Please confirm your new email address.',
      text2: 'If you did not request this change, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-new-email/${mailData.data?.hash}`,
      hash: mailData.data?.hash,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: mailData.to,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}`,
      htmlContent: undefined,
      templateId: 'auth/confirm-new-email.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_change',
    });
  }
}
