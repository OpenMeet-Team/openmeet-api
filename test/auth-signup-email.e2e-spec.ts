import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
  TESTING_TENANT_ID,
} from './utils/constants';

describe('Auth Signup Email (e2e)', () => {
  const app = TESTING_APP_URL;
  const mail = `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}`;
  let serverApp: any;
  let serverEmail: any;

  beforeAll(async () => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
    serverEmail = request.agent(mail);

    // Clear MailDev emails before starting
    await clearMailDevEmails();
  });

  beforeEach(async () => {
    // Clear emails before each test
    await clearMailDevEmails();
  });

  describe('User Registration with Email', () => {
    it('should send signup email when user registers', async () => {
      const uniqueEmail = `test-${Date.now()}@openmeet.net`;
      const registrationData = {
        firstName: 'Test',
        lastName: 'User',
        email: uniqueEmail,
        password: 'TestPassword123!',
      };

      // Register a new user
      const response = await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.firstName).toBe('Test');
      expect(response.body.user.lastName).toBe('User');

      // Wait a bit for the email to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check MailDev for the signup email
      const emails = await getMailDevEmails();
      expect(emails.length).toBeGreaterThan(0);

      // Find the signup email
      const signupEmail = emails.find((email: any) => 
        email.to.some((recipient: any) => recipient.address === uniqueEmail) &&
        email.subject.includes('Confirm your email')
      );

      expect(signupEmail).toBeDefined();
      expect(signupEmail.subject).toBe('Confirm your email');
      expect(signupEmail.to[0].address).toBe(uniqueEmail);

      // Verify email content structure
      expect(signupEmail.html).toContain('Welcome to');
      expect(signupEmail.html).toContain('/auth/confirm-email/');
      
      // Verify text content as fallback (should be clean text without CSS)
      expect(signupEmail.text).toContain('Welcome to OpenMeet!');
      expect(signupEmail.text).toContain('/auth/confirm-email/');
      expect(signupEmail.text).not.toContain('<'); // No HTML tags
      expect(signupEmail.text).not.toMatch(/(style=|class=)/); // No CSS

      // Verify the email contains a valid confirmation hash
      const confirmationLinkMatch = signupEmail.html.match(/\/auth\/confirm-email\/([a-zA-Z0-9.-]+)/);
      expect(confirmationLinkMatch).toBeTruthy();
      expect(confirmationLinkMatch[1]).toMatch(/^[a-zA-Z0-9.-]+$/);
    });

    it('should format signup email with proper MJML template', async () => {
      const uniqueEmail = `template-test-${Date.now()}@openmeet.net`;
      const registrationData = {
        firstName: 'Template',
        lastName: 'Test',
        email: uniqueEmail,
        password: 'TestPassword123!',
      };

      // Register a new user
      await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(201);

      // Wait for email processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const emails = await getMailDevEmails();
      const signupEmail = emails.find((email: any) => 
        email.to.some((recipient: any) => recipient.address === uniqueEmail)
      );

      expect(signupEmail).toBeDefined();

      // Verify MJML template is being used (should have proper HTML structure)
      expect(signupEmail.html).toContain('<table'); // MJML generates tables
      expect(signupEmail.html).toContain('email'); // Should contain email-related content
      
      // Verify template context variables are populated
      expect(signupEmail.html).toContain('Welcome to OpenMeet');
      // Verify professional email styling (MJML should generate proper CSS)
      expect(signupEmail.html).toMatch(/(style=|class=)/); // Should have styling
    });

    it('should not send duplicate emails for same user registration', async () => {
      const uniqueEmail = `duplicate-test-${Date.now()}@openmeet.net`;
      const registrationData = {
        firstName: 'Duplicate',
        lastName: 'Test',
        email: uniqueEmail,
        password: 'TestPassword123!',
      };

      // Register user first time
      await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(201);

      // Wait for first email
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to register same email again (should fail)
      await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(422); // Should return validation error

      // Wait a bit more to ensure no duplicate emails
      await new Promise(resolve => setTimeout(resolve, 1000));

      const emails = await getMailDevEmails();
      const signupEmails = emails.filter((email: any) => 
        email.to.some((recipient: any) => recipient.address === uniqueEmail) &&
        email.subject.includes('Confirm your email')
      );

      // Should only have one signup email
      expect(signupEmails.length).toBe(1);
    });

    it('should handle tenant-specific signup emails', async () => {
      const uniqueEmail = `tenant-test-${Date.now()}@openmeet.net`;
      const registrationData = {
        firstName: 'Tenant',
        lastName: 'Test',
        email: uniqueEmail,
        password: 'TestPassword123!',
      };

      // Register with specific tenant (assuming default tenant)
      await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const emails = await getMailDevEmails();
      const signupEmail = emails.find((email: any) => 
        email.to.some((recipient: any) => recipient.address === uniqueEmail)
      );

      expect(signupEmail).toBeDefined();
      
      // Verify email is sent even with tenant context
      expect(signupEmail.subject).toBe('Confirm your email');
      expect(signupEmail.html).toContain('Welcome to OpenMeet');
    });
  });

  describe('Email Content Validation', () => {
    it('should include all required email elements', async () => {
      const uniqueEmail = `content-test-${Date.now()}@openmeet.net`;
      const registrationData = {
        firstName: 'Content',
        lastName: 'Test',
        email: uniqueEmail,
        password: 'TestPassword123!',
      };

      await serverApp
        .post('/api/v1/auth/email/register')
        .send(registrationData)
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const emails = await getMailDevEmails();
      const signupEmail = emails.find((email: any) => 
        email.to.some((recipient: any) => recipient.address === uniqueEmail)
      );

      expect(signupEmail).toBeDefined();

      // Required elements checklist for HTML
      const requiredHtmlElements = [
        'Welcome to OpenMeet',
        'Activate Account',
        'If you didn\'t request',
      ];

      requiredHtmlElements.forEach(element => {
        expect(signupEmail.html).toContain(element);
      });

      // Required elements checklist for plain text (different wording)
      const requiredTextElements = [
        'Welcome to OpenMeet!',
        '/auth/confirm-email/',
        'If you didn\'t request this activation',
      ];

      requiredTextElements.forEach(element => {
        expect(signupEmail.text).toContain(element);
      });

      // Ensure text version is clean (no HTML/CSS)
      expect(signupEmail.text).not.toContain('<');
      expect(signupEmail.text).not.toMatch(/(style=|class=)/);
    });
  });

  // Helper functions for MailDev integration
  async function getMailDevEmails(): Promise<any[]> {
    try {
      const response = await fetch('http://localhost:1080/email');
      if (!response.ok) {
        throw new Error(`MailDev API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('Could not fetch emails from MailDev:', error.message);
      return [];
    }
  }

  async function clearMailDevEmails(): Promise<void> {
    try {
      const response = await fetch('http://localhost:1080/email/all', {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.warn(`Failed to clear MailDev emails: ${response.status}`);
      }
    } catch (error) {
      console.warn('Could not clear MailDev emails:', error.message);
    }
  }
});