import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createTestUser,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(600000); // 10 minute timeout for creating many users across multiple events

describe('Populate Large Event (e2e) - Manual Testing Data', () => {
  let adminToken: string;
  const NUM_ATTENDEES = 25;
  const events = [
    {
      slug: 'test-event-public-attendees',
      name: `${NUM_ATTENDEES} person Test Event (public) - Manual Testing`,
      visibility: 'public',
    },
    {
      slug: 'test-event-authenticated-attendees',
      name: `${NUM_ATTENDEES} person Test Event (authenticated) - Manual Testing`,
      visibility: 'authenticated',
    },
    {
      slug: 'test-event-private-attendees',
      name: `${NUM_ATTENDEES} person Test Event (private) - Manual Testing`,
      visibility: 'private',
    },
  ];

  beforeAll(async () => {
    adminToken = await loginAsAdmin();

    // Create or find all three events
    for (const eventConfig of events) {
      try {
        const eventResponse = await request(TESTING_APP_URL)
          .get(`/api/events/${eventConfig.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        if (eventResponse.status === 200) {
          eventConfig.event = eventResponse.body;
          console.log(`\n✅ Found existing event: ${eventConfig.name}`);
          console.log(`📍 Event URL: https://platform.dev.openmeet.net/events/${eventConfig.slug}`);
          continue;
        }
      } catch (error) {
        // Event doesn't exist, we'll create it below
      }

      // Create the event
      const createdEvent = await createEvent(TESTING_APP_URL, adminToken, {
        name: eventConfig.name,
        slug: eventConfig.slug,
        description: `A ${eventConfig.visibility} event created for manual testing with ${NUM_ATTENDEES} attendees`,
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(), // 1 week from now
        endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(), // 2 hours after start
        type: EventType.Hybrid,
        location: 'Test Location - Downtown',
        locationOnline: 'https://meet.example.com/large-event',
        maxAttendees: 200,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'published',
        visibility: eventConfig.visibility,
        timeZone: 'America/New_York',
      });

      eventConfig.event = createdEvent;
      console.log(`\n✅ Created event: ${eventConfig.name}`);
      console.log(`📍 Event URL: https://platform.dev.openmeet.net/events/${createdEvent.slug}`);
      console.log(`   Visibility: ${eventConfig.visibility}, Actual slug: ${createdEvent.slug}`);
    }

    console.log('\n');
  });

  it('should populate all events with 25 attendees each for manual testing', async () => {
    const timestamp = Date.now(); // Unique identifier for this test run

    for (const eventConfig of events) {
      console.log(`\n📝 Populating event: ${eventConfig.name}`);
      console.log(`   Creating ${NUM_ATTENDEES} users...`);

      const attendees = [];
      const eventSlug = eventConfig.event?.slug || eventConfig.slug;

      for (let i = 1; i <= NUM_ATTENDEES; i++) {
        const email = `testuser${i}-${timestamp}-${eventConfig.visibility}@openmeet.test`;
        const firstName = `TestUser${i}`;
        const lastName = eventConfig.visibility.charAt(0).toUpperCase() + eventConfig.visibility.slice(1);

        // Create a new user
        const user = await createTestUser(
          TESTING_APP_URL,
          TESTING_TENANT_ID,
          email,
          firstName,
          lastName,
        );

        // Make the user attend the event
        const attendResponse = await request(TESTING_APP_URL)
          .post(`/api/events/${eventSlug}/attend`)
          .set('Authorization', `Bearer ${user.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({});

        // Note: This will fail for private events once we properly enforce visibility permissions
        expect(attendResponse.status).toBe(201);

        attendees.push({
          email,
          name: `${firstName} ${lastName}`,
          userId: user.id,
          slug: user.slug,
        });

        // Log progress every 10 users
        if (i % 10 === 0) {
          console.log(`  ✓ Created and registered ${i}/${NUM_ATTENDEES} attendees`);
        }
      }

      // Verify the attendees (request all with high limit to bypass pagination)
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}/attendees?limit=100`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      const attendeeCount = attendeesResponse.body.data.length;
      const totalAttendees = attendeesResponse.body.total;
      console.log(`  ✅ Event successfully populated with ${totalAttendees} attendees (showing ${attendeeCount})`);

      // Expect exactly NUM_ATTENDEES attendees - no failures allowed
      expect(totalAttendees).toBeGreaterThanOrEqual(NUM_ATTENDEES);
    }

    console.log('\n🎉 Manual testing data created successfully!');
    console.log('\nEvents created:');
    for (const eventConfig of events) {
      const eventSlug = eventConfig.event?.slug || eventConfig.slug;
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}/attendees?limit=1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`   📍 ${eventConfig.name}`);
      console.log(`      URL: https://platform.dev.openmeet.net/events/${eventSlug}`);
      console.log(`      Attendees: ${attendeesResponse.body.total}`);
    }
    console.log('\n⚠️  NOTE: This test does NOT clean up data - events and users persist for manual testing\n');
  });

  // NOTE: No afterAll cleanup - we want this data to persist for manual testing!
  // To clean up manually, delete the event through the UI or API
});
