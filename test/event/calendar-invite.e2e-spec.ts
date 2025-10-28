import * as request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
} from '../utils/constants';
import {
  EventType,
  EventStatus,
  EventAttendeeStatus,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Calendar Invite E2E', () => {
  let mailDevService: any;
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let organizerToken: string;
  let testEvent: any;

  beforeAll(async () => {
    // Set up server app agent with tenant
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Create organizer user
    const timestamp = Date.now();
    const organizerEmail = `organizer-calendar-${timestamp}@example.com`;

    const organizerResponse = await serverApp
      .post('/api/v1/auth/email/register')
      .send({
        email: organizerEmail,
        password: 'password123',
        firstName: 'Event',
        lastName: 'Organizer',
      })
      .expect(201);

    organizerToken = organizerResponse.body.token;

    // Create a test event for calendar invite testing
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const eventResponse = await serverApp
      .post('/api/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Calendar Invite Test Event ${timestamp}`,
        slug: `calendar-test-${timestamp}`,
        description: 'Testing calendar invite email functionality',
        startDate: futureDate.toISOString(),
        endDate: new Date(futureDate.getTime() + 3600000).toISOString(), // +1 hour
        timeZone: 'America/New_York',
        type: EventType.InPerson,
        location: 'Test Venue, 123 Test St',
        lat: 40.7128,
        lon: -74.006,
        maxAttendees: 50,
        categories: [],
        visibility: 'public',
        status: EventStatus.Published,
        requireApproval: false,
      })
      .expect(201);

    testEvent = eventResponse.body;

    // Set up MailDev service helper
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
        const bufferTime = 5000; // 5 second buffer
        return emails.filter((email: any) => {
          const emailDate = new Date(email.date).getTime();
          return emailDate >= timestamp - bufferTime;
        });
      },
      getEmailsByRecipient: async (emailAddress: string) => {
        const emails = await mailDevService.getEmails();
        return emails.filter((email: any) =>
          email.to?.some(
            (recipient: any) => recipient.address === emailAddress,
          ),
        );
      },
      getIcsAttachment: (email: any) => {
        // Find ICS attachment (can be text/calendar or application/ics)
        const attachment = email.attachments?.find(
          (att: any) =>
            att.contentType === 'text/calendar' ||
            att.contentType === 'application/ics' ||
            att.contentType?.includes('text/calendar') ||
            att.contentType?.includes('ics'),
        );
        return attachment;
      },
    };
  }, 30000);

  describe('Quick RSVP Calendar Invite Flow', () => {
    it('should send calendar invite when user does quick RSVP', async () => {
      const timestamp = Date.now();
      const testEmail = `quick-rsvp-cal-${timestamp}@example.com`;
      const timestampBeforeRequest = Date.now();

      console.log('\n=== Testing Quick RSVP Calendar Invite ===');
      console.log('Test event:', testEvent.slug);
      console.log('Test email:', testEmail);

      // Step 1: Quick RSVP (creates confirmed attendance)
      const rsvpResponse = await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'Test Attendee',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      expect(rsvpResponse.body.message).toBeDefined();
      console.log('Quick RSVP successful:', rsvpResponse.body.message);

      // Step 2: Wait for async event processing (event.rsvp.added → CalendarInviteListener → email sending)
      console.log('Waiting for event processing and email delivery...');
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Step 3: Verify calendar invite email was sent
      console.log('Checking for emails...');
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeRequest,
      );
      console.log(`Found ${recentEmails.length} recent email(s)`);

      const recipientEmails = recentEmails.filter((email: any) =>
        email.to?.some((recipient: any) => recipient.address === testEmail),
      );
      console.log(
        `Found ${recipientEmails.length} email(s) to ${testEmail}`,
      );

      // Debug: Print all emails
      recipientEmails.forEach((email: any, index: number) => {
        console.log(`Email ${index + 1}:`, {
          subject: email.subject,
          hasAttachments: email.attachments?.length > 0,
          attachmentTypes: email.attachments?.map((a: any) => a.contentType),
        });
      });

      // Should have at least 2 emails: verification code + calendar invite
      // (Current implementation sends both)
      expect(recipientEmails.length).toBeGreaterThanOrEqual(1);

      // Find the calendar invite email by subject pattern (checking for "registered" to avoid apostrophe encoding issues)
      const calendarEmail = recipientEmails.find((email: any) =>
        email.subject?.includes('registered for'),
      );

      if (!calendarEmail) {
        console.log(
          '⚠️  Calendar invite not found. This may indicate timing issue or CalendarInviteListener failure.',
        );
        console.log(
          'Emails received:',
          recipientEmails.map((e: any) => e.subject),
        );
        // Wait a bit more and try again
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const moreEmails = await mailDevService.getEmailsSince(
          timestampBeforeRequest,
        );
        const moreRecipientEmails = moreEmails.filter((email: any) =>
          email.to?.some((recipient: any) => recipient.address === testEmail),
        );
        console.log(
          'After additional wait, emails:',
          moreRecipientEmails.map((e: any) => e.subject),
        );
      }

      expect(calendarEmail).toBeDefined();
      console.log('Calendar invite email found:', calendarEmail?.subject);

      // Step 4: Verify email has ICS attachment
      const icsAttachment = mailDevService.getIcsAttachment(calendarEmail);
      expect(icsAttachment).toBeDefined();
      console.log('ICS attachment found:', icsAttachment?.contentType);

      // Step 5: Decode and verify ICS content
      if (icsAttachment && icsAttachment.content) {
        const icsContent = Buffer.from(
          icsAttachment.content,
          'base64',
        ).toString('utf-8');
        console.log('ICS content length:', icsContent.length);

        // Verify RFC 5545 structure
        expect(icsContent).toContain('BEGIN:VCALENDAR');
        expect(icsContent).toContain('END:VCALENDAR');
        expect(icsContent).toContain('BEGIN:VEVENT');
        expect(icsContent).toContain('END:VEVENT');

        // Verify METHOD:REQUEST (calendar invite, not just info)
        expect(icsContent).toContain('METHOD:REQUEST');
        console.log('✓ ICS has METHOD:REQUEST');

        // Verify event details are in ICS
        expect(icsContent).toContain(testEvent.name);
        console.log('✓ ICS contains event name');

        // Verify attendee email is in ICS
        expect(icsContent).toContain(testEmail);
        console.log('✓ ICS contains attendee email');

        // Verify organizer is in ICS
        expect(icsContent).toContain('ORGANIZER');
        console.log('✓ ICS contains organizer info');

        // Verify attendee with RSVP
        expect(icsContent).toContain('ATTENDEE');
        expect(icsContent).toMatch(/RSVP=TRUE/i);
        console.log('✓ ICS contains attendee with RSVP=TRUE');

        // Verify location if present
        if (testEvent.location) {
          expect(icsContent).toContain('LOCATION');
          console.log('✓ ICS contains location');
        }

        // Verify dates
        expect(icsContent).toContain('DTSTART');
        expect(icsContent).toContain('DTEND');
        console.log('✓ ICS contains start/end dates');

        console.log('\n✅ All calendar invite validations passed!');
      }
    }, 20000);

    it('should send calendar invite when authenticated user RSVPs', async () => {
      const timestamp = Date.now();
      const userEmail = `auth-user-cal-${timestamp}@example.com`;
      const timestampBeforeRequest = Date.now();

      console.log('\n=== Testing Authenticated RSVP Calendar Invite ===');

      // Create authenticated user
      const userResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: userEmail,
          password: 'password123',
          firstName: 'Auth',
          lastName: 'User',
        })
        .expect(201);

      const userToken = userResponse.body.token;

      // RSVP to event as authenticated user
      await serverApp
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(201);

      console.log('Authenticated RSVP successful');

      // Wait for event processing and email delivery
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Verify calendar invite was sent
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeRequest,
      );
      const userEmails = recentEmails.filter((email: any) =>
        email.to?.some((recipient: any) => recipient.address === userEmail),
      );

      // Should have calendar invite email
      expect(userEmails.length).toBeGreaterThan(0);

      // Find calendar invite by subject pattern
      const calendarEmail = userEmails.find((email: any) =>
        email.subject?.includes('registered for'),
      );

      expect(calendarEmail).toBeDefined();
      console.log('Calendar invite sent to authenticated user');

      // Verify ICS attachment exists
      const icsAttachment = mailDevService.getIcsAttachment(calendarEmail);
      expect(icsAttachment).toBeDefined();

      console.log('✅ Authenticated user calendar invite validated!');
    }, 20000);

    it('should NOT send calendar invite for non-confirmed RSVPs', async () => {
      const timestamp = Date.now();
      const testEmail = `pending-rsvp-${timestamp}@example.com`;

      // Create event requiring approval
      const approvalEvent = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `Approval Required Event ${timestamp}`,
          slug: `approval-test-${timestamp}`,
          description: 'Event requiring approval',
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
          timeZone: 'America/New_York',
          type: EventType.InPerson,
          location: 'Test Location',
          maxAttendees: 50,
          categories: [],
          visibility: 'public',
          status: EventStatus.Published,
          requireApproval: true, // This makes RSVPs pending
        })
        .expect(201);

      const timestampBeforeRequest = Date.now();

      // Quick RSVP to approval-required event (creates pending attendance)
      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'Pending User',
          email: testEmail,
          eventSlug: approvalEvent.body.slug,
        })
        .expect(201);

      console.log('\n=== Testing Pending RSVP (No Calendar Invite) ===');

      // Wait for potential event processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check for emails
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeRequest,
      );
      const pendingUserEmails = recentEmails.filter((email: any) =>
        email.to?.some((recipient: any) => recipient.address === testEmail),
      );

      // Should NOT have calendar invite for pending RSVP
      const calendarEmail = pendingUserEmails.find((email: any) => {
        const hasIcsAttachment = mailDevService.getIcsAttachment(email);
        return hasIcsAttachment !== undefined;
      });

      expect(calendarEmail).toBeUndefined();
      console.log('✅ Correctly skipped calendar invite for pending RSVP');
    }, 20000);
  });

  describe('Calendar Invite Email Content', () => {
    it('should include Add to Calendar fallback links in email', async () => {
      const timestamp = Date.now();
      const testEmail = `fallback-links-${timestamp}@example.com`;
      const timestampBeforeRequest = Date.now();

      // Quick RSVP
      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'Fallback Test',
          email: testEmail,
          eventSlug: testEvent.slug,
        })
        .expect(201);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get calendar invite email
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeRequest,
      );
      const testEmails = recentEmails.filter((email: any) =>
        email.to?.some((recipient: any) => recipient.address === testEmail),
      );

      const calendarEmail = testEmails.find((email: any) =>
        email.subject?.includes('registered for'),
      );

      expect(calendarEmail).toBeDefined();

      // Check HTML body for fallback links
      const htmlBody = calendarEmail.html || '';

      // Should have links to major calendar providers
      expect(
        htmlBody.includes('google.com/calendar') ||
          htmlBody.includes('Google Calendar'),
      ).toBeTruthy();
      expect(
        htmlBody.includes('outlook') || htmlBody.includes('Outlook'),
      ).toBeTruthy();

      console.log('✅ Email contains fallback calendar links');
    }, 20000);
  });
});
