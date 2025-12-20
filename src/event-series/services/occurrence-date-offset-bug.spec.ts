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
 * Test for Issue #421: Series occurrence instantiation creates event with wrong date offset
 *
 * KEY INSIGHT: Existing tests (dst-materialization-bug.spec.ts) pass a date-only string
 * like '2025-11-12'. But getUpcomingOccurrences returns full UTC ISO strings like
 * '2026-03-12T03:00:00.000Z'. The bug only occurs with full UTC ISO strings because
 * split('T')[0] extracts the UTC date, not the local date.
 *
 * This test covers the actual bug scenario where:
 * 1. generateOccurrences returns '2026-03-12T03:00:00.000Z' (March 11 7pm PST in UTC)
 * 2. User sees "Wednesday, March 11, 2026 at 7:00 PM" in the UI
 * 3. User clicks to instantiate
 * 4. materializeOccurrence receives '2026-03-12T03:00:00.000Z'
 * 5. BUG: split('T')[0] extracts '2026-03-12' (Thursday) instead of '2026-03-11' (Wednesday)
 */
describe('Occurrence Date Offset Bug (#421)', () => {
  let service: EventSeriesOccurrenceService;
  let eventManagementService: EventManagementService;

  const mockUserId = 1;
  const mockTenantId = 'tenant_test';
  const timezone = 'America/Vancouver'; // PST/PDT

  // Template event: 2nd Wednesday of January 2026 at 7:00 PM PST
  // January 14, 2026 is a Wednesday, at 7pm PST = Jan 15, 3am UTC
  const templateEvent = {
    id: 1,
    slug: 'crmc-monthly-meeting-template',
    name: 'CRMC Monthly Meeting',
    description: 'Monthly meetings are the 2nd Wednesday each month',
    startDate: new Date('2026-01-15T03:00:00.000Z'), // Jan 14, 7pm PST
    endDate: new Date('2026-01-15T05:00:00.000Z'), // Jan 14, 9pm PST
    type: 'in-person',
    location: 'Royal Canadian Legion Branch 119',
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
    seriesSlug: 'crmc-monthly-meeting-series',
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
    slug: 'crmc-monthly-meeting-series',
    name: 'CRMC Monthly Meeting Series',
    description: 'Monthly on the 2nd Wednesday',
    timeZone: timezone,
    templateEventSlug: 'crmc-monthly-meeting-template',
    recurrenceRule: {
      frequency: 'MONTHLY',
      interval: 1,
      byweekday: ['WE'],
      bysetpos: [2],
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

    service = await module.resolve<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    eventManagementService = module.get<EventManagementService>(
      EventManagementService,
    );
  });

  describe('UTC ISO string input (the actual bug case)', () => {
    it('should create event on Wednesday March 11, not Thursday March 12 (Issue #421)', async () => {
      // This is what getUpcomingOccurrences returns for "March 11, 7pm PST"
      // 7pm PST = 3am UTC next day, so March 11 7pm PST = March 12 3am UTC
      const occurrenceDateUtc = '2026-03-12T03:00:00.000Z';

      // Verify our test data is correct
      const localDate = formatInTimeZone(
        new Date(occurrenceDateUtc),
        timezone,
        'yyyy-MM-dd',
      );
      const localDayName = formatInTimeZone(
        new Date(occurrenceDateUtc),
        timezone,
        'EEEE',
      );
      expect(localDate).toBe('2026-03-11');
      expect(localDayName).toBe('Wednesday');

      let capturedDto: any = null;
      jest
        .spyOn(eventManagementService, 'create')
        .mockImplementation((dto: any) => {
          capturedDto = dto;
          return Promise.resolve({
            ...templateEvent,
            ...dto,
            id: 2,
            slug: 'crmc-monthly-meeting-march',
            seriesSlug: dto.seriesSlug,
          } as any);
        });

      await service.materializeOccurrence(
        'crmc-monthly-meeting-series',
        occurrenceDateUtc,
        mockUserId,
        mockTenantId,
      );

      expect(capturedDto).toBeDefined();

      const createdLocalDate = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'yyyy-MM-dd',
      );
      const createdDayName = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'EEEE',
      );
      const createdLocalTime = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'h:mm a',
      );

      console.log('\n=== Issue #421 Test: UTC ISO string input ===');
      console.log('Input:', occurrenceDateUtc);
      console.log('Expected local date: 2026-03-11 (Wednesday)');
      console.log(
        'Created:',
        createdLocalDate,
        `(${createdDayName})`,
        createdLocalTime,
      );

      // This is the bug - currently creates Thursday March 12
      expect(createdLocalDate).toBe('2026-03-11');
      expect(createdDayName).toBe('Wednesday');
      expect(createdLocalTime).toBe('7:00 PM');
    });
  });

  describe('Date-only string input (existing tests cover this)', () => {
    it('should work correctly with date-only input', async () => {
      // This is what existing tests use - and it works!
      const occurrenceDateOnly = '2026-03-11';

      let capturedDto: any = null;
      jest
        .spyOn(eventManagementService, 'create')
        .mockImplementation((dto: any) => {
          capturedDto = dto;
          return Promise.resolve({
            ...templateEvent,
            ...dto,
            id: 2,
            slug: 'crmc-monthly-meeting-march',
          } as any);
        });

      await service.materializeOccurrence(
        'crmc-monthly-meeting-series',
        occurrenceDateOnly,
        mockUserId,
        mockTenantId,
      );

      expect(capturedDto).toBeDefined();

      const createdLocalDate = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'yyyy-MM-dd',
      );
      const createdDayName = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'EEEE',
      );

      console.log('\n=== Date-only input (existing behavior) ===');
      console.log('Input:', occurrenceDateOnly);
      console.log('Created:', createdLocalDate, `(${createdDayName})`);

      expect(createdLocalDate).toBe('2026-03-11');
      expect(createdDayName).toBe('Wednesday');
    });
  });

  describe('Template time change should affect future materializations', () => {
    it('should use updated template time for new materializations', async () => {
      // Template was updated to 8pm instead of 7pm
      const updatedTemplateEvent = {
        ...templateEvent,
        startDate: new Date('2026-01-15T04:00:00.000Z'), // Jan 14, 8pm PST (was 7pm)
        endDate: new Date('2026-01-15T06:00:00.000Z'), // Jan 14, 10pm PST
      };

      // Re-mock with updated template
      const eventQueryService = {
        findEventBySlug: jest.fn().mockResolvedValue(updatedTemplateEvent),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EventSeriesOccurrenceService,
          {
            provide: EventSeriesService,
            useValue: { findBySlug: jest.fn().mockResolvedValue(mockSeries) },
          },
          {
            provide: EventManagementService,
            useValue: {
              findEventsBySeriesSlug: jest.fn().mockResolvedValue([[], 0]),
              create: jest.fn(),
            },
          },
          { provide: EventQueryService, useValue: eventQueryService },
          { provide: RecurrencePatternService, useValue: {} },
          { provide: UserService, useValue: { findById: jest.fn().mockResolvedValue(mockUser) } },
          { provide: TenantConnectionService, useValue: { getTenantConnection: jest.fn() } },
          { provide: REQUEST, useValue: { tenantId: mockTenantId } },
        ],
      }).compile();

      const svc = await module.resolve<EventSeriesOccurrenceService>(
        EventSeriesOccurrenceService,
      );
      const evtMgmt = module.get<EventManagementService>(EventManagementService);

      let capturedDto: any = null;
      jest.spyOn(evtMgmt, 'create').mockImplementation((dto: any) => {
        capturedDto = dto;
        return Promise.resolve({ ...updatedTemplateEvent, ...dto, id: 2 } as any);
      });

      // Use UTC ISO string for March occurrence
      const occurrenceDateUtc = '2026-03-12T04:00:00.000Z'; // March 11, 8pm PST

      await svc.materializeOccurrence(
        'crmc-monthly-meeting-series',
        occurrenceDateUtc,
        mockUserId,
        mockTenantId,
      );

      expect(capturedDto).toBeDefined();

      const createdLocalDate = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'yyyy-MM-dd',
      );
      const createdLocalTime = formatInTimeZone(
        capturedDto.startDate,
        timezone,
        'h:mm a',
      );

      console.log('\n=== Template time change test ===');
      console.log('Template time: 8:00 PM (updated from 7:00 PM)');
      console.log('Input:', occurrenceDateUtc);
      console.log('Created:', createdLocalDate, createdLocalTime);

      // Should use template's new 8pm time, on correct date (March 11)
      expect(createdLocalDate).toBe('2026-03-11');
      expect(createdLocalTime).toBe('8:00 PM');
    });
  });
});

