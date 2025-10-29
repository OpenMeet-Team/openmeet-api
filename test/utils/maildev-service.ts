import { TESTING_MAIL_HOST, TESTING_MAIL_PORT } from './constants';

/**
 * MailDev email interface
 */
export interface MailDevEmail {
  to: Array<{ address: string; name?: string }>;
  from: Array<{ address: string; name?: string }>;
  subject: string;
  html: string;
  text: string;
  date: string;
  attachments?: Array<{
    contentType: string;
    filename: string;
    content: string;
  }>;
}

/**
 * Shared MailDev service helper for E2E tests
 * Provides methods to interact with MailDev's REST API
 */
export const mailDevService = {
  /**
   * Get all emails from MailDev
   */
  async getEmails(): Promise<MailDevEmail[]> {
    try {
      const response = await fetch(
        `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email`,
      );
      if (!response.ok) return [];
      return response.json();
    } catch (error) {
      console.log('MailDev not available, returning empty emails');
      return [];
    }
  },

  /**
   * Get emails sent since a specific timestamp
   * @param timestamp - Unix timestamp in milliseconds
   * @param bufferTime - Buffer time in milliseconds (default: 5000ms)
   */
  async getEmailsSince(
    timestamp: number,
    bufferTime: number = 5000,
  ): Promise<MailDevEmail[]> {
    const emails = await mailDevService.getEmails();
    return emails.filter((email) => {
      const emailDate = new Date(email.date).getTime();
      return emailDate >= timestamp - bufferTime;
    });
  },

  /**
   * Get all emails sent to a specific recipient
   * @param emailAddress - Recipient email address
   */
  async getEmailsByRecipient(
    emailAddress: string,
  ): Promise<MailDevEmail[]> {
    const emails = await mailDevService.getEmails();
    return emails.filter((email) =>
      email.to?.some(
        (recipient) =>
          recipient.address.toLowerCase() === emailAddress.toLowerCase(),
      ),
    );
  },

  /**
   * Get the most recent email for a recipient
   * @param emailAddress - Recipient email address
   */
  async getMostRecentEmailByRecipient(
    emailAddress: string,
  ): Promise<MailDevEmail | null> {
    const emails = await mailDevService.getEmailsByRecipient(emailAddress);
    if (emails.length === 0) return null;

    // Sort by date descending and return first
    return emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )[0];
  },

  /**
   * Get ICS calendar attachment from an email
   * @param email - MailDev email object
   */
  getIcsAttachment(email: MailDevEmail) {
    return email.attachments?.find(
      (att) =>
        att.contentType === 'text/calendar' ||
        att.contentType === 'application/ics' ||
        att.contentType?.includes('text/calendar') ||
        att.contentType?.includes('ics'),
    );
  },

  /**
   * Clear all emails from MailDev
   * Useful for test cleanup
   */
  async clearEmails(): Promise<void> {
    try {
      await fetch(`http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email/all`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.log('Failed to clear MailDev emails:', error);
    }
  },
};
