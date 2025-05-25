import { Injectable } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { IEmailSender } from '../messaging/interfaces/email-sender.interface';
import { TenantConnectionService } from '../tenant/tenant.service';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
const mjml = require('mjml');

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

  private async renderTemplate(
    templatePath: string,
    context: any,
    tenantConfig: any,
  ): Promise<{ html: string; text: string }> {
    try {
      // Resolve relative template paths to absolute paths
      let resolvedPath = templatePath;
      if (!path.isAbsolute(templatePath)) {
        resolvedPath = path.join(
          process.cwd(),
          'src',
          'messaging',
          'templates',
          templatePath,
        );
      }

      // Check if template file exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Template file not found: ${resolvedPath}`);
      }

      // Read template file
      const templateContent = fs.readFileSync(resolvedPath, 'utf8');

      // Prepare context with tenant config and current year
      const templateContext = {
        ...context,
        tenantConfig,
        currentYear: new Date().getFullYear(),
      };

      // Render EJS template with filename for relative includes
      const renderedMjml = ejs.render(templateContent, templateContext, {
        filename: resolvedPath,
      });

      // Convert MJML to HTML
      const mjmlResult = mjml(renderedMjml);
      
      if (mjmlResult.errors && mjmlResult.errors.length > 0) {
        console.warn('MJML rendering warnings:', mjmlResult.errors);
      }

      // Create plain text version by stripping HTML tags
      const text = mjmlResult.html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        html: mjmlResult.html,
        text,
      };
    } catch (error) {
      console.error('Template rendering error:', error);
      // Don't fall back - let the error propagate so email sending fails
      throw error;
    }
  }

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

    console.log(
      '[DEBUG] EmailSenderService about to call mailerService.sendMail',
    );
    try {
      // Get tenant config if tenantId is provided
      let tenantConfig = {};
      if (options.tenantId) {
        tenantConfig = this.tenantService.getTenantConfig(options.tenantId);
      }

      let html = options.html;
      let text = options.text;

      // If templatePath is provided, render the MJML template
      if (options.templatePath && options.context) {
        console.log('[DEBUG] Rendering MJML template:', options.templatePath);
        const rendered = await this.renderTemplate(
          options.templatePath,
          options.context,
          tenantConfig,
        );
        html = rendered.html;
        text = rendered.text;
        console.log('[DEBUG] Template rendered successfully');
      }

      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        text,
        html,
        from: options.from
          ? `${options.from.name} <${options.from.email}>`
          : undefined,
      });
      console.log(
        '[DEBUG] EmailSenderService.sendEmail completed - email sent to mailer',
      );
    } catch (error) {
      console.error('[DEBUG] EmailSenderService.sendMail failed:', error);
      throw error;
    }

    // TODO: Return actual message ID from mailer service
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