/**
 * Verify what generateOccurrences actually returns
 */
describe('RecurrencePatternService output format', () => {
  let recurrenceService: RecurrencePatternService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrencePatternService],
    }).compile();
    recurrenceService = module.get<RecurrencePatternService>(
      RecurrencePatternService,
    );
  });

  it('returns UTC ISO strings where the UTC date may differ from local date', () => {
    // Template: Wednesday Jan 14, 2026 at 7pm PST = Jan 15, 3am UTC
    const templateStartUtc = new Date('2026-01-15T03:00:00.000Z');
    const timezone = 'America/Vancouver';

    const rule = {
      frequency: 'MONTHLY' as const,
      interval: 1,
      byweekday: ['WE'],
      bysetpos: [2],
    };

    const occurrences = recurrenceService.generateOccurrences(
      templateStartUtc,
      rule,
      { timeZone: timezone, count: 5 },
    );

    console.log('\n=== generateOccurrences output analysis ===');
    occurrences.forEach((iso, i) => {
      const utcDatePart = iso.split('T')[0];
      const localDatePart = formatInTimeZone(new Date(iso), timezone, 'yyyy-MM-dd');
      const localDay = formatInTimeZone(new Date(iso), timezone, 'EEEE');
      const mismatch = utcDatePart !== localDatePart ? ' ⚠️ DATE MISMATCH' : '';
      console.log(
        `  ${i + 1}. UTC: ${utcDatePart} | Local: ${localDatePart} (${localDay})${mismatch}`,
      );
    });

    // Find March occurrence and verify the mismatch
    const marchOcc = occurrences.find((iso) => iso.includes('2026-03'));
    expect(marchOcc).toBeDefined();

    const marchUtcDate = marchOcc!.split('T')[0];
    const marchLocalDate = formatInTimeZone(new Date(marchOcc!), timezone, 'yyyy-MM-dd');

    console.log(`\nMarch occurrence demonstrates the bug:`);
    console.log(`  UTC date (split): ${marchUtcDate}`);
    console.log(`  Local date: ${marchLocalDate}`);

    // These are different! That's the source of the bug
    expect(marchUtcDate).toBe('2026-03-12'); // What split('T')[0] gives
    expect(marchLocalDate).toBe('2026-03-11'); // What we actually want
  });
});
