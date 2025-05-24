import { Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnifiedMessagingService } from '../messaging/services/unified-messaging.service';
import { MessageType } from '../messaging/interfaces/message.interface';
import * as path from 'path';

export interface EmailSimulationRequest {
  email: string;
  emailType: 'signup' | 'password_reset' | 'email_change';
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly messagingService: UnifiedMessagingService,
    private readonly configService: ConfigService,
  ) {}

  async simulateSignupEmail(email: string): Promise<void> {
    console.log('[DEBUG] AdminService.simulateSignupEmail called with email:', email);
    const tenantId = this.request.tenantId;
    console.log('[DEBUG] AdminService tenantId:', tenantId);

    // Generate a mock hash for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);

    const context = {
      title: 'Confirm your email',
      text1: 'Welcome to our platform! Please confirm your email address.',
      text2: 'Click the link above to activate your account.',
      text3: 'If you did not create this account, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-email/${mockHash}`,
      hash: mockHash,
      actionTitle: 'Confirm Email',
      app_name: 'OpenMeet',
    };

    console.log('[DEBUG] AdminService about to call messagingService.sendSystemMessage');
    try {
      await this.messagingService.sendSystemMessage({
        recipientEmail: email,
        subject: context.title,
        content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
        htmlContent: undefined,
        templateId: path.join(
          this.configService.getOrThrow('app.workingDirectory'),
          'src',
          'messaging',
          'templates',
          'auth',
          'activation.hbs',
        ),
        context,
        type: MessageType.ADMIN_CONTACT,
        systemReason: 'email_simulation_signup',
        tenantId,
      });
      console.log('[DEBUG] AdminService sendSystemMessage completed successfully');
    } catch (error) {
      console.error('[DEBUG] AdminService sendSystemMessage failed:', error);
      throw error;
    }
  }

  async simulatePasswordResetEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;

    // Generate a mock hash and expiry for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);
    const tokenExpires = Date.now() + 3600000; // 1 hour from now

    const context = {
      title: 'Reset your password',
      text1: 'You requested a password reset for your account.',
      text2: 'Click the link above to reset your password.',
      text3: 'This link will expire soon for security reasons.',
      text4: 'If you did not request this reset, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/password-change/${mockHash}`,
      hash: mockHash,
      tokenExpires,
      actionTitle: 'Reset Password',
      app_name: 'OpenMeet',
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}\n\n${context.text4}`,
      htmlContent: undefined,
      templateId: path.join(
        this.configService.getOrThrow('app.workingDirectory'),
        'src',
        'messaging',
        'templates',
        'auth',
        'reset-password.hbs',
      ),
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_password_reset',
      tenantId,
    });
  }

  async simulateEmailChangeEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;

    // Generate a mock hash for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);

    const context = {
      title: 'Confirm your new email',
      text1: 'Please confirm your new email address.',
      text2: 'Click the link below to confirm your new email.',
      text3: 'If you did not request this change, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-new-email/${mockHash}`,
      hash: mockHash,
      actionTitle: 'Confirm New Email',
      app_name: 'OpenMeet',
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
      htmlContent: undefined,
      templateId: path.join(
        this.configService.getOrThrow('app.workingDirectory'),
        'src',
        'messaging',
        'templates',
        'auth',
        'confirm-new-email.hbs',
      ),
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_email_change',
      tenantId,
    });
  }
}
