import * as request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
} from './utils/constants';

describe('Group Admin Messaging API (e2e)', () => {
  let mailDevService: any;
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;

  beforeAll(() => {
    // Set up server app agent with tenant
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Set up MailDev service helper (gracefully handle if not available)
    mailDevService = {
      getEmails: async () => {
        try {
          const response = await fetch(
            `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email`,
          );
          if (!response.ok) return [];
          return response.json();
        } catch {
          console.log('MailDev not available, returning empty emails');
          return [];
        }
      },
      getEmailsSince: async (timestamp: number) => {
        const emails = await mailDevService.getEmails();
        // Give some buffer time (5 seconds before) to account for timing differences
        const bufferTime = 5000;
        return emails.filter((email: any) => {
          const emailDate = new Date(email.date).getTime();
          return emailDate >= timestamp - bufferTime;
        });
      },
      getEmailsBySubject: async (subjectPattern: string) => {
        const emails = await mailDevService.getEmails();
        return emails.filter((email: any) =>
          email.subject?.includes(subjectPattern),
        );
      },
      getEmailsByRecipient: async (emailAddress: string) => {
        const emails = await mailDevService.getEmails();
        return emails.filter((email: any) =>
          email.to?.some(
            (recipient: any) => recipient.address === emailAddress,
          ),
        );
      },
    };
  });

  beforeEach(() => {
    // Each test will record its own start time instead of clearing emails
  });

  describe('Admin Messaging API Endpoints', () => {
    let adminUser: any;
    let adminToken: string;
    let testGroup: any;
    const memberUsers: any[] = [];
    const memberTokens: string[] = [];

    beforeAll(async () => {
      const timestamp = Date.now();

      // Create admin user
      const adminEmail = `admin-api-test-${timestamp}@example.com`;
      const adminResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: adminEmail,
          password: 'password123',
          firstName: 'Admin',
          lastName: 'User',
        })
        .expect(201);

      adminToken = adminResponse.body.token;
      adminUser = adminResponse.body.user;
      adminUser.email = adminEmail;

      // Create a test group with admin as owner
      const groupData = {
        name: 'Admin API Test Group',
        description: 'A group to test admin messaging API endpoints',
        slug: `admin-api-group-${timestamp}`,
        maxMembers: 50,
      };

      const groupResponse = await serverApp
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(groupData)
        .expect(201);

      testGroup = groupResponse.body;

      // Create 3 member users
      for (let i = 1; i <= 3; i++) {
        const memberEmail = `member${i}-api-test-${timestamp}@example.com`;
        const memberResponse = await serverApp
          .post('/api/v1/auth/email/register')
          .send({
            email: memberEmail,
            password: 'password123',
            firstName: `Member${i}`,
            lastName: 'User',
          })
          .expect(201);

        const memberToken = memberResponse.body.token;
        const memberUser = memberResponse.body.user;
        memberUser.email = memberEmail;

        memberUsers.push(memberUser);
        memberTokens.push(memberToken);

        // Each member joins the group
        const joinResponse = await serverApp
          .post(`/api/groups/${testGroup.slug}/join`)
          .set('Authorization', `Bearer ${memberToken}`)
          .expect(201);

        const membershipId = joinResponse.body.id;

        // Admin approves the member (required for messaging)
        await serverApp
          .post(`/api/groups/${testGroup.slug}/members/${membershipId}/approve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(201);
      }

      console.log('API test setup complete:', {
        adminEmail: adminUser.email,
        groupSlug: testGroup.slug,
        memberEmails: memberUsers.map((u) => u.email),
      });
    }, 30000);

    describe('POST /:slug/admin-message', () => {
      it('should send admin message to all group members', async () => {
        console.log('\\n=== Testing POST /api/groups/:slug/admin-message ===');

        const messageStartTime = Date.now();

        const messageData = {
          subject: 'API Test: Important Group Announcement',
          message:
            'Hello everyone,\\n\\nThis is a test of our admin messaging API.\\n\\nBest regards,\\nAPI Test Admin',
        };

        // Send admin message via API
        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(messageData)
          .expect(201);

        console.log('API response:', {
          success: response.body.success,
          deliveredCount: response.body.deliveredCount,
          failedCount: response.body.failedCount,
          messageId: response.body.messageId,
        });

        // Verify API response
        expect(response.body.success).toBe(true);
        expect(response.body.deliveredCount).toBe(4); // All 3 members + admin should receive email
        expect(response.body.failedCount).toBe(0);
        expect(response.body.messageId).toBeDefined();

        // Wait for emails to be processed
        console.log('Waiting for emails to be delivered...');
        let emailsFound = 0;
        for (let attempt = 1; attempt <= 10; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          const recentEmails =
            await mailDevService.getEmailsSince(messageStartTime);
          emailsFound = recentEmails.length;

          console.log(`Attempt ${attempt}: Found ${emailsFound} recent emails`);

          if (emailsFound >= 4) {
            break;
          }
        }

        // Verify emails were sent via MailDev
        const recentEmails =
          await mailDevService.getEmailsSince(messageStartTime);
        const adminMessageEmails = recentEmails.filter((email: any) =>
          email.subject?.includes(messageData.subject),
        );

        console.log('Admin message emails found:', {
          count: adminMessageEmails.length,
          recipients: adminMessageEmails.map(
            (email: any) => email.to?.[0]?.address,
          ),
        });

        // Should have exactly 4 emails (one for each member + admin)
        expect(adminMessageEmails.length).toBe(4);

        // Verify each member received the email
        for (const memberUser of memberUsers) {
          const memberEmail = adminMessageEmails.find((email: any) =>
            email.to?.some(
              (recipient: any) => recipient.address === memberUser.email,
            ),
          );

          expect(memberEmail).toBeDefined();
          expect(memberEmail.subject).toBe(
            `[${testGroup.name}] ${messageData.subject}`,
          );
          expect(memberEmail.html).toContain(adminUser.firstName);
          expect(memberEmail.html).toContain(testGroup.name);

          console.log(`✅ Email verified for member: ${memberUser.email}`);
        }

        console.log('✅ Admin message API test passed');
      }, 15000);

      it('should require authentication', async () => {
        const messageData = {
          subject: 'Test Subject',
          message: 'Test message',
        };

        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .send(messageData)
          .expect(401);
      });

      it('should require admin permissions', async () => {
        // Use a member token (not admin)
        const memberToken = memberTokens[0];
        const messageData = {
          subject: 'Test Subject',
          message: 'Test message',
        };

        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send(messageData)
          .expect(403); // Forbidden - insufficient permissions
      });

      it('should validate input data', async () => {
        // Test missing subject
        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            message: 'Test message without subject',
          })
          .expect(422);

        // Test missing message
        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            subject: 'Test subject without message',
          })
          .expect(422);

        // Test subject too long
        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            subject: 'x'.repeat(201), // Exceeds 200 char limit
            message: 'Test message',
          })
          .expect(422);
      });

      it('should send admin message to specific users when targetUserIds provided', async () => {
        console.log('\n=== Testing targeted messaging with targetUserIds ===');

        const messageStartTime = Date.now();

        // Target only the first 2 members
        const targetUserIds = [memberUsers[0].id, memberUsers[1].id];
        const messageData = {
          subject: 'Targeted Message Test',
          message: 'This message should only go to specific members.',
          targetUserIds: targetUserIds,
        };

        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(messageData)
          .expect(201);

        // Verify response structure
        expect(response.body.success).toBe(true);
        expect(response.body.deliveredCount).toBe(3); // 2 targeted members + 1 admin copy
        expect(response.body.failedCount).toBe(0);
        expect(response.body.messageId).toBeDefined();

        // Wait a moment for emails to be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check emails in MailDev
        const emails = await mailDevService.getEmailsSince(messageStartTime);
        const targetedEmails = emails.filter((email: any) =>
          email.subject?.includes('Targeted Message Test'),
        );

        console.log(`Found ${targetedEmails.length} targeted emails`);

        // Should have emails for admin + 2 targeted members only
        expect(targetedEmails.length).toBe(3);

        // Verify recipients
        const recipients = targetedEmails.flatMap((email: any) =>
          email.to.map((to: any) => to.address),
        );

        expect(recipients).toContain(adminUser.email);
        expect(recipients).toContain(memberUsers[0].email);
        expect(recipients).toContain(memberUsers[1].email);
        expect(recipients).not.toContain(memberUsers[2].email); // Should not get email

        console.log('✓ Targeted messaging working correctly');
      }, 15000);

      it('should handle empty targetUserIds array by sending to all members', async () => {
        const messageStartTime = Date.now();

        const messageData = {
          subject: 'Empty Array Test',
          message: 'This should go to all members when targetUserIds is empty.',
          targetUserIds: [],
        };

        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(messageData)
          .expect(201);

        // Should behave like normal admin message (all members + admin)
        expect(response.body.deliveredCount).toBe(4); // 3 members + 1 admin

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const emails = await mailDevService.getEmailsSince(messageStartTime);
        const allMemberEmails = emails.filter((email: any) =>
          email.subject?.includes('Empty Array Test'),
        );

        expect(allMemberEmails.length).toBe(4); // All members + admin
      }, 15000);

      it('should validate targetUserIds are valid group members', async () => {
        const messageData = {
          subject: 'Invalid Users Test',
          message: 'This should fail.',
          targetUserIds: [999, 1000], // Non-existent user IDs
        };

        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(messageData)
          .expect(404); // Should fail with not found

        expect(response.body.message).toContain('No members found');
      });
    });

    describe('POST /:slug/admin-message/preview', () => {
      it('should send preview email to test address', async () => {
        console.log(
          '\\n=== Testing POST /api/groups/:slug/admin-message/preview ===',
        );

        const previewStartTime = Date.now();

        const previewData = {
          subject: 'Preview Test Subject',
          message: 'This is a preview of the admin message.',
          testEmail: 'preview-test@example.com',
        };

        // Send preview via API
        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message/preview`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(previewData)
          .expect(201);

        expect(response.body.message).toBe('Preview email sent successfully');

        // Wait for preview email
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const recentEmails =
          await mailDevService.getEmailsSince(previewStartTime);
        const previewEmails = recentEmails.filter(
          (email: any) =>
            email.subject?.includes('[PREVIEW]') &&
            email.to?.[0]?.address === previewData.testEmail,
        );
        console.log(
          `Preview emails found: ${previewEmails.length} (out of ${recentEmails.length} recent emails)`,
        );

        // Should have exactly 1 preview email
        expect(previewEmails.length).toBe(1);

        const previewEmail = previewEmails[0];
        expect(previewEmail.to[0].address).toBe(previewData.testEmail);
        expect(previewEmail.subject).toBe(
          `[${testGroup.name}] [PREVIEW] ${previewData.subject}`,
        );
        expect(previewEmail.html).toContain(adminUser.firstName);
        expect(previewEmail.html).toContain(testGroup.name);

        // Verify plain text version exists
        expect(previewEmail.text).toBeDefined();
        expect(previewEmail.text).toContain(adminUser.firstName);
        expect(previewEmail.text).toContain(testGroup.name);

        // Verify no preview emails sent to actual group members
        for (const memberUser of memberUsers) {
          const memberPreviewEmails = recentEmails.filter(
            (email: any) =>
              email.subject?.includes('[PREVIEW]') &&
              email.to?.some(
                (recipient: any) => recipient.address === memberUser.email,
              ),
          );
          expect(memberPreviewEmails.length).toBe(0);
        }

        console.log('✅ Preview API test passed');
      }, 15000);

      it('should require valid email format for testEmail', async () => {
        const previewData = {
          subject: 'Test Subject',
          message: 'Test message',
          testEmail: 'invalid-email-format',
        };

        await serverApp
          .post(`/api/groups/${testGroup.slug}/admin-message/preview`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(previewData)
          .expect(422);
      });
    });

    describe('POST /:slug/contact-admins', () => {
      it('should allow member to contact group admins', async () => {
        console.log('\n=== Testing POST /api/groups/:slug/contact-admins ===');

        const contactStartTime = Date.now();
        const memberToken = memberTokens[0]; // Use first member
        const memberUser = memberUsers[0];

        const contactData = {
          subject: 'Question about group events',
          message:
            'Hi admins,\n\nI have a question about the upcoming events.\n\nThanks!',
          contactType: 'question',
        };

        const response = await serverApp
          .post(`/api/groups/${testGroup.slug}/contact-admins`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send(contactData)
          .expect(201);

        // Verify response structure
        expect(response.body.success).toBe(true);
        expect(response.body.deliveredCount).toBe(1); // 1 admin gets notification
        expect(response.body.failedCount).toBe(0);
        expect(response.body.messageId).toBeDefined();
        expect(response.body.messageId).toMatch(/^member_contact_/);

        // Wait for emails to be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check emails in MailDev
        const emails = await mailDevService.getEmailsSince(contactStartTime);
        const contactEmails = emails.filter((email: any) =>
          email.subject?.includes(
            'Member question - Question about group events',
          ),
        );

        console.log(`Found ${contactEmails.length} member contact emails`);

        expect(contactEmails.length).toBe(1); // Admin should get notification

        const contactEmail = contactEmails[0];
        expect(contactEmail.to[0].address).toBe(adminUser.email);
        expect(contactEmail.html).toContain(memberUser.firstName);
        expect(contactEmail.html).toContain(memberUser.lastName);
        expect(contactEmail.html).toContain('question');
        expect(contactEmail.html).toContain('Question about group events');
        expect(contactEmail.html).toContain(
          'I have a question about the upcoming events',
        );
        // Verify email address is NOT exposed for security
        expect(contactEmail.html).not.toContain(memberUser.email);
        // Verify safe reply instructions are included
        expect(contactEmail.html).toContain('View Group Members');

        // Verify plain text version exists and is secure
        expect(contactEmail.text).toBeDefined();
        expect(contactEmail.text).toContain(memberUser.firstName);
        expect(contactEmail.text).toContain(memberUser.lastName);
        expect(contactEmail.text).not.toContain(memberUser.email);
        expect(contactEmail.text).toContain('View Group Members');

        console.log('✓ Member contact functionality working correctly');
      }, 15000);

      it('should handle different contact types', async () => {
        const contactTypes = ['question', 'report', 'feedback'];

        for (const contactType of contactTypes) {
          const contactStartTime = Date.now();
          const memberToken = memberTokens[1]; // Use second member

          const contactData = {
            subject: `Test ${contactType}`,
            message: `This is a test ${contactType} message.`,
            contactType: contactType,
          };

          const response = await serverApp
            .post(`/api/groups/${testGroup.slug}/contact-admins`)
            .set('Authorization', `Bearer ${memberToken}`)
            .send(contactData)
            .expect(201);

          expect(response.body.success).toBe(true);

          // Wait for email processing
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Verify email subject includes contact type
          const emails = await mailDevService.getEmailsSince(contactStartTime);
          const typeEmails = emails.filter((email: any) =>
            email.subject?.includes(
              `Member ${contactType} - Test ${contactType}`,
            ),
          );

          expect(typeEmails.length).toBe(1);

          console.log(`✓ Contact type '${contactType}' working`);
        }
      }, 20000);

      it('should require authentication for member contact', async () => {
        const contactData = {
          subject: 'Test Subject',
          message: 'Test message',
          contactType: 'question',
        };

        await serverApp
          .post(`/api/groups/${testGroup.slug}/contact-admins`)
          .send(contactData)
          .expect(401); // Unauthorized
      });

      it('should validate contact input data', async () => {
        const memberToken = memberTokens[0];

        // Test missing subject
        await serverApp
          .post(`/api/groups/${testGroup.slug}/contact-admins`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            message: 'Test message',
            contactType: 'question',
          })
          .expect(422);

        // Test invalid contact type
        await serverApp
          .post(`/api/groups/${testGroup.slug}/contact-admins`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            subject: 'Test Subject',
            message: 'Test message',
            contactType: 'invalid_type',
          })
          .expect(422);

        // Test message too long
        await serverApp
          .post(`/api/groups/${testGroup.slug}/contact-admins`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            subject: 'Test Subject',
            message: 'x'.repeat(5001), // Exceeds 5000 char limit
            contactType: 'question',
          })
          .expect(422);
      });

      it('should handle non-existent group for member contact', async () => {
        const memberToken = memberTokens[0];

        const contactData = {
          subject: 'Test Subject',
          message: 'Test message',
          contactType: 'question',
        };

        await serverApp
          .post('/api/groups/non-existent-group/contact-admins')
          .set('Authorization', `Bearer ${memberToken}`)
          .send(contactData)
          .expect(403); // Forbidden - security: don't leak info about non-existent groups
      });
    });
  });

  describe('API Security and Edge Cases', () => {
    it('should handle non-existent group', async () => {
      const timestamp = Date.now();
      const adminEmail = `security-admin-${timestamp}@example.com`;
      const adminResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: adminEmail,
          password: 'password123',
          firstName: 'Security',
          lastName: 'Admin',
        })
        .expect(201);

      const adminToken = adminResponse.body.token;

      const messageData = {
        subject: 'Test Subject',
        message: 'Test message',
      };

      await serverApp
        .post('/api/groups/non-existent-group/admin-message')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(messageData)
        .expect(403); // Forbidden - permission check happens first
    });

    it('should provide proper API documentation', async () => {
      // Test that endpoints are properly documented in OpenAPI/Swagger
      const docsResponse = await serverApp.get('/docs-json').expect(200);

      const apiDocs = docsResponse.body;

      // Check that our admin messaging endpoints are documented
      expect(apiDocs.paths['/api/groups/{slug}/admin-message']).toBeDefined();
      expect(
        apiDocs.paths['/api/groups/{slug}/admin-message/preview'],
      ).toBeDefined();

      console.log('✅ API documentation verification passed');
    });
  });
});
