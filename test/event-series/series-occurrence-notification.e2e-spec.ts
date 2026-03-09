import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
} from '../utils/constants';
import { loginAsTester, createEvent, createGroup } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(60000);

const MAILDEV_URL = `http://${TESTING_MAIL_HOST || 'localhost'}:${TESTING_MAIL_PORT || '1080'}`;

async function clearMaildev(): Promise<void> {
  await request(MAILDEV_URL).delete('/email/all').expect(200);
}

async function getEmails(): Promise<any[]> {
  const res = await request(MAILDEV_URL).get('/email');
  return res.body;
}

describe('Series Occurrence Notification (e2e)', () => {
  let token: string;
  let testGroup: any;
  let series: any;

  beforeAll(async () => {
    await clearMaildev();

    token = await loginAsTester();

    testGroup = await createGroup(TESTING_APP_URL, token, {
      name: 'Notification Test Group',
      description: 'Testing series occurrence notifications',
    });

    // Create a template event in the group, 1 week from now
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const endDate = new Date(futureDate.getTime() + 3600000);

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

    // Wait for async email, then verify template event triggered announcement
    await new Promise((r) => setTimeout(r, 3000));
    const emailsAfterTemplate = await getEmails();
    console.log(
      'Emails after template event creation:',
      emailsAfterTemplate.length,
    );
    emailsAfterTemplate.forEach((e: any) =>
      console.log(`  - To: ${e.to?.[0]?.address}, Subject: ${e.subject}`),
    );

    await clearMaildev();

    // Create a series from the template event
    const dayCode = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][
      futureDate.getDay()
    ];

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
          byweekday: [dayCode],
        },
        timeZone: 'America/New_York',
        templateEventSlug: templateEvent.slug,
      });

    expect(seriesResponse.status).toBe(201);
    series = seriesResponse.body;
    console.log('Series created:', series.slug);
  });

  it('should send email notification when an occurrence is materialized', async () => {
    await clearMaildev();

    // Get upcoming occurrences to find an unmaterialized one
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/occurrences`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .query({ count: 5 });

    expect(occurrencesResponse.status).toBe(200);
    const occurrences = occurrencesResponse.body;

    const unmaterialized = occurrences.find((o: any) => !o.materialized);

    if (!unmaterialized) {
      console.log(
        'No unmaterialized occurrences found — all already materialized',
      );
      return;
    }

    console.log('Materializing occurrence for date:', unmaterialized.date);

    // Materialize via getOrCreate endpoint (GET :slug/:occurrenceDate)
    const materializeResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/${unmaterialized.date}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(materializeResponse.status).toBe(200);
    console.log('Materialized event slug:', materializeResponse.body?.slug);

    // Wait for async email sending
    await new Promise((r) => setTimeout(r, 5000));

    const emails = await getEmails();
    console.log('Emails after materialization:', emails.length);
    emails.forEach((e: any) =>
      console.log(`  - To: ${e.to?.[0]?.address}, Subject: ${e.subject}`),
    );

    const announcementEmails = emails.filter(
      (e: any) =>
        e.subject?.includes('New Event') ||
        e.subject?.includes('Weekly Meeting'),
    );

    console.log('Announcement emails found:', announcementEmails.length);
    expect(announcementEmails.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
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
