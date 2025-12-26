import {
  loginAsTester,
  createEvent,
  createGroup,
  updateEvent,
  getEvent,
  createFile,
} from '../utils/functions';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  EventStatus,
  EventType,
  GroupStatus,
} from '../../src/core/constants/constant';

/**
 * E2E tests for event image update functionality.
 *
 * This test suite verifies that when an event's image is updated,
 * the change is persisted to the database and visible to all users.
 *
 * Related issues:
 * - OpenMeet-Team/openmeet-api#422
 * - OpenMeet-Team/openmeet-platform#317
 */
describe('Event Image Update (e2e)', () => {
  jest.setTimeout(60000);

  let token: string;

  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should update event image and persist the change', async () => {
    // Step 1: Create a group (required for event)
    const groupData = {
      name: `Test Group ${Date.now()}`,
      description: 'A group for testing image updates',
      status: GroupStatus.Published,
    };
    const group = await createGroup(TESTING_APP_URL, token, groupData);
    expect(group.id).toBeDefined();

    // Step 2: Create first file (initial image)
    const file1 = await createFile(TESTING_APP_URL, token, {
      fileName: 'initial-image.jpg',
    });
    console.log('Created file 1:', { id: file1.id, path: file1.path });
    expect(file1.id).toBeDefined();

    // Step 3: Create event WITH the initial image
    const eventData = {
      name: `Test Event ${Date.now()}`,
      description: 'An event to test image updates',
      type: EventType.Hybrid,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      lat: 0,
      lon: 0,
      status: EventStatus.Published,
      group: group.id,
      timeZone: 'UTC',
      image: { id: file1.id },
    };

    const event = await createEvent(TESTING_APP_URL, token, eventData);
    console.log('Created event:', {
      slug: event.slug,
      imageId: event.image?.id,
    });
    expect(event.slug).toBeDefined();
    expect(event.image).toBeDefined();
    expect(event.image.id).toBe(file1.id);

    // Step 4: Create second file (new image)
    const file2 = await createFile(TESTING_APP_URL, token, {
      fileName: 'updated-image.jpg',
    });
    console.log('Created file 2:', { id: file2.id, path: file2.path });
    expect(file2.id).toBeDefined();
    expect(file2.id).not.toBe(file1.id);

    // Step 5: Update event with new image
    const updateData = {
      image: { id: file2.id },
    };
    console.log('Updating event with:', updateData);

    const updatedEvent = await updateEvent(
      TESTING_APP_URL,
      token,
      event.slug,
      updateData,
    );
    console.log('Updated event response:', {
      slug: updatedEvent.slug,
      imageId: updatedEvent.image?.id,
    });

    // Step 6: Verify update response has new image
    expect(updatedEvent.image).toBeDefined();
    expect(updatedEvent.image.id).toBe(file2.id);

    // Step 7: Fetch event fresh and verify image persisted
    const fetchedEvent = await getEvent(TESTING_APP_URL, token, event.slug);
    console.log('Fetched event:', {
      slug: fetchedEvent.slug,
      imageId: fetchedEvent.image?.id,
    });

    // THIS IS THE CRITICAL ASSERTION
    // If the bug exists, this will fail because imageId wasn't updated in DB
    expect(fetchedEvent.image).toBeDefined();
    expect(fetchedEvent.image.id).toBe(file2.id);
  });

  it('should update event image when passing full FileEntity object', async () => {
    // This test mimics what the frontend actually sends (full FileEntity, not just {id})

    // Step 1: Create a group
    const groupData = {
      name: `Test Group Full Entity ${Date.now()}`,
      description: 'Testing full entity image update',
      status: GroupStatus.Published,
    };
    const group = await createGroup(TESTING_APP_URL, token, groupData);

    // Step 2: Create initial file
    const file1 = await createFile(TESTING_APP_URL, token, {
      fileName: 'initial-full.jpg',
    });

    // Step 3: Create event with initial image
    const eventData = {
      name: `Test Event Full Entity ${Date.now()}`,
      description: 'Testing full entity image update',
      type: EventType.InPerson,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 50,
      location: 'Test Location',
      lat: 0,
      lon: 0,
      status: EventStatus.Published,
      group: group.id,
      timeZone: 'UTC',
      image: { id: file1.id },
    };

    const event = await createEvent(TESTING_APP_URL, token, eventData);
    expect(event.image.id).toBe(file1.id);

    // Step 4: Create new file
    const file2 = await createFile(TESTING_APP_URL, token, {
      fileName: 'updated-full.jpg',
    });

    // Step 5: Update with FULL FileEntity object (like frontend sends)
    // This is the pattern that may be broken
    const updateData = {
      image: file2, // Full object: { id, path, fileName, fileSize, mimeType, ... }
    };
    console.log('Updating with full FileEntity:', {
      imageId: file2.id,
      imagePath: file2.path,
      imageFileName: file2.fileName,
    });

    const updatedEvent = await updateEvent(
      TESTING_APP_URL,
      token,
      event.slug,
      updateData,
    );

    // Step 6: Verify update response
    expect(updatedEvent.image).toBeDefined();
    expect(updatedEvent.image.id).toBe(file2.id);

    // Step 7: Fetch fresh and verify persistence
    const fetchedEvent = await getEvent(TESTING_APP_URL, token, event.slug);

    // CRITICAL: This tests the actual bug scenario
    expect(fetchedEvent.image).toBeDefined();
    expect(fetchedEvent.image.id).toBe(file2.id);
  });

  it('should add image to event that had no image', async () => {
    // Step 1: Create a group
    const groupData = {
      name: `Test Group No Image ${Date.now()}`,
      description: 'Testing adding image to event without one',
      status: GroupStatus.Published,
    };
    const group = await createGroup(TESTING_APP_URL, token, groupData);

    // Step 2: Create event WITHOUT image
    const eventData = {
      name: `Test Event No Image ${Date.now()}`,
      description: 'Event created without image',
      type: EventType.Online,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      lat: 0,
      lon: 0,
      status: EventStatus.Published,
      group: group.id,
      timeZone: 'UTC',
      // No image field
    };

    const event = await createEvent(TESTING_APP_URL, token, eventData);
    expect(event.image).toBeFalsy(); // null or undefined

    // Step 3: Create a file
    const file = await createFile(TESTING_APP_URL, token, {
      fileName: 'new-image.jpg',
    });

    // Step 4: Update event to add image
    const updateData = {
      image: file,
    };

    const updatedEvent = await updateEvent(
      TESTING_APP_URL,
      token,
      event.slug,
      updateData,
    );

    expect(updatedEvent.image).toBeDefined();
    expect(updatedEvent.image.id).toBe(file.id);

    // Step 5: Verify persistence
    const fetchedEvent = await getEvent(TESTING_APP_URL, token, event.slug);
    expect(fetchedEvent.image).toBeDefined();
    expect(fetchedEvent.image.id).toBe(file.id);
  });
});
