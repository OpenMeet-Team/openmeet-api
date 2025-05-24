/**
 * Interface for email sending to allow dependency inversion
 * This allows messaging system to be independent of specific email implementations
 */
export interface IEmailSender {
  sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    templatePath?: string;
    context?: any;
    from?: { name: string; email: string };
  }): Promise<string | void>;
}

export const EMAIL_SENDER_TOKEN = 'EMAIL_SENDER';