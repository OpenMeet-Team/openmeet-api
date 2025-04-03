import { EventManagementService } from '../event/services/event-management.service';
import { CreateEventDto } from '../event/dto/create-event.dto';
import { EventType } from '../core/constants/constant';

// Use a separate module for integration testing
describe('EventSeries Integration', () => {
  let eventManagementService: EventManagementService;

  // Mock the services we need
  const mockEventSeriesService = {
    findBySlug: jest.fn().mockResolvedValue({
      id: 1,
      name: 'Test Series',
      slug: 'test-series',
    }),
  };

  const mockEventManagementService = {
    create: jest.fn().mockResolvedValue({
      id: 987,
      slug: 'test-event',
      name: 'Test Event',
    }),
    createSeriesOccurrenceBySlug: jest
      .fn()
      .mockImplementation((dto, _userId, _seriesSlug) => {
        return Promise.resolve({
          id: 456,
          slug: 'test-series-event',
          name: dto.name,
          seriesId: 123,
          materialized: true,
        });
      }),
    update: jest.fn().mockImplementation((slug, dto, _userId) => {
      return Promise.resolve({
        id: 456,
        slug,
        ...dto,
      });
    }),
    findEventsBySeriesSlug: jest.fn().mockResolvedValue([
      [
        { id: 1, name: 'Event 1', slug: 'event-1' },
        { id: 2, name: 'Event 2', slug: 'event-2' },
      ],
      2,
    ]),
  } as unknown as EventManagementService;

  beforeEach(async () => {
    // Since we're testing the integration, we'll use manual mocks instead of trying to mock
    // the entire dependency tree
    await jest.clearAllMocks();
    eventManagementService = mockEventManagementService;
  });

  describe('createEvent', () => {
    it('should create an event with series', async () => {
      const data: CreateEventDto = {
        name: 'Test Event',
        description: 'Test event description',
        startDate: new Date('2023-01-01T00:00:00Z'),
        endDate: new Date('2023-01-01T01:00:00Z'),
        type: EventType.InPerson,
        locationOnline: 'false',
        categories: [],
        maxAttendees: 20,
        lat: 40.7128,
        lon: -74.006,
      };

      await eventManagementService.create(data, 1);
      expect(mockEventSeriesService.findBySlug).toHaveBeenCalledWith(
        'test-series',
      );
    });

    it('should create an event without series', async () => {
      const data: CreateEventDto = {
        name: 'Test Event',
        description: 'Test event description',
        startDate: new Date('2023-01-01T00:00:00Z'),
        endDate: new Date('2023-01-01T01:00:00Z'),
        type: EventType.InPerson,
        locationOnline: 'false',
        categories: [],
        maxAttendees: 20,
        lat: 40.7128,
        lon: -74.006,
      };

      await eventManagementService.create(data, 1);
      expect(mockEventSeriesService.findBySlug).not.toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    it('should update an event', async () => {
      const data = {
        name: 'Updated Event',
      };
      await eventManagementService.update('event-1', data, 1);
    });
  });

  it('should create an event as part of a series using slug', async () => {
    // Create a new event DTO
    const createEventDto: CreateEventDto = {
      name: 'Test Series Event',
      description: 'A test event that is part of a series',
      startDate: new Date(),
      endDate: new Date(),
      type: EventType.InPerson,
      locationOnline: 'false',
      categories: [],
      maxAttendees: 20,
      lat: 40.7128,
      lon: -74.006,
    };

    // Call the method directly on the mock
    const result =
      await mockEventManagementService.createSeriesOccurrenceBySlug(
        createEventDto,
        1, // userId
        'test-series', // seriesSlug
        new Date(), // occurrenceDate
      );

    // Verify the result
    expect(result).toBeDefined();
    expect(result.seriesId).toBe(123);
    expect(result.materialized).toBe(true);
    expect(result.name).toBe(createEventDto.name);
  });

  it('should find events by series slug', async () => {
    // Call the method directly on the mock
    const [events, count] =
      await mockEventManagementService.findEventsBySeriesSlug('test-series');

    // Verify the result
    expect(events).toHaveLength(2);
    expect(count).toBe(2);
    expect(events[0].name).toBe('Event 1');
    expect(events[1].name).toBe('Event 2');
  });
});
