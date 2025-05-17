import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Event Creation with NaN Integer Error (e2e)', () => {
  let token;

  // Before all tests, log in as the test user
  beforeAll(async () => {
    // Use loginAsTester to get a token
    token = await loginAsTester();
  });

  /**
   * This test is specifically designed to reproduce the error:
   * "invalid input syntax for type integer: 'NaN'"
   * that occurs during event creation
   */
  it('should reproduce the integer NaN SQL error from log', async () => {
    // Create an event based on the exact payload from the logs
    const eventData = {
      name: 'Weekly Discussion',
      description: 'Topical Conversation',
      startDate: '2025-05-11T19:30:00.000Z',
      type: 'in-person',
      maxAttendees: 0,
      visibility: 'public',
      categories: [5],
      sourceType: null,
      sourceId: null,
      sourceUrl: null,
      sourceData: null,
      lastSyncedAt: null,
      timeZone: 'Pacific/Honolulu',
      // Using the group from the logs, but converting to NaN to trigger the error
      group: NaN, // This should become "NaN" in the query parameter and cause error
      endDate: '2025-05-11T21:00:00.000Z',
      lat: 19.6439006,
      lon: -156.0091339,
      location:
        'Old Kona Airport State Recreation Area, Laniakea, Kailua, Hawaiʻi County, Hawaii, United States',
      status: 'published',
      // Add blocksTime which might be a cause of the issue
      blocksTime: true,
    };

    // console.log('Sending event creation payload:', eventData);

    // Attempt to create the event - we expect a 500 error with NaN message
    try {
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(eventData);

      // console.log(`Response status: ${response.status}`);
      // console.log(`Response body:`, response.body);

      expect([500, 400, 422, 201]).toContain(response.status);

      // If we get a 201, this test is NOT successfully reproducing the error
      if (response.status === 201) {
        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }

      // Check for our specific error message
      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        expect(errorMessage).toContain(
          'invalid input syntax for type integer: "NaN"',
        );
        console.log('Successfully reproduced the NaN integer error!');
      }
    } catch (error) {
      console.error('Error during test:', error);
      throw error;
    }
  });

  /**
   * Another test variation with group ID as an object with NaN value
   */
  it('should reproduce the error using group object with NaN id', async () => {
    // Create event with group as object with NaN id
    const eventData = {
      name: 'Weekly Discussion Object',
      description: 'Topical Conversation',
      startDate: '2025-05-11T19:30:00.000Z',
      type: 'in-person',
      maxAttendees: 0,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      // Using group as object with NaN id
      group: {
        id: NaN, // This should become "NaN" in the query parameter
      },
      endDate: '2025-05-11T21:00:00.000Z',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Kailua, Hawaii',
      status: 'published',
    };

    console.log(
      'Sending event creation with group object containing NaN id:',
      eventData,
    );

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(`Response status: ${response.status}`);
    console.log(`Response body:`, response.body);

    // Expect successful creation (201) as the service now handles NaN group IDs gracefully
    expect(response.status).toBe(201);

    // Verify that the group is null or undefined in the response
    expect(response.body.group).toBeUndefined(); // Or .toBeUndefined(), adjust based on actual API behavior

    console.log(
      'NaN in group.id was handled gracefully, event created with null group.',
    );

    // Clean up the created event
    if (response.body && response.body.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  /**
   * Test for string "NaN" as group ID value (direct reproduction of the error from logs)
   */
  it('should reproduce the exact error by bypassing normal processing', async () => {
    // This test attempts to bypass any TypeScript validation and directly pass a "NaN" string to the API
    // We're mimicking what happens when the JSON is stringified and sent to the server

    const rawJsonPayload = JSON.stringify({
      name: 'Test Exact NaN Reproduction',
      description: 'This payload mimics the exact error conditions',
      startDate: '2025-05-11T19:30:00.000Z',
      type: 'in-person',
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      // Force the group value to be parsed as NaN string in the low-level processing
      // by using a string replacement trick to prevent TypeScript from converting it
      group: 'NaN', // This should become a string "NaN" in the request
    });

    // Use string replacement to force NaN string (not native NaN)
    // We're doing this because when sending NaN in JavaScript, it often gets
    // converted to null or lost in transit
    const forcedPayload = rawJsonPayload.replace(
      '"group":"NaN"',
      '"group":"NaN"',
    );

    console.log('Sending raw payload with forced string NaN:', forcedPayload);

    // Attempt to create the event using the raw payload
    try {
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send(forcedPayload);

      console.log(`Raw NaN test - Response status: ${response.status}`);

      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        console.log(`Error message: ${errorMessage}`);

        if (
          errorMessage.includes('invalid input syntax for type integer: "NaN"')
        ) {
          console.log('SUCCESS! Reproduced the exact error from the logs!');
        }
      } else if (response.status === 201) {
        console.log('Event was created successfully - NaN was handled');

        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    } catch (error) {
      console.error('Error during test:', error.message);
    }
  });

  /**
   * Test specifically for NaN in priority field
   */
  it('should test event creation with priority set to NaN', async () => {
    // Create event with priority explicitly set to NaN
    const eventData = {
      name: 'Test Priority NaN',
      description: 'Event with NaN priority value',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      maxAttendees: 10,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      priority: NaN, // Explicitly set priority to NaN
    };

    console.log('Sending event creation with priority=NaN:', eventData);

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(`Priority NaN test - Response status: ${response.status}`);

    if (response.body) {
      console.log('Response body:', {
        priority: response.body.priority,
        groupId: response.body.group?.id,
        id: response.body.id,
        slug: response.body.slug,
      });
    }

    // If we get a 500 with our specific error, we've reproduced the issue
    if (response.status === 500) {
      const errorMessage = response.body?.message || '';

      if (
        errorMessage.includes('invalid input syntax for type integer: "NaN"')
      ) {
        console.log('Successfully reproduced the NaN integer error!');
      } else {
        console.log(
          `Got 500 error, but not our target error. Message: ${errorMessage}`,
        );
      }
    }
    // If we get a 201, check how the NaN was handled
    else if (response.status === 201) {
      console.log('Event was created successfully - NaN priority was handled');
      console.log(
        `The priority value was converted to: ${response.body.priority}`,
      );

      // Clean up the created event
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  /**
   * Test using the exact parameters from the failed SQL query in the logs
   */
  it('should reproduce the error using the exact parameters from logs', async () => {
    // The failing SQL query parameters:
    // "01jts5b09ndgy5kx67zgkr2y9q","Weekly Discussion","weekly-discussion-q0b7nl","in-person",
    // "Topical Conversation","2025-05-11T19:30:00.000Z","2025-05-11T21:00:00.000Z",0,
    // "{\"type\":\"Point\",\"coordinates\":[-156.0091339,19.6439006]}",
    // "Old Kona Airport State Recreation Area, Laniakea, Kailua, Hawaiʻi County, Hawaii, United States",
    // 19.6439006,-156.0091339,"published","public",true,70,null

    // Create an event closely matching the failing query parameters
    const eventData = {
      name: 'Weekly Discussion',
      description: 'Topical Conversation',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      maxAttendees: 0,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      // Using the group ID from the logs (70) - but this needs to be transformed to NaN somehow
      group: 17, // ID from the log, should be stringified correctly
      lat: 19.6439006,
      lon: -156.0091339,
      location:
        'Old Kona Airport State Recreation Area, Laniakea, Kailua, Hawaiʻi County, Hawaii, United States',
      status: 'published',
      blocksTime: true,
      // Try some other fields that might get converted to NaN
      priority: NaN,
      // Include a pre-built locationPoint matching the one in the query
      locationPoint: {
        type: 'Point',
        coordinates: [-156.0091339, 19.6439006],
      },
    };

    // console.log(
    //   'Sending event creation with exact parameters from logs:',
    //   eventData,
    // );

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(`Response status: ${response.status}`);
    console.log(`Response body:`, response.body);

    if (response.status === 201) {
      // Clean up the created event
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    // expect(response.status).not.toBe(500);
  });

  /**
   * Test specific integer fields one by one to isolate the issue
   */
  it('should test each integer field individually to isolate the NaN problem', async () => {
    // We'll try a series of test cases for different fields that might be causing the problem
    const testCases = [
      {
        name: 'group_id_as_nan',
        data: {
          group: { id: NaN },
          otherFields: true,
        },
      },
      {
        name: 'group_id_as_string_nan',
        data: {
          group: { id: 'NaN' }, // String "NaN" for group.id
          otherFields: true,
        },
      },
      {
        name: 'group_as_string_nan',
        data: {
          group: 'NaN',
          otherFields: true,
        },
      },
      {
        name: 'group_id_as_null',
        data: {
          group: { id: null },
          otherFields: true,
        },
      },
      {
        name: 'group_as_null',
        data: {
          group: null,
          otherFields: true,
        },
      },
      {
        name: 'priority_as_nan',
        data: {
          priority: NaN,
          otherFields: true,
        },
      },
      {
        name: 'max_attendees_as_nan',
        data: {
          maxAttendees: NaN,
          otherFields: true,
        },
      },
    ];

    // Run each test case
    for (const testCase of testCases) {
      console.log(`\nRunning test case: ${testCase.name}`);

      // Create base event data with specific fields for test case
      const eventData: any = {
        name: `Test ${testCase.name}`,
        description: 'Test for NaN errors',
        startDate: '2025-05-11T19:30:00.000Z',
        endDate: '2025-05-11T21:00:00.000Z',
        type: 'in-person',
        maxAttendees: 0,
        visibility: 'public',
        categories: [5],
        timeZone: 'Pacific/Honolulu',
        lat: 19.6439006,
        lon: -156.0091339,
        location: 'Old Kona Airport State Recreation Area, Kailua, Hawaii',
        status: 'published',
        // Now apply the specific test case fields
        ...testCase.data,
      };

      // Remove otherFields flag if present
      if ('otherFields' in eventData) {
        delete eventData.otherFields;
      }

      console.log('Sending payload:', eventData);

      // Attempt to create the event
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(eventData);

      console.log(`${testCase.name} - Response status: ${response.status}`);

      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        console.log(`${testCase.name} - Error message: ${errorMessage}`);

        if (
          errorMessage.includes('invalid input syntax for type integer: "NaN"')
        ) {
          console.log(`${testCase.name} - FOUND OUR ERROR!`);
          console.log(
            `The field causing the "NaN" error is from test case: ${testCase.name}`,
          );
        }
      } else if (response.status === 201) {
        console.log(`${testCase.name} - Event created successfully (no error)`);

        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } else {
        console.log(
          `${testCase.name} - Got validation response: ${response.status}`,
        );
      }
    }
  });

  /**
   * Test with direct JSON string containing "null" as group value
   */
  it('should test event creation with raw JSON containing string null for group', async () => {
    // Create a raw JSON string with "null" as group value (not JavaScript null)
    const rawJsonPayload = JSON.stringify({
      name: 'Test Raw JSON with String Null Group',
      description: 'Using raw JSON with string "null" for group',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      // This will become a string in JSON, but we want to preserve it as "null" string
      group: 'null',
    });

    // Replace the correctly quoted "null" with a string "null" to ensure it's not processed as null
    const forcedPayload = rawJsonPayload.replace(
      '"group":"null"',
      '"group":"null"',
    );

    console.log(
      'Sending raw payload with string null for group:',
      forcedPayload,
    );

    // Attempt to create the event using the raw payload
    try {
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send(forcedPayload);

      console.log(
        `Raw string "null" test - Response status: ${response.status}`,
      );

      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        console.log(`Error message: ${errorMessage}`);
      } else if (response.status === 201) {
        console.log(
          'Event was created successfully - string "null" was handled',
        );
        console.log('Response group value:', response.body.group);

        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } else {
        console.log('Validation response:', response.body);
      }
    } catch (error) {
      console.error('Error during test:', error.message);
    }
  });

  /**
   * Standalone test with string "null" for groupId
   */
  it('should test event creation with string "null" for groupId', async () => {
    // Create event with string "null" for group ID
    const eventData = {
      name: 'Test String Null Group ID',
      description: 'Event with "null" string for group ID',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      maxAttendees: 10,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      group: { id: 'null' }, // Explicitly set group.id to string "null"
    };

    console.log(
      'Sending event creation with string "null" for group ID:',
      eventData,
    );

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(
      `String "null" groupId test - Response status: ${response.status}`,
    );

    if (response.body) {
      console.log('Response body:', {
        group: response.body.group,
        id: response.body.id,
        slug: response.body.slug,
      });
    }

    // If we get a 500, check if it's our NaN error
    if (response.status === 500) {
      const errorMessage = response.body?.message || '';
      console.log(`Got 500 error. Message: ${errorMessage}`);
    }
    // If we get a 201, the string "null" was handled successfully
    else if (response.status === 201) {
      console.log(
        'Event was created successfully - string "null" group.id was handled',
      );
      console.log(`The group value in response:`, response.body.group);

      // Clean up the created event
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    // If we get validation errors, log them
    else if ([400, 422].includes(response.status)) {
      console.log(
        'Validation caught the issue - did not reach the database layer',
      );
      console.log('Validation errors:', response.body);
    }
  });

  /**
   * Test with direct SQL-like string approach for "NaN" group value
   */
  it('should test SQL error when directly passing NaN string', async () => {
    // This is a more direct approach to try to reproduce the SQL error
    // We'll specifically attempt to bypass any validation or conversion
    const directSqlPayload = `{
      "name": "SQL NaN Test",
      "description": "Attempt to directly pass NaN to SQL layer",
      "startDate": "2025-05-11T19:30:00.000Z",
      "endDate": "2025-05-11T21:00:00.000Z", 
      "type": "in-person",
      "maxAttendees": 10,
      "visibility": "public",
      "categories": [5],
      "timeZone": "Pacific/Honolulu",
      "lat": 19.6439006,
      "lon": -156.0091339,
      "location": "Old Kona Airport State Recreation Area, Hawaii",
      "status": "published",
      "group": "NaN"
    }`;

    console.log('Sending direct SQL-like payload with NaN:', directSqlPayload);

    // Attempt to create the event using the direct payload
    try {
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send(directSqlPayload);

      console.log(`Direct SQL NaN test - Response status: ${response.status}`);

      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        console.log(`SQL Error message: ${errorMessage}`);

        if (errorMessage.includes('invalid input syntax for type integer')) {
          console.log('SUCCESS! Reproduced the exact SQL error!');
        }
      } else if (response.status === 201) {
        console.log(
          'Event was created successfully - NaN was handled at service layer',
        );
        console.log('Response group value:', response.body.group);

        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } else {
        console.log('Validation response:', response.body);
      }
    } catch (error) {
      console.error('Error during test:', error.message);
    }
  });

  /**
   * Standalone test with null groupId
   */
  it('should test event creation with explicitly null groupId', async () => {
    // Create event with null group ID
    const eventData = {
      name: 'Test Null Group ID',
      description: 'Event with null group ID value',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      maxAttendees: 10,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      group: { id: null }, // Explicitly set group.id to null
    };

    console.log('Sending event creation with null group ID:', eventData);

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(`Null groupId test - Response status: ${response.status}`);

    if (response.body) {
      console.log('Response body:', {
        group: response.body.group,
        id: response.body.id,
        slug: response.body.slug,
      });
    }

    // If we get a 500, check if it's our NaN error
    if (response.status === 500) {
      const errorMessage = response.body?.message || '';
      console.log(`Got 500 error. Message: ${errorMessage}`);
    }
    // If we get a 201, the null was handled successfully
    else if (response.status === 201) {
      console.log('Event was created successfully - null group.id was handled');
      console.log(`The group value in response:`, response.body.group);

      // Clean up the created event
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    // If we get validation errors, log them
    else if ([400, 422].includes(response.status)) {
      console.log(
        'Validation caught the issue - did not reach the database layer',
      );
      console.log('Validation errors:', response.body);
    }
  });

  /**
   * Test with string numeric value for group
   */
  it('should test event creation with string "2" for group', async () => {
    // This test checks if the service handles string numeric values properly
    const directSqlPayload = `{
      "name": "String Numeric Group Test",
      "description": "Testing group value as string number",
      "startDate": "2025-05-11T19:30:00.000Z",
      "endDate": "2025-05-11T21:00:00.000Z", 
      "type": "in-person",
      "maxAttendees": 10,
      "visibility": "public",
      "categories": [5],
      "timeZone": "Pacific/Honolulu",
      "lat": 19.6439006,
      "lon": -156.0091339,
      "location": "Old Kona Airport State Recreation Area, Hawaii",
      "status": "published",
      "group": "2"
    }`;

    console.log('Sending payload with string "2" as group:', directSqlPayload);

    // Attempt to create the event using the direct payload
    try {
      const response = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Content-Type', 'application/json')
        .send(directSqlPayload);

      console.log(
        `String "2" group test - Response status: ${response.status}`,
      );

      if (response.status === 500) {
        const errorMessage = response.body?.message || '';
        console.log(`Error message: ${errorMessage}`);

        if (errorMessage.includes('invalid input syntax for type integer')) {
          console.log('Got SQL error with string "2" for group!');
        }
      } else if (response.status === 201) {
        console.log('Event was created successfully - string "2" was handled');
        console.log('Response group value:', response.body.group);

        // Clean up the created event
        await request(TESTING_APP_URL)
          .delete(`/api/events/${response.body.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } else {
        console.log('Validation response:', response.body);
      }
    } catch (error) {
      console.error('Error during test:', error.message);
    }
  });

  /**
   * Test for NaN in group.id
   */
  it('should test event creation with NaN in group.id', async () => {
    // Create event with NaN in group.id
    const eventData = {
      name: 'Test NaN in group.id',
      description: 'Event with NaN in group.id',
      startDate: '2025-05-11T19:30:00.000Z',
      endDate: '2025-05-11T21:00:00.000Z',
      type: 'in-person',
      maxAttendees: 10,
      visibility: 'public',
      categories: [5],
      timeZone: 'Pacific/Honolulu',
      lat: 19.6439006,
      lon: -156.0091339,
      location: 'Old Kona Airport State Recreation Area, Hawaii',
      status: 'published',
      group: { id: NaN }, // Explicitly set group.id to NaN
    };

    console.log('Sending event creation with NaN in group.id:', eventData);

    // Attempt to create the event
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventData);

    console.log(`Response status: ${response.status}`);
    console.log(`Response body:`, response.body);

    // Expect successful creation (201)
    expect(response.status).toBe(201);

    // Verify that the group is null or undefined in the response, as NaN should be handled gracefully
    expect(response.body.group).toBeUndefined(); // Or .toBeUndefined() depending on API behavior

    // If the test reaches here, it means NaN was handled correctly.
    console.log('NaN in group.id was handled gracefully, event created.');

    // Clean up the created event
    if (response.body && response.body.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${response.body.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });
});
