import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let calendarSourceService: jest.Mocked<CalendarSourceService>;
  let externalEventRepository: jest.Mocked<ExternalEventRepository>;

  const mockCalendarSource1 = new CalendarSourceEntity();
  mockCalendarSource1.id = 1;
  mockCalendarSource1.ulid = 'calendar_ulid_1';
  mockCalendarSource1.userId = 1;
  mockCalendarSource1.type = CalendarSourceType.GOOGLE;
  mockCalendarSource1.name = 'Work Calendar';
  mockCalendarSource1.isActive = true;

  const mockCalendarSource2 = new CalendarSourceEntity();
  mockCalendarSource2.id = 2;
  mockCalendarSource2.ulid = 'calendar_ulid_2';
  mockCalendarSource2.userId = 1;
  mockCalendarSource2.type = CalendarSourceType.OUTLOOK;
  mockCalendarSource2.name = 'Personal Calendar';
  mockCalendarSource2.isActive = true;

  beforeEach(async () => {
    const mockCalendarSourceService = {
      findAllByUser: jest.fn(),
      findByUlid: jest.fn(),
    };

    const mockExternalEventRepository = {
      findByTimeRange: jest.fn(),
      findByCalendarSourceAndTimeRange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: CalendarSourceService,
          useValue: mockCalendarSourceService,
        },
        {
          provide: ExternalEventRepository,
          useValue: mockExternalEventRepository,
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    calendarSourceService = module.get(CalendarSourceService);
    externalEventRepository = module.get(ExternalEventRepository);
  });

  describe('checkAvailability', () => {
    const startTime = new Date('2024-01-15T10:00:00Z');
    const endTime = new Date('2024-01-15T11:00:00Z');
    const userId = 1;
    const tenantId = 'test-tenant-1';

    it('should return available when no conflicts exist', async () => {
      const calendarSourceIds = ['calendar_ulid_1', 'calendar_ulid_2'];
      
      calendarSourceService.findByUlid
        .mockResolvedValueOnce(mockCalendarSource1)
        .mockResolvedValueOnce(mockCalendarSource2);

      externalEventRepository.findByCalendarSourceAndTimeRange.mockResolvedValue([]);

      const result = await service.checkAvailability(
        userId,
        startTime,
        endTime,
        calendarSourceIds,
        tenantId
      );

      expect(result).toEqual({
        available: true,
        conflicts: [],
        conflictingEvents: [],
      });

      expect(calendarSourceService.findByUlid).toHaveBeenCalledTimes(2);
      expect(externalEventRepository.findByCalendarSourceAndTimeRange).toHaveBeenCalledTimes(2);
    });

    it('should return conflicts when events overlap', async () => {
      const calendarSourceIds = ['calendar_ulid_1'];
      const conflictingEvent = {
        id: 1,
        ulid: 'event_ulid_123',
        externalId: 'event_123',
        summary: 'Existing Meeting',
        startTime: new Date('2024-01-15T10:30:00Z'),
        endTime: new Date('2024-01-15T11:30:00Z'),
        isAllDay: false,
        status: 'busy' as const,
        calendarSourceId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource1);
      externalEventRepository.findByCalendarSourceAndTimeRange.mockResolvedValue([conflictingEvent as any]);

      const result = await service.checkAvailability(
        userId,
        startTime,
        endTime,
        calendarSourceIds,
        tenantId
      );

      expect(result).toEqual({
        available: false,
        conflicts: ['calendar_ulid_1'],
        conflictingEvents: [
          {
            eventId: conflictingEvent.externalId,
            title: conflictingEvent.summary,
            startTime: conflictingEvent.startTime,
            endTime: conflictingEvent.endTime,
            calendarSourceUlid: 'calendar_ulid_1',
          },
        ],
      });
    });

    it('should use all user calendars when calendarSourceIds is empty', async () => {
      calendarSourceService.findAllByUser.mockResolvedValue([mockCalendarSource1, mockCalendarSource2]);
      externalEventRepository.findByCalendarSourceAndTimeRange.mockResolvedValue([]);

      const result = await service.checkAvailability(
        userId,
        startTime,
        endTime,
        [],
        tenantId
      );

      expect(result.available).toBe(true);
      expect(calendarSourceService.findAllByUser).toHaveBeenCalledWith(userId, tenantId);
      expect(externalEventRepository.findByCalendarSourceAndTimeRange).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException for invalid time range', async () => {
      const invalidEndTime = new Date('2024-01-15T09:00:00Z'); // Before start time

      await expect(
        service.checkAvailability(userId, startTime, invalidEndTime, [], tenantId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent calendar source', async () => {
      const calendarSourceIds = ['non_existent_ulid'];
      
      calendarSourceService.findByUlid.mockRejectedValue(
        new NotFoundException('Calendar source with ULID non_existent_ulid not found')
      );

      await expect(
        service.checkAvailability(userId, startTime, endTime, calendarSourceIds, tenantId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate user ownership of calendar sources', async () => {
      const otherUserCalendar = { ...mockCalendarSource1, userId: 999 };
      const calendarSourceIds = ['calendar_ulid_1'];
      
      calendarSourceService.findByUlid.mockResolvedValue(otherUserCalendar as CalendarSourceEntity);

      await expect(
        service.checkAvailability(userId, startTime, endTime, calendarSourceIds, tenantId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getConflicts', () => {
    const startTime = new Date('2024-01-15T09:00:00Z');
    const endTime = new Date('2024-01-15T17:00:00Z');
    const userId = 1;
    const tenantId = 'test-tenant-1';

    it('should return all conflicts in time range', async () => {
      const calendarSourceIds = ['calendar_ulid_1'];
      const events = [
        {
          id: 1,
          ulid: 'event_ulid_1',
          externalId: 'event_1',
          summary: 'Morning Meeting',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          isAllDay: false,
          status: 'busy' as const,
          calendarSourceId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          ulid: 'event_ulid_2',
          externalId: 'event_2',
          summary: 'Afternoon Meeting',
          startTime: new Date('2024-01-15T14:00:00Z'),
          endTime: new Date('2024-01-15T15:00:00Z'),
          isAllDay: false,
          status: 'busy' as const,
          calendarSourceId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource1);
      externalEventRepository.findByCalendarSourceAndTimeRange.mockResolvedValue(events as any);

      const result = await service.getConflicts(
        userId,
        startTime,
        endTime,
        calendarSourceIds,
        tenantId
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        eventId: 'event_1',
        title: 'Morning Meeting',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        calendarSourceUlid: 'calendar_ulid_1',
      });
    });

    it('should return empty array when no events found', async () => {
      const calendarSourceIds = ['calendar_ulid_1'];
      
      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource1);
      externalEventRepository.findByCalendarSourceAndTimeRange.mockResolvedValue([]);

      const result = await service.getConflicts(
        userId,
        startTime,
        endTime,
        calendarSourceIds,
        tenantId
      );

      expect(result).toEqual([]);
    });

    it('should handle multiple calendar sources', async () => {
      const calendarSourceIds = ['calendar_ulid_1', 'calendar_ulid_2'];
      const events1 = [{
        id: 1,
        ulid: 'event_ulid_1',
        externalId: 'event_1',
        summary: 'Work Meeting',
        startTime: new Date('2024-01-15T10:00:00Z'),
        endTime: new Date('2024-01-15T11:00:00Z'),
        isAllDay: false,
        status: 'busy' as const,
        calendarSourceId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];
      const events2 = [{
        id: 2,
        ulid: 'event_ulid_2',
        externalId: 'event_2',
        summary: 'Personal Appointment',
        startTime: new Date('2024-01-15T14:00:00Z'),
        endTime: new Date('2024-01-15T15:00:00Z'),
        isAllDay: false,
        status: 'busy' as const,
        calendarSourceId: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      calendarSourceService.findByUlid
        .mockResolvedValueOnce(mockCalendarSource1)
        .mockResolvedValueOnce(mockCalendarSource2);
      
      externalEventRepository.findByCalendarSourceAndTimeRange
        .mockResolvedValueOnce(events1 as any)
        .mockResolvedValueOnce(events2 as any);

      const result = await service.getConflicts(
        userId,
        startTime,
        endTime,
        calendarSourceIds,
        tenantId
      );

      expect(result).toHaveLength(2);
      expect(result[0].calendarSourceUlid).toBe('calendar_ulid_1');
      expect(result[1].calendarSourceUlid).toBe('calendar_ulid_2');
    });
  });
});