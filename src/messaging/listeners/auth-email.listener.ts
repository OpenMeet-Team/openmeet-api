import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { MessageType } from '../interfaces/message.interface';

/**
 * Events that can be emitted for authentication emails
 */
export interface UserSignupEvent {
  email: string;
  hash: string;
}

export interface PasswordResetEvent {
  email: string;
  hash: string;
  tokenExpires: number;
}

export interface EmailChangeEvent {
  email: string;
  hash: string;
}

/**
 * AuthEmailListener handles authentication email events using the messaging system.
 * This avoids circular dependencies by using an event-driven approach.
 */
@Injectable()
export class AuthEmailListener {
  constructor(private readonly messagingService: UnifiedMessagingService) {}

  @OnEvent('auth.user.signup')
  async handleUserSignup(event: UserSignupEvent): Promise<void> {
    const context = {
      title: 'Confirm your email',
      text1: 'Welcome to our platform! Please confirm your email address.',
      text2: 'Click the link above to activate your account.',
      text3: 'If you did not create this account, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-email/${event.hash}`,
      hash: event.hash,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: event.email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
      htmlContent: undefined,
      templateId: 'auth/activation.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'user_signup',
    });
  }

  @OnEvent('auth.password.reset')
  async handlePasswordReset(event: PasswordResetEvent): Promise<void> {
    const context = {
      title: 'Reset your password',
      text1: 'You requested a password reset for your account.',
      text2: 'Click the link above to reset your password.',
      text3: 'This link will expire soon for security reasons.',
      text4: 'If you did not request this reset, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/password-change/${event.hash}`,
      hash: event.hash,
      tokenExpires: event.tokenExpires,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: event.email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}\n\n${context.text4}`,
      htmlContent: undefined,
      templateId: 'auth/reset-password.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'password_reset',
    });
  }

  @OnEvent('auth.email.change')
  async handleEmailChange(event: EmailChangeEvent): Promise<void> {
    const context = {
      title: 'Confirm your new email',
      text1: 'Please confirm your new email address.',
      text2: 'If you did not request this change, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-new-email/${event.hash}`,
      hash: event.hash,
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: event.email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}`,
      htmlContent: undefined,
      templateId: 'auth/confirm-new-email.hbs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_change',
    });
  }
}