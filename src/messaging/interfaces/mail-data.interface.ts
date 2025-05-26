export interface MailData<T = any> {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  template?: string;
  context?: T;
  templatePath?: string;
  data?: T; // For backward compatibility with old mail service
}
