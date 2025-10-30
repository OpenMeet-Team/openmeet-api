import { EmailVerificationTestHelpers } from './email-verification-helpers';
import { MailDevEmail } from './maildev-service';

describe('EmailVerificationTestHelpers', () => {
  // Mock email factory
  const createMockEmail = (
    overrides: Partial<MailDevEmail> = {},
  ): MailDevEmail => ({
    to: [{ address: 'test@example.com' }],
    from: [{ address: 'noreply@openmeet.net' }],
    subject: 'Test Email',
    html: '<p>Test content</p>',
    text: 'Test content',
    date: new Date().toISOString(),
    ...overrides,
  });

  describe('extractVerificationCode', () => {
    it('should extract 6-digit code from HTML content', () => {
      const email = createMockEmail({
        html: '<p>Your verification code is <strong>123456</strong></p>',
        text: 'Your verification code is 123456',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBe('123456');
    });

    it('should extract 6-digit code from text content when HTML has no code', () => {
      const email = createMockEmail({
        html: '<p>Please verify your email</p>',
        text: 'Your code: 789012',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBe('789012');
    });

    it('should return null when no 6-digit code found', () => {
      const email = createMockEmail({
        html: '<p>No code here</p>',
        text: 'No code here',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBeNull();
    });

    it('should not match codes with less than 6 digits', () => {
      const email = createMockEmail({
        html: '<p>Code: 12345</p>',
        text: 'Code: 12345',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBeNull();
    });

    it('should not match codes with more than 6 digits', () => {
      const email = createMockEmail({
        html: '<p>Code: 1234567</p>',
        text: 'Code: 1234567',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBeNull();
    });

    it('should extract first 6-digit code when multiple present', () => {
      const email = createMockEmail({
        html: '<p>Code 111111 or maybe 222222</p>',
        text: 'Code 111111 or maybe 222222',
      });

      const code = EmailVerificationTestHelpers.extractVerificationCode(email);

      expect(code).toBe('111111');
    });
  });

  describe('getMostRecentEmail', () => {
    it('should return most recent email for recipient', () => {
      const emails: MailDevEmail[] = [
        createMockEmail({
          to: [{ address: 'user@example.com' }],
          date: '2025-01-01T10:00:00.000Z',
          subject: 'Old email',
        }),
        createMockEmail({
          to: [{ address: 'user@example.com' }],
          date: '2025-01-01T12:00:00.000Z',
          subject: 'Recent email',
        }),
        createMockEmail({
          to: [{ address: 'user@example.com' }],
          date: '2025-01-01T11:00:00.000Z',
          subject: 'Middle email',
        }),
      ];

      const mostRecent = EmailVerificationTestHelpers.getMostRecentEmail(
        emails,
        'user@example.com',
      );

      expect(mostRecent?.subject).toBe('Recent email');
    });

    it('should be case-insensitive for email addresses', () => {
      const emails: MailDevEmail[] = [
        createMockEmail({
          to: [{ address: 'User@Example.COM' }],
          date: new Date().toISOString(),
        }),
      ];

      const result = EmailVerificationTestHelpers.getMostRecentEmail(
        emails,
        'user@example.com',
      );

      expect(result).not.toBeNull();
    });

    it('should return null when no emails for recipient', () => {
      const emails: MailDevEmail[] = [
        createMockEmail({
          to: [{ address: 'other@example.com' }],
        }),
      ];

      const result = EmailVerificationTestHelpers.getMostRecentEmail(
        emails,
        'user@example.com',
      );

      expect(result).toBeNull();
    });

    it('should return null for empty email array', () => {
      const result = EmailVerificationTestHelpers.getMostRecentEmail(
        [],
        'user@example.com',
      );

      expect(result).toBeNull();
    });
  });

  describe('assertHasVerificationCode', () => {
    it('should not throw when email has valid 6-digit code', () => {
      const email = createMockEmail({
        html: '<p>Code: 123456</p>',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertHasVerificationCode(email);
      }).not.toThrow();
    });

    it('should throw when email has no code', () => {
      const email = createMockEmail({
        html: '<p>No code here</p>',
        text: 'No code here',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertHasVerificationCode(email);
      }).toThrow(/Expected email to contain 6-digit verification code/);
    });

    it('should throw when code is not 6 digits', () => {
      const email = createMockEmail({
        html: '<p>Code: 12345</p>',
        text: 'Code: 12345',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertHasVerificationCode(email);
      }).toThrow(/Expected email to contain 6-digit verification code/);
    });
  });

  describe('assertSubjectContains', () => {
    it('should not throw when subject contains expected text', () => {
      const email = createMockEmail({
        subject: 'Verify your email address',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSubjectContains(email, 'Verify');
      }).not.toThrow();
    });

    it('should be case-insensitive', () => {
      const email = createMockEmail({
        subject: 'Verify Your Email',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSubjectContains(email, 'verify');
      }).not.toThrow();
    });

    it('should throw when subject does not contain expected text', () => {
      const email = createMockEmail({
        subject: 'Welcome to OpenMeet',
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSubjectContains(email, 'Verify');
      }).toThrow(/Expected email subject to contain "Verify"/);
    });
  });

  describe('assertSentTo', () => {
    it('should not throw when email sent to expected recipient', () => {
      const email = createMockEmail({
        to: [{ address: 'user@example.com' }],
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSentTo(email, 'user@example.com');
      }).not.toThrow();
    });

    it('should be case-insensitive', () => {
      const email = createMockEmail({
        to: [{ address: 'User@Example.COM' }],
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSentTo(email, 'user@example.com');
      }).not.toThrow();
    });

    it('should throw when email sent to different recipient', () => {
      const email = createMockEmail({
        to: [{ address: 'other@example.com' }],
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSentTo(email, 'user@example.com');
      }).toThrow(/Expected email to be sent to "user@example.com"/);
    });

    it('should work with multiple recipients', () => {
      const email = createMockEmail({
        to: [
          { address: 'user1@example.com' },
          { address: 'user2@example.com' },
        ],
      });

      expect(() => {
        EmailVerificationTestHelpers.assertSentTo(email, 'user2@example.com');
      }).not.toThrow();
    });
  });

  describe('extractAllCodes', () => {
    it('should extract all 6-digit codes from email', () => {
      const email = createMockEmail({
        html: '<p>Primary: 111111, Backup: 222222</p>',
        text: 'Primary: 111111, Backup: 222222',
      });

      const codes = EmailVerificationTestHelpers.extractAllCodes(email);

      expect(codes).toContain('111111');
      expect(codes).toContain('222222');
    });

    it('should return empty array when no codes found', () => {
      const email = createMockEmail({
        html: '<p>No codes here</p>',
        text: 'No codes here',
      });

      const codes = EmailVerificationTestHelpers.extractAllCodes(email);

      expect(codes).toEqual([]);
    });

    it('should not duplicate codes found in both HTML and text', () => {
      const email = createMockEmail({
        html: '<p>Code: 123456</p>',
        text: 'Code: 123456',
      });

      const codes = EmailVerificationTestHelpers.extractAllCodes(email);

      expect(codes).toEqual(['123456']);
    });
  });

  describe('waitForEmail', () => {
    it('should return email when predicate matches', async () => {
      const mockGetEmails = jest
        .fn()
        .mockResolvedValue([createMockEmail({ subject: 'Test Email' })]);

      const email = await EmailVerificationTestHelpers.waitForEmail(
        mockGetEmails,
        (e) => e.subject === 'Test Email',
        5000,
        100,
      );

      expect(email.subject).toBe('Test Email');
    });

    it('should poll multiple times until email arrives', async () => {
      let callCount = 0;
      const mockGetEmails = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 3) {
          return Promise.resolve([
            createMockEmail({ subject: 'Delayed Email' }),
          ]);
        }
        return Promise.resolve([]);
      });

      const email = await EmailVerificationTestHelpers.waitForEmail(
        mockGetEmails,
        (e) => e.subject === 'Delayed Email',
        5000,
        100,
      );

      expect(email.subject).toBe('Delayed Email');
      expect(mockGetEmails).toHaveBeenCalledTimes(3);
    });

    it('should throw timeout error when email never arrives', async () => {
      const mockGetEmails = jest.fn().mockResolvedValue([]);

      await expect(
        EmailVerificationTestHelpers.waitForEmail(
          mockGetEmails,
          (e) => e.subject === 'Never Arrives',
          500, // Short timeout for test
          100,
        ),
      ).rejects.toThrow(/Timeout waiting for email/);
    });
  });
});
