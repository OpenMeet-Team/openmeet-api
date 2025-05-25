import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AllConfigType } from '../config/config.type';

export interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

@Injectable()
export class MailerService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService<AllConfigType>) {
    // Use development SMTP settings from environment or defaults for maildev
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'localhost',
      port: parseInt(process.env.MAIL_PORT || '1025'),
      secure: false, // true for 465, false for other ports
      auth: process.env.MAIL_USER
        ? {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
          }
        : null,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async sendMail(options: MailOptions): Promise<any> {
    const from = options.from || process.env.MAIL_FROM || 'noreply@openmeet.net';

    return this.transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }
}