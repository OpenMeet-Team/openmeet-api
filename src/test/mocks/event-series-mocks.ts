import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventType } from '../../core/constants/constant';
import { mockUser } from './user-mocks';
import { mockGroup } from './group-mocks';

// Mock EventSeries
export const mockEventSeries = {
  id: 1,
  name: 'Test Series',
  slug: 'test-series',
  description: 'A test series description',
  timeZone: 'America/New_York',
  recurrenceRule: {
    freq: 'WEEKLY',
    interval: 1,
    byday: ['MO', 'WE', 'FR'],
  },
  user: mockUser,
  group: mockGroup,
  createdAt: new Date('2025-09-01T00:00:00Z'),
  updatedAt: new Date('2025-09-01T00:00:00Z'),
  events: [],
  recurrenceDescription: 'Weekly on Monday, Wednesday, Friday',
  // Add missing properties
  ulid: '01h2j3k4m5n6p7q8r9s0t1u2v3',
  matrixRoomId: '!room:matrix.org',
  sourceType: null,
  sourceId: null,
  sourceUrl: null,
  sourceData: null,
  // Methods from EntityRelationalHelper
  toJSON: () => ({}),
  toString: () => '',
} as unknown as EventSeriesEntity;

// Mock Series Event
export const mockSeriesEvent = {
  id: 1,
  name: 'Test Event',
  slug: 'test-event',
  description: 'Test event description',
  startDate: new Date('2025-10-01T15:00:00Z'),
  endDate: new Date('2025-10-01T17:00:00Z'),
  timeZone: 'America/New_York',
  type: EventType.InPerson,
  location: 'Test Location',
  locationOnline: 'https://zoom.us/j/123456789',
  maxAttendees: 20,
  requireApproval: false,
  approvalQuestion: '',
  allowWaitlist: true,
  series: mockEventSeries,
  seriesId: 1,
  materialized: true,
  originalOccurrenceDate: new Date('2025-10-01T15:00:00Z'),
  isRecurring: true,
  user: mockUser,
  createdAt: new Date(),
  updatedAt: new Date(),
  // Add missing properties
  ulid: '01h2j3k4m5n6p7q8r9s0t1u2v4',
  status: 'published',
  visibility: 'public',
  categories: [],
  attendees: [],
  attendeesCount: 0,
  // Methods from EntityRelationalHelper
  toJSON: () => ({}),
  toString: () => '',
} as unknown as EventEntity;

export const mockEventSeriesList = [
  { ...mockEventSeries, id: 1, slug: 'test-series-1' },
  { ...mockEventSeries, id: 2, slug: 'test-series-2' },
  { ...mockEventSeries, id: 3, slug: 'test-series-3' }
];

export const mockSeriesOccurrences = [
  { ...mockSeriesEvent, id: 1, originalOccurrenceDate: new Date('2025-10-01T15:00:00Z') },
  { ...mockSeriesEvent, id: 2, originalOccurrenceDate: new Date('2025-10-03T15:00:00Z') },
  { ...mockSeriesEvent, id: 3, originalOccurrenceDate: new Date('2025-10-05T15:00:00Z') },
];

// Mock Repository
export const mockEventSeriesRepository = {
  findById: jest.fn().mockImplementation(id => Promise.resolve(
    mockEventSeriesList.find(series => series.id === id)
  )),
  
  findBySlug: jest.fn().mockImplementation(slug => Promise.resolve(
    mockEventSeriesList.find(series => series.slug === slug)
  )),
  
  findByUser: jest.fn().mockImplementation((userId, options = { page: 1, limit: 10 }) => {
    const series = mockEventSeriesList;
    return Promise.resolve([series, series.length]);
  }),
  
  findByGroup: jest.fn().mockImplementation((groupId, options = { page: 1, limit: 10 }) => {
    const series = mockEventSeriesList;
    return Promise.resolve([series, series.length]);
  }),
  
  create: jest.fn().mockImplementation(data => Promise.resolve({
    ...mockEventSeries,
    ...data,
    id: Math.floor(Math.random() * 1000),
    slug: data.slug || `test-series-${Math.floor(Math.random() * 1000)}`,
  })),
  
  update: jest.fn().mockImplementation((id, data) => Promise.resolve({
    ...mockEventSeries,
    ...data,
    id
  })),
  
  delete: jest.fn().mockImplementation(() => Promise.resolve()),
};

// Mock Service
export const mockEventSeriesService = {
  create: jest.fn().mockResolvedValue(mockEventSeries),
  findAll: jest.fn().mockResolvedValue({ data: mockEventSeriesList, total: mockEventSeriesList.length }),
  findByUser: jest.fn().mockResolvedValue({ data: mockEventSeriesList, total: mockEventSeriesList.length }),
  findByGroup: jest.fn().mockResolvedValue({ data: mockEventSeriesList, total: mockEventSeriesList.length }),
  findBySlug: jest.fn().mockResolvedValue(mockEventSeries),
  update: jest.fn().mockResolvedValue(mockEventSeries),
  delete: jest.fn().mockResolvedValue(undefined),
};

// Mock Series Occurrence Service
export const mockEventSeriesOccurrenceService = {
  getOrCreateOccurrence: jest.fn().mockImplementation((seriesSlug, occurrenceDate) => {
    return Promise.resolve(mockSeriesOccurrences.find(
      occ => occ.originalOccurrenceDate.toISOString() === new Date(occurrenceDate).toISOString()
    ) || mockSeriesOccurrences[0]);
  }),
  
  findOccurrence: jest.fn().mockImplementation((seriesSlug, occurrenceDate) => {
    return Promise.resolve(mockSeriesOccurrences.find(
      occ => occ.originalOccurrenceDate.toISOString() === new Date(occurrenceDate).toISOString()
    ));
  }),
  
  materializeOccurrence: jest.fn().mockImplementation((seriesSlug, occurrenceDate) => {
    const date = new Date(occurrenceDate);
    return Promise.resolve({
      ...mockSeriesEvent,
      id: Math.floor(Math.random() * 1000),
      startDate: date,
      originalOccurrenceDate: date,
    });
  }),
  
  getUpcomingOccurrences: jest.fn().mockImplementation(() => {
    return Promise.resolve(mockSeriesOccurrences.map((event, i) => ({
      date: event.startDate.toISOString(),
      event: i === 0 ? event : undefined,
      materialized: i === 0,
    })));
  }),
  
  materializeNextOccurrence: jest.fn().mockResolvedValue(mockSeriesOccurrences[1]),
  
  updateFutureOccurrences: jest.fn().mockResolvedValue(2),
};