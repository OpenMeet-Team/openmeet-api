import { Injectable } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
import { IEmailSender } from '../messaging/interfaces/email-sender.interface';
import { TenantConnectionService } from '../tenant/tenant.service';

/**
 * Low-level email sending service that can be used by both
 * MailService and MessagingService without circular dependencies
 */
@Injectable()
export class EmailSenderService implements IEmailSender {
  constructor(
    private readonly mailerService: MailerService,
    private readonly tenantService: TenantConnectionService,
  ) {}

  async sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    templatePath?: string;
    context?: any;
    from?: { name: string; email: string };
    tenantId?: string;
  }): Promise<string | void> {
    console.log('[DEBUG] EmailSenderService.sendEmail called with options:', {
      to: options.to,
      subject: options.subject,
      templatePath: options.templatePath,
      hasContext: !!options.context,
      hasText: !!options.text,
      hasHtml: !!options.html,
    });
    
    console.log('[DEBUG] EmailSenderService about to call mailerService.sendMail');
    try {
      // Get tenant config if tenantId is provided
      let tenantConfig = {};
      if (options.tenantId) {
        tenantConfig = this.tenantService.getTenantConfig(options.tenantId);
      }

      await this.mailerService.sendMail({
        tenantConfig,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        templatePath: options.templatePath,
        context: options.context,
        from: options.from,
      });
      console.log('[DEBUG] EmailSenderService.sendEmail completed - email sent to mailer');
    } catch (error) {
      console.error('[DEBUG] EmailSenderService.sendMail failed:', error);
      throw error;
    }
    
    // TODO: Return actual message ID from mailer service
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
