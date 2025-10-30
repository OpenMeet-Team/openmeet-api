import { MailDevEmail } from './maildev-service';

/**
 * Email verification test helpers
 * Utilities for testing email verification flows
 */
export class EmailVerificationTestHelpers {
  /**
   * Extract 6-digit verification code from email HTML or text content
   * @param email - MailDev email object
   * @returns The 6-digit code or null if not found
   */
  static extractVerificationCode(email: MailDevEmail): string | null {
    // Try HTML first
    const htmlMatch = email.html?.match(/\b\d{6}\b/);
    if (htmlMatch) {
      return htmlMatch[0];
    }

    // Fallback to text
    const textMatch = email.text?.match(/\b\d{6}\b/);
    if (textMatch) {
      return textMatch[0];
    }

    return null;
  }

  /**
   * Get the most recent email for a recipient from a list of emails
   * @param emails - Array of MailDev emails
   * @param recipient - Recipient email address
   * @returns Most recent email or null if not found
   */
  static getMostRecentEmail(
    emails: MailDevEmail[],
    recipient: string,
  ): MailDevEmail | null {
    const recipientEmails = emails
      .filter((email) =>
        email.to?.some(
          (to) => to.address.toLowerCase() === recipient.toLowerCase(),
        ),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return recipientEmails[0] || null;
  }

  /**
   * Assert that an email contains a valid 6-digit verification code
   * @param email - MailDev email object
   * @throws Error if no valid code found
   */
  static assertHasVerificationCode(email: MailDevEmail): void {
    const code = this.extractVerificationCode(email);
    if (!code) {
      throw new Error(
        `Expected email to contain 6-digit verification code. Subject: "${email.subject}"`,
      );
    }
    if (!/^\d{6}$/.test(code)) {
      throw new Error(
        `Expected code to be 6 digits, got: "${code}". Subject: "${email.subject}"`,
      );
    }
  }

  /**
   * Assert that an email's subject contains specific text (case-insensitive)
   * @param email - MailDev email object
   * @param expectedText - Text that should appear in subject
   * @throws Error if text not found
   */
  static assertSubjectContains(
    email: MailDevEmail,
    expectedText: string,
  ): void {
    if (!email.subject.toLowerCase().includes(expectedText.toLowerCase())) {
      throw new Error(
        `Expected email subject to contain "${expectedText}". Got: "${email.subject}"`,
      );
    }
  }

  /**
   * Assert that an email was sent to a specific recipient
   * @param email - MailDev email object
   * @param expectedRecipient - Expected recipient email address
   * @throws Error if recipient doesn't match
   */
  static assertSentTo(email: MailDevEmail, expectedRecipient: string): void {
    const hasRecipient = email.to?.some(
      (to) => to.address.toLowerCase() === expectedRecipient.toLowerCase(),
    );

    if (!hasRecipient) {
      const actualRecipients = email.to?.map((to) => to.address).join(', ');
      throw new Error(
        `Expected email to be sent to "${expectedRecipient}". Actually sent to: ${actualRecipients}`,
      );
    }
  }

  /**
   * Wait for an email to arrive (useful for async email sending)
   * @param getEmailsFn - Function that retrieves emails
   * @param predicate - Function to test if the desired email arrived
   * @param timeout - Maximum wait time in milliseconds (default: 10000)
   * @param pollInterval - How often to check in milliseconds (default: 500)
   * @returns The matching email
   * @throws Error if timeout reached
   */
  static async waitForEmail(
    getEmailsFn: () => Promise<MailDevEmail[]>,
    predicate: (email: MailDevEmail) => boolean,
    timeout: number = 10000,
    pollInterval: number = 500,
  ): Promise<MailDevEmail> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const emails = await getEmailsFn();
      const matchingEmail = emails.find(predicate);

      if (matchingEmail) {
        return matchingEmail;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Timeout waiting for email after ${timeout}ms. Check that MailDev is running and emails are being sent.`,
    );
  }

  /**
   * Extract all 6-digit codes from email (in case multiple codes present)
   * @param email - MailDev email object
   * @returns Array of all 6-digit codes found
   */
  static extractAllCodes(email: MailDevEmail): string[] {
    const codes: string[] = [];

    // Extract from HTML using match() instead of matchAll() to avoid downlevelIteration requirement
    const htmlMatches = email.html?.match(/\b\d{6}\b/g);
    if (htmlMatches) {
      codes.push(...htmlMatches);
    }

    // Extract from text
    const textMatches = email.text?.match(/\b\d{6}\b/g);
    if (textMatches) {
      // Only add codes not already found in HTML
      for (const match of textMatches) {
        if (!codes.includes(match)) {
          codes.push(match);
        }
      }
    }

    return codes;
  }
}
