import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesOccurrenceService } from './event-series-occurrence.service';
import { EventSeriesService } from './event-series.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Test to reveal DST materialization bug (Issue #281)
 *
 * When materializing occurrences across DST boundaries, the system copies
 * the template event's UTC time without accounting for timezone transitions.
 */
describe('DST Materialization Bug', () => {
  let service: EventSeriesOccurrenceService;
  let eventManagementService: EventManagementService;
  let eventSeriesService: EventSeriesService;

  const mockUserId = 1;
  const mockTenantId = 'tenant_test';
  const timezone = 'America/Vancouver';

  // Template event created in October (during PDT, UTC-7)
  const templateEvent = {
    id: 1,
    slug: 'template-event',
    name: 'Weekly Meeting',
    description: 'Test meeting',
    startDate: new Date('2025-10-08T02:00:00.000Z'), // 7pm PDT (Oct 7 local)
    endDate: new Date('2025-10-08T04:00:00.000Z'), // 9pm PDT
    type: 'in-person',
    location: 'Test Location',
    lat: null,
    lon: null,
    locationOnline: '',
    maxAttendees: 100,
    requireApproval: false,
    approvalQuestion: '',
    requireGroupMembership: false,
    allowWaitlist: false,
    status: 'published',
    visibility: 'public',
    categories: [],
    seriesSlug: 'weekly-meeting-series',
    group: null,
    image: null,
    securityClass: null,
    priority: null,
    isAllDay: false,
    blocksTime: true,
    resources: null,
    color: null,
    conferenceData: null,
    timeZone: timezone,
  };

  const mockSeries = {
    slug: 'weekly-meeting-series',
    name: 'Weekly Meeting',
    description: 'Test meeting series',
    timeZone: timezone,
    templateEventSlug: 'template-event',
    recurrenceRule: {
      frequency: 'WEEKLY',
      interval: 1,
      byweekday: ['WE'],
    },
  };

  const mockUser = {
    id: mockUserId,
    email: 'test@example.com',
    slug: 'test-user',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSeriesOccurrenceService,
        {
          provide: EventSeriesService,
          useValue: {
            findBySlug: jest.fn().mockResolvedValue(mockSeries),
          },
        },
        {
          provide: EventManagementService,
          useValue: {
            findEventsBySeriesSlug: jest.fn().mockResolvedValue([[], 0]),
            create: jest.fn(),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findEventBySlug: jest.fn().mockResolvedValue(templateEvent),
          },
        },
        {
          provide: RecurrencePatternService,
          useValue: {},
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockUser),
          },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn(),
          },
        },
        {
          provide: REQUEST,
          useValue: {
            tenantId: mockTenantId,
          },
        },
      ],
    }).compile();

    // Use resolve() for REQUEST-scoped providers
    service = await module.resolve<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    eventManagementService = module.get<EventManagementService>(
      EventManagementService,
    );
    eventSeriesService = module.get<EventSeriesService>(EventSeriesService);
  });

  it('should maintain 7pm local time when materializing across DST boundary', async () => {
    // Template: Oct 7, 2025 at 7:00 PM PDT = UTC 02:00
    const templateStartLocal = formatInTimeZone(
      templateEvent.startDate,
      timezone,
      'h:mm a zzz',
    );
    expect(templateStartLocal).toBe('7:00 PM PDT');

    // Capture the DTO passed to eventManagementService.create()
    let capturedDto: any = null;
    jest.spyOn(eventManagementService, 'create').mockImplementation((dto: any) => {
      capturedDto = dto;
      return Promise.resolve({
        ...templateEvent,
        ...dto,
        id: 2,
        slug: 'materialized-event',
        seriesSlug: dto.seriesSlug,
      } as any);
    });

    // Materialize occurrence for November 12 (after DST ended on Nov 2)
    // Pass the date in the format RRule generates it (just the date part)
    const occurrenceDate = '2025-11-12';

    await service.materializeOccurrence(
      'weekly-meeting-series',
      occurrenceDate,
      mockUserId,
      mockTenantId,
    );

    expect(capturedDto).toBeDefined();

    console.log('\n=== Debug Info ===');
    console.log('Occurrence date passed:', occurrenceDate);
    console.log('Created startDate UTC:', capturedDto.startDate.toISOString());
    console.log('Template startDate UTC:', templateEvent.startDate.toISOString());

    // Convert created dates to local time
    const createdStartLocal = formatInTimeZone(
      capturedDto.startDate,
      timezone,
      'h:mm a zzz',
    );
    const createdEndLocal = formatInTimeZone(
      capturedDto.endDate,
      timezone,
      'h:mm a zzz',
    );

    console.log('Created startDate local:', createdStartLocal);
    console.log('Created endDate local:', createdEndLocal);

    // Should maintain 7pm local time (now PST instead of PDT)
    // Expected: 7:00 PM PST = UTC 03:00 (UTC-8)
    // Bug: Creates 6:00 PM PST because it uses UTC 02:00 from template
    expect(createdStartLocal).toBe('7:00 PM PST');
    expect(createdEndLocal).toBe('9:00 PM PST');

    // Verify UTC time adjusted for DST
    // November 7pm PST should be UTC 03:00 (not 02:00)
    expect(capturedDto.startDate.getUTCHours()).toBe(3);
  });

  it('should maintain same duration across DST boundary', async () => {
    let capturedDto: any = null;
    jest.spyOn(eventManagementService, 'create').mockImplementation((dto: any) => {
      capturedDto = dto;
      return Promise.resolve({
        ...templateEvent,
        ...dto,
        id: 2,
        slug: 'materialized-event',
      } as any);
    });

    await service.materializeOccurrence(
      'weekly-meeting-series',
      '2025-11-12T00:00:00.000Z',
      mockUserId,
      mockTenantId,
    );

    // Template duration: 2 hours (7pm-9pm)
    const templateDuration =
      templateEvent.endDate.getTime() - templateEvent.startDate.getTime();

    const createdDuration =
      capturedDto.endDate.getTime() - capturedDto.startDate.getTime();

    expect(createdDuration).toBe(templateDuration);
    expect(createdDuration).toBe(2 * 60 * 60 * 1000); // 2 hours
  });
});
