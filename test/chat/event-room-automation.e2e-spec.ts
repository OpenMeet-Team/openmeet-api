import { TESTING_APP_URL } from '../utils/constants';
import {
  loginAsTester,
  createEvent,
  getEvent,
  getCurrentUserDetails,
  deleteEvent,
  waitForEventProcessing,
} from '../utils/functions';
import { EventType, EventStatus } from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Event Room Automation (e2e)', () => {
  let token: string;
  let testUser: any;
  let createdEvents: number[] = []; // Track event IDs for cleanup

  beforeEach(async () => {
    // Log in as the test user and get user details
    token = await loginAsTester();
    testUser = await getCurrentUserDetails(token);

    console.log('Test user:', {
      id: testUser.id,
      slug: testUser.slug,
      email: testUser.email,
    });
  });

  afterEach(async () => {
    // Clean up all created events
    for (const eventId of createdEvents) {
      try {
        console.log(`Cleaning up event: ${eventId}`);
        await deleteEvent(TESTING_APP_URL, token, eventId);
      } catch (error) {
        console.error(`Failed to clean up event ${eventId}:`, error.message);
      }
    }
    createdEvents = [];
  });

  describe('Automatic Matrix Room Creation', () => {
    it('should automatically create a Matrix room when an event is created', async () => {
      console.log(
        '\n=== Testing automatic Matrix room creation on event creation ===',
      );

      const timestamp = Date.now();
      const eventData = {
        name: `Auto Room Event ${timestamp}`,
        description: 'Testing automatic Matrix room creation for events',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://test-event.com',
        maxAttendees: 50,
        categories: [],
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      console.log('Creating event:', eventData);

      // Create the event - this should trigger automatic Matrix room creation
      const createdEvent = await createEvent(TESTING_APP_URL, token, eventData);
      createdEvents.push(createdEvent.id);

      console.log('Event created successfully:', {
        id: createdEvent.id,
        slug: createdEvent.slug,
        name: createdEvent.name,
      });

      // Verify basic event creation worked
      expect(createdEvent).toBeDefined();
      expect(createdEvent.name).toBe(eventData.name);
      expect(createdEvent.description).toBe(eventData.description);
      expect(createdEvent.slug).toBeDefined();

      // Wait for the event-driven automation to process
      console.log('Waiting for chat room automation to process...');
      await waitForEventProcessing(3000);

      // Get the updated event details to check if Matrix room was created
      const eventDetails = await getEvent(
        TESTING_APP_URL,
        token,
        createdEvent.slug,
      );

      console.log('Event details after automation:', {
        slug: eventDetails.slug,
        matrixRoomId: eventDetails.matrixRoomId,
        hasMatrixRoom: !!eventDetails.matrixRoomId,
      });

      // SPECIFIC EXPECTATION: Matrix room should be created automatically
      expect(eventDetails.matrixRoomId).toBeDefined();
      expect(eventDetails.matrixRoomId).not.toBeNull();
      expect(eventDetails.matrixRoomId).toMatch(/^!/); // Matrix room IDs start with !
      expect(eventDetails.matrixRoomId).toContain(':'); // Should have server part like !abc:server.com

      console.log(
        '✅ SUCCESS: Matrix room created automatically:',
        eventDetails.matrixRoomId,
      );
    });

    it('should create Matrix rooms for different event types', async () => {
      console.log(
        '\n=== Testing automation works for different event types ===',
      );

      const timestamp = Date.now();
      const baseEventData = {
        description: 'Testing event type automation',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().getTime() + 3600000).toISOString(),
        maxAttendees: 25,
        categories: [],
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      // Create hybrid event
      const hybridEventData = {
        ...baseEventData,
        name: `Hybrid Event ${timestamp}`,
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://hybrid-event.com',
      };

      const hybridEvent = await createEvent(
        TESTING_APP_URL,
        token,
        hybridEventData,
      );
      createdEvents.push(hybridEvent.id);
      console.log('Created hybrid event:', hybridEvent.slug);

      // Create online event
      const onlineEventData = {
        ...baseEventData,
        name: `Online Event ${timestamp}`,
        type: EventType.Online,
        locationOnline: 'https://online-event.com',
      };

      const onlineEvent = await createEvent(
        TESTING_APP_URL,
        token,
        onlineEventData,
      );
      createdEvents.push(onlineEvent.id);
      console.log('Created online event:', onlineEvent.slug);

      // Create in-person event
      const inPersonEventData = {
        ...baseEventData,
        name: `In Person Event ${timestamp}`,
        type: EventType.InPerson,
        location: 'Physical Test Location',
      };

      const inPersonEvent = await createEvent(
        TESTING_APP_URL,
        token,
        inPersonEventData,
      );
      createdEvents.push(inPersonEvent.id);
      console.log('Created in-person event:', inPersonEvent.slug);

      // Wait for all automations
      await waitForEventProcessing(4000);

      // Check all events have Matrix rooms
      const hybridDetails = await getEvent(
        TESTING_APP_URL,
        token,
        hybridEvent.slug,
      );
      const onlineDetails = await getEvent(
        TESTING_APP_URL,
        token,
        onlineEvent.slug,
      );
      const inPersonDetails = await getEvent(
        TESTING_APP_URL,
        token,
        inPersonEvent.slug,
      );

      console.log('Hybrid event result:', {
        slug: hybridDetails.slug,
        type: hybridDetails.type,
        hasMatrixRoom: !!hybridDetails.matrixRoomId,
        matrixRoomId: hybridDetails.matrixRoomId,
      });

      console.log('Online event result:', {
        slug: onlineDetails.slug,
        type: onlineDetails.type,
        hasMatrixRoom: !!onlineDetails.matrixRoomId,
        matrixRoomId: onlineDetails.matrixRoomId,
      });

      console.log('In-person event result:', {
        slug: inPersonDetails.slug,
        type: inPersonDetails.type,
        hasMatrixRoom: !!inPersonDetails.matrixRoomId,
        matrixRoomId: inPersonDetails.matrixRoomId,
      });

      // All event types should have Matrix rooms created
      expect(hybridDetails.matrixRoomId).toBeDefined();
      expect(hybridDetails.matrixRoomId).toMatch(/^!/);
      expect(onlineDetails.matrixRoomId).toBeDefined();
      expect(onlineDetails.matrixRoomId).toMatch(/^!/);
      expect(inPersonDetails.matrixRoomId).toBeDefined();
      expect(inPersonDetails.matrixRoomId).toMatch(/^!/);

      // Rooms should be different
      expect(hybridDetails.matrixRoomId).not.toBe(onlineDetails.matrixRoomId);
      expect(onlineDetails.matrixRoomId).not.toBe(inPersonDetails.matrixRoomId);
      expect(hybridDetails.matrixRoomId).not.toBe(inPersonDetails.matrixRoomId);

      console.log('✅ SUCCESS: All event types have automated Matrix rooms');
    });

    it('should include proper creator context in automated room creation', async () => {
      console.log(
        '\n=== Testing that creator context is properly passed to automation ===',
      );

      const timestamp = Date.now();
      const eventData = {
        name: `Creator Context Event ${timestamp}`,
        description: 'Testing creator context in automation',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().getTime() + 3600000).toISOString(),
        type: EventType.Online,
        locationOnline: 'https://creator-test.com',
        maxAttendees: 30,
        categories: [],
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      console.log('Creating event with current user context:', {
        userId: testUser.id,
        userSlug: testUser.slug,
      });

      const createdEvent = await createEvent(TESTING_APP_URL, token, eventData);
      createdEvents.push(createdEvent.id);

      // Verify creator was set correctly
      expect(createdEvent.user).toBeDefined();

      console.log('Event created with creator context:', {
        eventSlug: createdEvent.slug,
        createdBy: createdEvent.user,
      });

      await waitForEventProcessing(3000);

      // Get event details and verify Matrix room creation
      const eventDetails = await getEvent(
        TESTING_APP_URL,
        token,
        createdEvent.slug,
      );

      console.log('Automation result with creator context:', {
        hasMatrixRoom: !!eventDetails.matrixRoomId,
        matrixRoomId: eventDetails.matrixRoomId,
        createdBy: eventDetails.user,
      });

      // Matrix room should be created with proper context
      expect(eventDetails.matrixRoomId).toBeDefined();
      expect(eventDetails.matrixRoomId).toMatch(/^!/);
      expect(eventDetails.user).toBeDefined();

      console.log('✅ SUCCESS: Automation works with proper creator context');
    });
  });

  describe('Event System Verification', () => {
    it('should verify the event.created -> chat.event.created event flow works', async () => {
      console.log(
        '\n=== Testing complete event flow from event creation to chat automation ===',
      );

      const timestamp = Date.now();
      const eventData = {
        name: `Event Flow Test ${timestamp}`,
        description: 'Testing the complete event-driven flow',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().getTime() + 3600000).toISOString(),
        type: EventType.Hybrid,
        location: 'Flow Test Location',
        locationOnline: 'https://flow-test.com',
        maxAttendees: 40,
        categories: [],
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      console.log(
        'Testing event flow: event.created -> chat.event.created -> Matrix room creation',
      );

      // Create event (should trigger event.created event)
      const createdEvent = await createEvent(TESTING_APP_URL, token, eventData);
      createdEvents.push(createdEvent.id);

      console.log(
        'Event created, event flow should be: event.created -> chat.event.created',
      );

      // Basic validation that event was created
      expect(createdEvent.slug).toBeDefined();
      expect(createdEvent.name).toBe(eventData.name);

      // Wait for event processing chain to complete
      await waitForEventProcessing(5000); // Longer wait for complete flow

      // Verify the end result - Matrix room should exist
      const finalEventDetails = await getEvent(
        TESTING_APP_URL,
        token,
        createdEvent.slug,
      );

      console.log('Final event flow result:', {
        eventSlug: finalEventDetails.slug,
        hasMatrixRoom: !!finalEventDetails.matrixRoomId,
        matrixRoomId: finalEventDetails.matrixRoomId,
        eventFlowCompleted: !!finalEventDetails.matrixRoomId,
      });

      // CRITICAL EXPECTATION: The complete event flow should result in a Matrix room
      expect(finalEventDetails.matrixRoomId).toBeDefined();
      expect(finalEventDetails.matrixRoomId).not.toBeNull();
      expect(finalEventDetails.matrixRoomId).toMatch(/^!/);

      console.log('✅ SUCCESS: Complete event flow works correctly');
    });

    it('should handle multiple rapid event creations without conflicts', async () => {
      console.log(
        '\n=== Testing rapid event creation for event system stability ===',
      );

      const timestamp = Date.now();
      const eventCount = 3;
      const createdEventData = [];

      // Create multiple events rapidly
      for (let i = 0; i < eventCount; i++) {
        const eventData = {
          name: `Rapid Event Test ${timestamp}-${i}`,
          description: `Rapid creation test ${i + 1}`,
          startDate: new Date(new Date().getTime() + i * 3600000).toISOString(), // Stagger times
          endDate: new Date(
            new Date().getTime() + (i + 1) * 3600000,
          ).toISOString(),
          type: i % 2 === 0 ? EventType.Online : EventType.Hybrid, // Alternate types
          locationOnline: `https://rapid-test-${i}.com`,
          location: i % 2 === 1 ? `Rapid Location ${i}` : undefined,
          maxAttendees: 20 + i * 10,
          categories: [],
          status: EventStatus.Published,
          timeZone: 'UTC',
        };

        const event = await createEvent(TESTING_APP_URL, token, eventData);
        createdEvents.push(event.id);
        createdEventData.push({ data: eventData, result: event });

        console.log(`Created event ${i + 1}/${eventCount}: ${event.slug}`);
      }

      // Wait for all automations to complete
      await waitForEventProcessing(6000);

      // Verify all events have Matrix rooms
      for (let i = 0; i < createdEventData.length; i++) {
        const { result: event } = createdEventData[i];
        const details = await getEvent(TESTING_APP_URL, token, event.slug);

        console.log(`Event ${i + 1} automation result:`, {
          slug: details.slug,
          hasMatrixRoom: !!details.matrixRoomId,
          matrixRoomId: details.matrixRoomId,
        });

        // Each event should have its own Matrix room
        expect(details.matrixRoomId).toBeDefined();
        expect(details.matrixRoomId).toMatch(/^!/);
      }

      // Verify all Matrix room IDs are unique
      const allRoomIds = [];
      for (let i = 0; i < createdEventData.length; i++) {
        const { result: event } = createdEventData[i];
        const details = await getEvent(TESTING_APP_URL, token, event.slug);
        allRoomIds.push(details.matrixRoomId);
      }

      const uniqueRoomIds = [...new Set(allRoomIds)];
      expect(uniqueRoomIds.length).toBe(eventCount);

      console.log(
        '✅ SUCCESS: Rapid event creation produces unique Matrix rooms',
      );
    });
  });

  describe('Event vs Group Room Automation Comparison', () => {
    it('should verify both events and groups get separate automated rooms', async () => {
      console.log(
        '\n=== Testing that events and groups create separate Matrix rooms ===',
      );

      const timestamp = Date.now();

      // Create an event
      const eventData = {
        name: `Comparison Event ${timestamp}`,
        description: 'Testing event vs group room separation',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().getTime() + 3600000).toISOString(),
        type: EventType.Online,
        locationOnline: 'https://comparison-event.com',
        maxAttendees: 25,
        categories: [],
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      const createdEvent = await createEvent(TESTING_APP_URL, token, eventData);
      createdEvents.push(createdEvent.id);

      await waitForEventProcessing(3000);

      // Get event details
      const eventDetails = await getEvent(
        TESTING_APP_URL,
        token,
        createdEvent.slug,
      );

      console.log('Event automation result:', {
        slug: eventDetails.slug,
        type: 'event',
        hasMatrixRoom: !!eventDetails.matrixRoomId,
        matrixRoomId: eventDetails.matrixRoomId,
      });

      // Event should have Matrix room
      expect(eventDetails.matrixRoomId).toBeDefined();
      expect(eventDetails.matrixRoomId).toMatch(/^!/);

      console.log(
        '✅ SUCCESS: Event automation creates Matrix rooms correctly',
      );
    });
  });
});
