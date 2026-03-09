import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent, createGroup } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(60000);

const MAILDEV_URL = 'http://localhost:1080';

async function getMailDevEmails(): Promise<any[]> {
  const res = await fetch(`${MAILDEV_URL}/email`);
  return res.json();
}

async function clearMailDev(): Promise<void> {
  await fetch(`${MAILDEV_URL}/email/all`, { method: 'DELETE' });
}

describe('Series Occurrence Notification (e2e)', () => {
  let token: string;
  let testGroup: any;
  let series: any;

  beforeAll(async () => {
    // Clear all emails so we can detect new ones
    await clearMailDev();

    // Login as test user
    token = await loginAsTester();

    // Create a group (test user is creator/member)
    testGroup = await createGroup(TESTING_APP_URL, token, {
      name: 'Notification Test Group',
      description: 'Testing series occurrence notifications',
    });

    // Create a template event in the group, in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
    const endDate = new Date(futureDate.getTime() + 3600000); // +1hr

    const templateEvent = await createEvent(TESTING_APP_URL, token, {
      name: 'Weekly Meeting',
      description: 'A recurring weekly meeting for notification testing',
      startDate: futureDate.toISOString(),
      endDate: endDate.toISOString(),
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://meet.example.com',
      maxAttendees: 50,
      categories: [],
      lat: 0,
      lon: 0,
      status: 'published',
      visibility: 'public',
      group: { id: testGroup.id },
      timeZone: 'America/New_York',
    });

    console.log('Template event created:', templateEvent.slug);

    // Check emails after template event creation (should trigger event.created)
    await new Promise((r) => setTimeout(r, 3000));
    const emailsAfterTemplate = await getMailDevEmails();
    console.log(
      'Emails after template event creation:',
      emailsAfterTemplate.length,
    );
    emailsAfterTemplate.forEach((e) =>
      console.log(`  - To: ${e.to?.[0]?.address}, Subject: ${e.subject}`),
    );

    // Clear again before series test
    await clearMailDev();

    // Create a series from the template event
    const seriesResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        name: 'Weekly Meeting Series',
        description: 'Testing notifications',
        recurrenceRule: {
          frequency: 'WEEKLY',
          interval: 1,
          count: 10,
          byweekday: [
            futureDate.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 2).toUpperCase(),
          ],
        },
        timeZone: 'America/New_York',
        templateEventSlug: templateEvent.slug,
      });

    expect(seriesResponse.status).toBe(201);
    series = seriesResponse.body;
    console.log('Series created:', series.slug);
  });

  it('should send email notification when an occurrence is materialized', async () => {
    // Clear maildev before materialization
    await clearMailDev();

    // Get upcoming occurrences to find an unmaterialized one
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/occurrences`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .query({ count: 5 });

    expect(occurrencesResponse.status).toBe(200);
    const occurrences = occurrencesResponse.body;
    console.log('Occurrences:', JSON.stringify(occurrences, null, 2));

    // Find an unmaterialized occurrence (skip first which is the template)
    const unmaterialized = occurrences.find(
      (o: any) => !o.materialized,
    );

    if (!unmaterialized) {
      console.log('No unmaterialized occurrences found — all already materialized');
      return;
    }

    console.log('Materializing occurrence for date:', unmaterialized.date);

    // Materialize it via the getOrCreate endpoint (GET :slug/:occurrenceDate)
    const materializeResponse = await request(TESTING_APP_URL)
      .get(
        `/api/event-series/${series.slug}/${unmaterialized.date}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Materialize response status:', materializeResponse.status);
    console.log(
      'Materialized event slug:',
      materializeResponse.body?.slug,
    );
    expect(materializeResponse.status).toBe(200);

    // Wait for async email sending
    await new Promise((r) => setTimeout(r, 5000));

    // Check MailDev for new emails
    const emails = await getMailDevEmails();
    console.log('Emails after materialization:', emails.length);
    emails.forEach((e) =>
      console.log(`  - To: ${e.to?.[0]?.address}, Subject: ${e.subject}`),
    );

    // The test: did an announcement email get sent?
    const announcementEmails = emails.filter(
      (e) =>
        e.subject?.includes('New Event') ||
        e.subject?.includes('Weekly Meeting'),
    );

    console.log('Announcement emails found:', announcementEmails.length);

    if (announcementEmails.length === 0) {
      console.log('*** NO ANNOUNCEMENT EMAIL SENT — THIS IS THE BUG ***');
      console.log('All emails received:', emails.map((e) => e.subject));
    } else {
      console.log('*** ANNOUNCEMENT EMAIL WAS SENT — SYSTEM WORKS ***');
    }

    // Assert that at least one announcement was sent
    expect(announcementEmails.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Cleanup: delete the series, events, and group
    if (series?.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/event-series/${series.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    if (testGroup?.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });
});
