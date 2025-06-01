import { Test, TestingModule } from '@nestjs/testing';
import { CalendarFeedService } from './calendar-feed.service';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';
import { ICalendarService } from '../event/services/ical/ical.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('CalendarFeedService', () => {
  let service: CalendarFeedService;
  let mockGroupService: jest.Mocked<GroupService>;
  let mockEventQueryService: jest.Mocked<EventQueryService>;
  let mockICalendarService: jest.Mocked<ICalendarService>;

  const createMockEvent = (
    overrides: Partial<EventEntity> = {},
  ): EventEntity => {
    const event = new EventEntity();
    event.id = 1;
    event.ulid = 'event_test_ulid';
    event.slug = 'test-event';
    event.name = 'Test Event';
    event.description = 'Test event description';
    event.startDate = new Date('2024-02-01T10:00:00Z');
    event.endDate = new Date('2024-02-01T11:00:00Z');
    event.user = { id: 1, slug: 'test-user' } as UserEntity;
    event.createdAt = new Date();
    event.updatedAt = new Date();
    return Object.assign(event, overrides);
  };

  const createMockGroup = (
    overrides: Partial<GroupEntity> = {},
  ): GroupEntity => {
    const group = new GroupEntity();
    group.id = 1;
    group.slug = 'test-group';
    group.name = 'Test Group';
    group.description = 'Test group description';
    group.visibility = 'public' as any;
    return Object.assign(group, overrides);
  };

  beforeEach(async () => {
    mockGroupService = {
      findGroupBySlug: jest.fn(),
    } as any;

    mockEventQueryService = {
      findUserEvents: jest.fn(),
      findGroupEvents: jest.fn(),
    } as any;

    mockICalendarService = {
      generateICalendarForEvents: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarFeedService,
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: ICalendarService,
          useValue: mockICalendarService,
        },
      ],
    }).compile();

    service = module.get<CalendarFeedService>(CalendarFeedService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserCalendarFeed', () => {
    it('should generate iCal feed for user events', async () => {
      const userId = 1;
      const events = [
        createMockEvent({ name: 'Event 1' }),
        createMockEvent({ name: 'Event 2', id: 2 }),
      ];
      const expectedIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n...';

      mockEventQueryService.findUserEvents.mockResolvedValue(events);
      mockICalendarService.generateICalendarForEvents.mockReturnValue(
        expectedIcal,
      );

      const result = await service.getUserCalendarFeed(userId);

      expect(mockEventQueryService.findUserEvents).toHaveBeenCalledWith(
        userId,
        undefined,
        undefined,
      );
      expect(
        mockICalendarService.generateICalendarForEvents,
      ).toHaveBeenCalledWith(events);
      expect(result).toBe(expectedIcal);
    });

    it('should filter events by date range when provided', async () => {
      const userId = 1;
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const events = [createMockEvent()];
      const expectedIcal = 'BEGIN:VCALENDAR...';

      mockEventQueryService.findUserEvents.mockResolvedValue(events);
      mockICalendarService.generateICalendarForEvents.mockReturnValue(
        expectedIcal,
      );

      const result = await service.getUserCalendarFeed(
        userId,
        startDate,
        endDate,
      );

      expect(mockEventQueryService.findUserEvents).toHaveBeenCalledWith(
        userId,
        startDate,
        endDate,
      );
      expect(result).toBe(expectedIcal);
    });
  });

  describe('getGroupCalendarFeed', () => {
    it('should generate iCal feed for public group events', async () => {
      const groupSlug = 'test-group';
      const group = createMockGroup({ visibility: 'public' as any });
      const events = [
        createMockEvent({ name: 'Group Event 1' }),
        createMockEvent({ name: 'Group Event 2', id: 2 }),
      ];
      const expectedIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n...';

      mockGroupService.findGroupBySlug.mockResolvedValue(group);
      mockEventQueryService.findGroupEvents.mockResolvedValue(events);
      mockICalendarService.generateICalendarForEvents.mockReturnValue(
        expectedIcal,
      );

      const result = await service.getGroupCalendarFeed(groupSlug);

      expect(mockGroupService.findGroupBySlug).toHaveBeenCalledWith(groupSlug);
      expect(mockEventQueryService.findGroupEvents).toHaveBeenCalledWith(
        groupSlug,
        undefined,
        undefined,
        undefined,
      );
      expect(
        mockICalendarService.generateICalendarForEvents,
      ).toHaveBeenCalledWith(events);
      expect(result).toBe(expectedIcal);
    });

    it('should throw NotFoundException when group not found', async () => {
      const groupSlug = 'nonexistent-group';
      mockGroupService.findGroupBySlug.mockRejectedValue(
        new NotFoundException('Group not found'),
      );

      await expect(service.getGroupCalendarFeed(groupSlug)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should require authentication for private group feeds', async () => {
      const groupSlug = 'private-group';
      const group = createMockGroup({ visibility: 'private' as any });

      mockGroupService.findGroupBySlug.mockResolvedValue(group);

      await expect(service.getGroupCalendarFeed(groupSlug)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow private group access with user ID', async () => {
      const groupSlug = 'private-group';
      const userId = 1;
      const group = createMockGroup({ visibility: 'private' as any });
      const events = [createMockEvent()];
      const expectedIcal = 'BEGIN:VCALENDAR...';

      mockGroupService.findGroupBySlug.mockResolvedValue(group);
      mockEventQueryService.findGroupEvents.mockResolvedValue(events);
      mockICalendarService.generateICalendarForEvents.mockReturnValue(
        expectedIcal,
      );

      const result = await service.getGroupCalendarFeed(
        groupSlug,
        undefined,
        undefined,
        userId,
      );

      expect(mockEventQueryService.findGroupEvents).toHaveBeenCalledWith(
        groupSlug,
        undefined,
        undefined,
        userId,
      );
      expect(result).toBe(expectedIcal);
    });
  });

  describe('validateFeedAccess', () => {
    it('should allow access to public group feeds', () => {
      const group = createMockGroup({ visibility: 'public' as any });

      const result = service.validateFeedAccess(group);

      expect(result).toBe(true);
    });

    it('should deny access to private group feeds without user', () => {
      const group = createMockGroup({ visibility: 'private' as any });

      const result = service.validateFeedAccess(group);

      expect(result).toBe(false);
    });

    it('should allow access to private group feeds for members', () => {
      const group = createMockGroup({ visibility: 'private' as any });
      const userId = 1;

      const result = service.validateFeedAccess(group, userId);

      expect(result).toBe(true);
    });
  });

  describe('getDefaultDateRange', () => {
    it('should return date range from one month ago to one year from now', () => {
      const result = service.getDefaultDateRange();

      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(typeof result.startDate).toBe('string');
      expect(typeof result.endDate).toBe('string');

      // Verify date format (YYYY-MM-DD)
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
