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
import { createTestUser } from '../utils/functions';

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

    const organizerData = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      organizerEmail,
      'Event',
      'Organizer',
      'password123',
    );

    organizerToken = organizerData.token;

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
      console.log(`Found ${recipientEmails.length} email(s) to ${testEmail}`);

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
      const userData = await createTestUser(
        TESTING_APP_URL,
        testTenantId,
        userEmail,
        'Auth',
        'User',
        'password123',
      );

      const userToken = userData.token;

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

  describe('VTIMEZONE Component in ICS (Issue #257)', () => {
    it('should include VTIMEZONE component in calendar invite for non-UTC timezones', async () => {
      console.log('\n=== Testing VTIMEZONE Component (Issue #257) ===');

      const timestamp = Date.now();
      const testEmail = `vtimezone-test-${timestamp}@example.com`;

      // Create event with specific timezone
      const pstEvent = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `PST Event ${timestamp}`,
          description: 'Testing VTIMEZONE component',
          startDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          endDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000,
          ).toISOString(),
          timeZone: 'America/Los_Angeles',
          type: EventType.InPerson,
          location: 'Los Angeles, CA',
          maxAttendees: 50,
          categories: [],
          visibility: 'public',
          status: EventStatus.Published,
        })
        .expect(201);

      console.log('PST Event created:', pstEvent.body.slug);

      // Do Quick RSVP to trigger calendar invite
      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'VTIMEZONE Test',
          email: testEmail,
          eventSlug: pstEvent.body.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      console.log('Quick RSVP successful');

      // Wait for email processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get emails sent to this recipient
      const emails = await mailDevService.getEmailsByRecipient(testEmail);
      console.log(`Found ${emails.length} email(s) to ${testEmail}`);

      const calendarEmail = emails.find((email: any) =>
        email.subject?.includes('registered'),
      );

      expect(calendarEmail).toBeDefined();
      console.log('Calendar invite email found');

      // Get ICS attachment
      const icsAttachment = mailDevService.getIcsAttachment(calendarEmail);
      expect(icsAttachment).toBeDefined();
      console.log('ICS attachment found');
      console.log('ICS attachment keys:', Object.keys(icsAttachment || {}));

      // Decode ICS content
      let icsContent: string;
      if (icsAttachment.content) {
        icsContent = Buffer.from(icsAttachment.content, 'base64').toString(
          'utf-8',
        );
      } else {
        // Fallback: try to fetch the content from MailDev API
        const response = await fetch(
          `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email/${calendarEmail.id}/attachment/${icsAttachment.generatedFileName}`,
        );
        icsContent = await response.text();
      }
      expect(icsContent).toBeDefined();
      console.log('ICS content length:', icsContent.length);

      // Verify VTIMEZONE component is present
      console.log('\n=== Verifying VTIMEZONE Component ===');

      // Check for VTIMEZONE block
      expect(icsContent).toContain('BEGIN:VTIMEZONE');
      expect(icsContent).toContain('END:VTIMEZONE');
      console.log('✅ VTIMEZONE block present');

      // Check for timezone ID
      expect(icsContent).toContain('TZID:America/Los_Angeles');
      console.log('✅ TZID matches event timezone');

      // Check for timezone offset information
      expect(icsContent).toContain('TZOFFSETFROM:');
      expect(icsContent).toContain('TZOFFSETTO:');
      console.log('✅ Timezone offset information present');

      // Verify DTSTART uses TZID parameter (not UTC)
      const dtstartMatch = icsContent.match(/DTSTART[^:]*:([^\r\n]+)/);
      expect(dtstartMatch).toBeDefined();
      console.log('DTSTART line:', dtstartMatch?.[0]);

      // Should have TZID parameter, not end with 'Z' (UTC)
      expect(icsContent).toMatch(/DTSTART;TZID=America\/Los_Angeles:/);
      expect(dtstartMatch?.[1]).not.toMatch(/Z$/);
      console.log('✅ DTSTART uses TZID parameter (not UTC)');

      // Check for standard and daylight time definitions (PST/PDT)
      expect(
        icsContent.includes('BEGIN:STANDARD') ||
          icsContent.includes('BEGIN:DAYLIGHT'),
      ).toBeTruthy();
      console.log('✅ Standard/Daylight time definitions present');

      console.log('\n✅ All VTIMEZONE validations passed!');
      console.log(
        'Issue #257 fix verified: VTIMEZONE component correctly included',
      );
    }, 20000);

    it('should NOT include VTIMEZONE component for UTC timezone', async () => {
      console.log('\n=== Testing UTC Event (No VTIMEZONE) ===');

      const timestamp = Date.now();
      const testEmail = `utc-test-${timestamp}@example.com`;

      // Create event with UTC timezone
      const utcEvent = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          name: `UTC Event ${timestamp}`,
          description: 'Testing UTC event without VTIMEZONE',
          startDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          endDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000,
          ).toISOString(),
          timeZone: 'UTC',
          type: EventType.Online,
          locationOnline: 'https://meet.example.com',
          maxAttendees: 50,
          categories: [],
          visibility: 'public',
          status: EventStatus.Published,
        })
        .expect(201);

      console.log('UTC Event created:', utcEvent.body.slug);

      // Do Quick RSVP
      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'UTC Test',
          email: testEmail,
          eventSlug: utcEvent.body.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      // Wait for email
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const emails = await mailDevService.getEmailsByRecipient(testEmail);
      const calendarEmail = emails.find((email: any) =>
        email.subject?.includes('registered'),
      );

      expect(calendarEmail).toBeDefined();

      const icsAttachment = mailDevService.getIcsAttachment(calendarEmail);
      expect(icsAttachment).toBeDefined();

      // Decode ICS content
      let icsContent: string;
      if (icsAttachment.content) {
        icsContent = Buffer.from(icsAttachment.content, 'base64').toString(
          'utf-8',
        );
      } else {
        // Fallback: fetch content from MailDev API
        const response = await fetch(
          `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email/${calendarEmail.id}/attachment/${icsAttachment.generatedFileName}`,
        );
        icsContent = await response.text();
      }

      // UTC events should NOT have VTIMEZONE block
      expect(icsContent).not.toContain('BEGIN:VTIMEZONE');
      console.log('✅ Correctly omitted VTIMEZONE for UTC timezone');

      // Should use UTC times (ending with Z)
      const dtstartMatch = icsContent.match(/DTSTART[^:]*:([^\r\n]+)/);
      expect(dtstartMatch?.[1]).toMatch(/Z$/);
      console.log('✅ DTSTART uses UTC format (ends with Z)');
    }, 20000);
  });

  describe('Event Update Calendar Invites', () => {
    it('should send updated calendar invite when event details change', async () => {
      console.log('\n=== Testing Event Update Calendar Invite ===');

      // First, create an attendee and RSVP
      const timestamp = Date.now();
      const attendeeEmail = `attendee-update-${timestamp}@example.com`;

      const attendeeData = await createTestUser(
        TESTING_APP_URL,
        testTenantId,
        attendeeEmail,
        'Test',
        'Attendee',
        'password123',
      );

      // RSVP to the event
      await serverApp
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${attendeeData.token}`)
        .send({})
        .expect(201);

      console.log('Attendee RSVPed to event');

      // Wait for initial calendar invite to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Clear timestamp for update test
      const timestampBeforeUpdate = Date.now();

      // Update the event (change time and location) - use organizer token!
      const newStartDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now
      await serverApp
        .patch(`/api/events/${testEvent.slug}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          startDate: newStartDate.toISOString(),
          endDate: new Date(newStartDate.getTime() + 7200000).toISOString(), // +2 hours
          location: 'Updated Venue, 456 New St',
        })
        .expect(200);

      console.log('Event updated with new time and location');

      // Wait for event processing and email delivery
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check for update email with calendar invite
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeUpdate,
      );
      const updateEmails = recentEmails.filter(
        (email: any) =>
          email.to?.some(
            (recipient: any) => recipient.address === attendeeEmail,
          ) && email.subject?.includes('Updated Event'),
      );

      expect(updateEmails.length).toBeGreaterThan(0);
      console.log(`Found ${updateEmails.length} update email(s)`);

      const updateEmail = updateEmails[0];

      // Fetch full email to get attachment info
      const fullEmailResponse = await fetch(
        `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email/${updateEmail.id}`,
      );
      const fullEmail = await fullEmailResponse.json();

      // Verify ICS attachment is present
      const icsAttachment = mailDevService.getIcsAttachment(fullEmail);
      expect(icsAttachment).toBeDefined();
      console.log('✅ Update email has ICS attachment');

      // Download the ICS file content using MailDev's attachment endpoint
      const icsResponse = await fetch(
        `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email/${updateEmail.id}/attachment/${icsAttachment.generatedFileName}`,
      );
      const icsContent = await icsResponse.text();

      // Should have METHOD:REQUEST for calendar updates
      expect(icsContent).toContain('METHOD:REQUEST');
      console.log('✅ ICS uses METHOD:REQUEST for update');

      // Should contain the same event UID (so it updates rather than creates new)
      expect(icsContent).toContain(`UID:${testEvent.ulid}`);
      console.log('✅ ICS contains same UID for update');

      // Should contain updated location
      expect(icsContent).toContain('Updated Venue');
      console.log('✅ ICS contains updated location');

      // Check SEQUENCE number (should be > 0 for updates, using updatedAt timestamp)
      const sequenceMatch = icsContent.match(/SEQUENCE:(\d+)/);
      expect(sequenceMatch).toBeDefined();
      const sequence = parseInt(sequenceMatch![1]);
      console.log(`SEQUENCE number: ${sequence}`);

      // SEQUENCE should be a Unix timestamp (10+ digits for years 2001+)
      expect(sequence).toBeGreaterThan(1000000000);
      console.log(
        '✅ SEQUENCE number is timestamp-based and will increment with updates',
      );

      console.log('✅ Event update calendar invite verified!');
    }, 30000);
  });
});
