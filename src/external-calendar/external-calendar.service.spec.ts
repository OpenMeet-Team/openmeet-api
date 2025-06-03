import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import axios from 'axios';
import * as ical from 'node-ical';
import { ExternalCalendarService } from './external-calendar.service';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';

// Mock axios
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

// Mock node-ical
jest.mock('node-ical');
const mockedIcal = jest.mocked(ical as any);

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest
          .fn()
          .mockReturnValue('https://mock-google-auth-url.com'),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
            expiry_date: Date.now() + 3600000,
          },
        }),
        setCredentials: jest.fn(),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'new_mock_access_token',
            refresh_token: 'new_mock_refresh_token',
            expiry_date: Date.now() + 3600000,
          },
        }),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        list: jest.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'event1',
                summary: 'Test Event 1',
                start: { dateTime: '2024-02-01T10:00:00Z' },
                end: { dateTime: '2024-02-01T11:00:00Z' },
                status: 'confirmed',
                location: 'Test Location',
                description: 'Test Description',
              },
              {
                id: 'event2',
                summary: 'Test Event 2',
                start: { date: '2024-02-02' },
                end: { date: '2024-02-03' },
                status: 'tentative',
              },
            ],
          },
        }),
      },
    }),
  },
}));

describe('ExternalCalendarService', () => {
  let service: ExternalCalendarService;
  let mockExternalEventRepository: jest.Mocked<ExternalEventRepository>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;

  // Helper to create DateWithTimeZone object for node-ical
  const createDateWithTz = (date: Date | string): any => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return Object.assign(d, { tz: 'UTC' });
  };

  const createMockCalendarSource = (
    overrides: Partial<CalendarSourceEntity> = {},
  ): CalendarSourceEntity => {
    const calendarSource = new CalendarSourceEntity();
    calendarSource.id = 1;
    calendarSource.ulid = 'test_ulid';
    calendarSource.userId = 1;
    calendarSource.type = CalendarSourceType.GOOGLE;
    calendarSource.name = 'Test Calendar';
    calendarSource.isActive = true;
    calendarSource.isPrivate = false;
    calendarSource.syncFrequency = 60;
    calendarSource.accessToken = 'test_access_token';
    calendarSource.refreshToken = 'test_refresh_token';
    calendarSource.expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
    calendarSource.createdAt = new Date();
    calendarSource.updatedAt = new Date();
    return Object.assign(calendarSource, overrides);
  };

  beforeEach(async () => {
    mockExternalEventRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findManyByCalendarSource: jest.fn(),
      deleteByCalendarSource: jest.fn(),
      deleteByCalendarSourceAndExternalIds: jest.fn(),
      upsertMany: jest.fn(),
      findByExternalId: jest.fn(),
    } as any;

    mockTenantConnectionService = {
      getTenantConfig: jest.fn().mockReturnValue({
        id: 'test-tenant',
        name: 'Test Tenant',
        frontendDomain: 'https://test.example.com',
        googleClientId: 'mock_google_client_id',
        googleClientSecret: 'mock_google_client_secret',
      }),
    } as any;

    const mockRequest = {
      headers: {
        'x-tenant-id': 'test-tenant',
      },
    };

    const mockCalendarSourceService = {
      findByUlid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalCalendarService,
        {
          provide: ExternalEventRepository,
          useValue: mockExternalEventRepository,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CalendarSourceService,
          useValue: mockCalendarSourceService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = await module.resolve<ExternalCalendarService>(
      ExternalCalendarService,
    );
  });

  describe('syncCalendarSource', () => {
    it('should successfully sync Google Calendar events', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.GOOGLE,
        accessToken: 'valid_access_token',
        refreshToken: 'valid_refresh_token',
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(2); // Mock returns 2 events
      expect(result.error).toBeUndefined();
      expect(result.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('should throw error for Outlook Calendar sync (not yet implemented)', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.OUTLOOK,
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.eventsCount).toBe(0);
      expect(result.error).toContain(
        'Outlook Calendar sync not yet implemented',
      );
      expect(result.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('should delegate Apple Calendar to iCal URL sync', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.APPLE,
        url: 'https://example.com/calendar.ics',
      });

      // Mock successful iCal fetch and parse
      mockedAxios.get.mockResolvedValue({
        data: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
      });
      mockedIcal.parseICS.mockReturnValue({});

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(0); // Empty calendar
    });

    it('should successfully sync iCal URL with events', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      // Mock successful iCal fetch
      mockedAxios.get.mockResolvedValue({
        data: 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:test-event\nSUMMARY:Test Event\nDTSTART:20240201T100000Z\nDTEND:20240201T110000Z\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR',
      });

      // Mock parsed iCal events
      const tomorrow = new Date(Date.now() + 86400000); // Tomorrow
      mockedIcal.parseICS.mockReturnValue({
        'test-event': {
          type: 'VEVENT',
          uid: 'test-event',
          summary: 'Test Event',
          start: createDateWithTz(tomorrow),
          end: createDateWithTz(new Date(tomorrow.getTime() + 3600000)), // +1 hour
          status: 'CONFIRMED',
          location: 'Test Location',
          description: 'Test Description',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1);
      expect(result.error).toBeUndefined();
      expect(result.lastSyncedAt).toBeInstanceOf(Date);
    });

    it('should throw error for unsupported calendar type', async () => {
      const calendarSource = createMockCalendarSource({
        type: 'unsupported' as CalendarSourceType,
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported calendar source type');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate Google OAuth URL', () => {
      const userId = 1;
      const url = service.getAuthorizationUrl(
        CalendarSourceType.GOOGLE,
        userId,
      );

      expect(url).toBe('https://mock-google-auth-url.com');
    });

    it('should throw error for Outlook OAuth URL (not yet implemented)', () => {
      expect(() =>
        service.getAuthorizationUrl(CalendarSourceType.OUTLOOK, 1),
      ).toThrow('Outlook OAuth URL generation not yet implemented');
    });

    it('should throw BadRequestException for Apple Calendar', () => {
      expect(() =>
        service.getAuthorizationUrl(CalendarSourceType.APPLE, 1),
      ).toThrow(BadRequestException);
      expect(() =>
        service.getAuthorizationUrl(CalendarSourceType.APPLE, 1),
      ).toThrow('Apple Calendar uses iCal URL subscription, not OAuth');
    });

    it('should throw BadRequestException for iCal URL', () => {
      expect(() =>
        service.getAuthorizationUrl(CalendarSourceType.ICAL, 1),
      ).toThrow(BadRequestException);
      expect(() =>
        service.getAuthorizationUrl(CalendarSourceType.ICAL, 1),
      ).toThrow('iCal URL sources do not require authorization');
    });

    it('should throw BadRequestException for unsupported type', () => {
      expect(() =>
        service.getAuthorizationUrl('unsupported' as CalendarSourceType, 1),
      ).toThrow(BadRequestException);
    });
  });

  describe('exchangeAuthorizationCode', () => {
    it('should exchange Google OAuth code for tokens', async () => {
      const result = await service.exchangeAuthorizationCode(
        CalendarSourceType.GOOGLE,
        'mock_auth_code',
        1,
      );

      expect(result.accessToken).toBe('mock_access_token');
      expect(result.refreshToken).toBe('mock_refresh_token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw error for Outlook OAuth exchange (not yet implemented)', async () => {
      await expect(
        service.exchangeAuthorizationCode(
          CalendarSourceType.OUTLOOK,
          'code',
          1,
        ),
      ).rejects.toThrow('Outlook OAuth code exchange not yet implemented');
    });

    it('should throw BadRequestException for non-OAuth types', async () => {
      await expect(
        service.exchangeAuthorizationCode(CalendarSourceType.APPLE, 'code', 1),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.exchangeAuthorizationCode(CalendarSourceType.ICAL, 'code', 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException when no refresh token', async () => {
      const calendarSource = createMockCalendarSource({
        refreshToken: undefined,
      });

      await expect(service.refreshAccessToken(calendarSource)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshAccessToken(calendarSource)).rejects.toThrow(
        'No refresh token available for calendar source',
      );
    });

    it('should refresh Google access token', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.GOOGLE,
        refreshToken: 'valid_refresh_token',
      });

      const result = await service.refreshAccessToken(calendarSource);

      expect(result.accessToken).toBe('new_mock_access_token');
      expect(result.refreshToken).toBe('new_mock_refresh_token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw error for Outlook token refresh (not yet implemented)', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.OUTLOOK,
      });

      await expect(service.refreshAccessToken(calendarSource)).rejects.toThrow(
        'Outlook token refresh not yet implemented',
      );
    });

    it('should throw BadRequestException for non-OAuth types', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.APPLE,
      });

      await expect(service.refreshAccessToken(calendarSource)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('testConnection', () => {
    it('should return true when sync succeeds', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.GOOGLE,
        accessToken: 'valid_access_token',
      });

      const result = await service.testConnection(
        calendarSource,
        'test-tenant-1',
      );

      expect(result).toBe(true);
    });

    it('should handle connection test gracefully', async () => {
      const calendarSource = createMockCalendarSource({
        type: 'invalid' as CalendarSourceType,
      });

      const result = await service.testConnection(
        calendarSource,
        'test-tenant-1',
      );

      expect(result).toBe(false);
    });

    it('should throw error when Google OAuth credentials not configured for tenant', async () => {
      // Create a mock tenant service without Google credentials
      const mockTenantServiceWithoutConfig = {
        getTenantConfig: jest.fn().mockReturnValue({
          id: 'test-tenant',
          name: 'Test Tenant',
          frontendDomain: 'https://test.example.com',
          googleClientId: undefined,
          googleClientSecret: undefined,
        }),
      };

      const mockRequest = {
        headers: {
          'x-tenant-id': 'test-tenant',
        },
      };

      const mockCalendarSourceServiceLocal = {
        findByUlid: jest.fn(),
      };

      const moduleWithoutConfig: TestingModule = await Test.createTestingModule(
        {
          providers: [
            ExternalCalendarService,
            {
              provide: ExternalEventRepository,
              useValue: mockExternalEventRepository,
            },
            {
              provide: TenantConnectionService,
              useValue: mockTenantServiceWithoutConfig,
            },
            {
              provide: CalendarSourceService,
              useValue: mockCalendarSourceServiceLocal,
            },
            {
              provide: REQUEST,
              useValue: mockRequest,
            },
          ],
        },
      ).compile();

      const serviceWithoutConfig =
        await moduleWithoutConfig.resolve<ExternalCalendarService>(
          ExternalCalendarService,
        );

      expect(() =>
        serviceWithoutConfig.getAuthorizationUrl(CalendarSourceType.GOOGLE, 1),
      ).toThrow(BadRequestException);

      expect(() =>
        serviceWithoutConfig.getAuthorizationUrl(CalendarSourceType.GOOGLE, 1),
      ).toThrow('Google OAuth credentials not configured for tenant');
    });

    it('should handle Google Calendar sync with missing tokens', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.GOOGLE,
        accessToken: undefined,
        refreshToken: undefined,
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(2);
    });
  });

  describe('iCal URL Sync', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should require URL for iCal calendar sources', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: undefined,
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'iCal URL is required for iCal calendar sources',
      );
    });

    it('should handle empty response from iCal URL', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/empty.ics',
      });

      mockedAxios.get.mockResolvedValue({ data: '' });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response from iCal URL');
    });

    it('should filter old events (older than 1 month)', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with old events',
      });

      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 2); // 2 months ago

      mockedIcal.parseICS.mockReturnValue({
        'old-event': {
          type: 'VEVENT',
          uid: 'old-event',
          summary: 'Old Event',
          start: createDateWithTz(oldDate),
          end: createDateWithTz(new Date(oldDate.getTime() + 3600000)), // +1 hour
          status: 'CONFIRMED',
        },
        'recent-event': {
          type: 'VEVENT',
          uid: 'recent-event',
          summary: 'Recent Event',
          start: createDateWithTz(new Date()), // Now
          end: createDateWithTz(new Date(Date.now() + 3600000)), // +1 hour
          status: 'CONFIRMED',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1); // Only recent event
    });

    it('should filter events far in future (more than 1 year)', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with future events',
      });

      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 2); // 2 years from now

      mockedIcal.parseICS.mockReturnValue({
        'far-future-event': {
          type: 'VEVENT',
          uid: 'far-future-event',
          summary: 'Far Future Event',
          start: createDateWithTz(farFuture),
          end: createDateWithTz(new Date(farFuture.getTime() + 3600000)),
          status: 'CONFIRMED',
        },
        'near-future-event': {
          type: 'VEVENT',
          uid: 'near-future-event',
          summary: 'Near Future Event',
          start: createDateWithTz(new Date(Date.now() + 86400000)), // Tomorrow
          end: createDateWithTz(new Date(Date.now() + 86400000 + 3600000)), // Tomorrow +1 hour
          status: 'CONFIRMED',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1); // Only near future event
    });

    it('should handle network connection errors', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://unreachable.example.com/calendar.ics',
      });

      mockedAxios.get.mockRejectedValue({
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND unreachable.example.com',
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Unable to connect to iCal URL - please check the URL is correct and accessible',
      );
    });

    it('should handle timeout errors', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://slow.example.com/calendar.ics',
      });

      mockedAxios.get.mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'timeout of 30000ms exceeded',
      });

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'iCal URL request timed out - please try again later',
      );
    });

    it('should handle various event statuses', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with various statuses',
      });

      const now = new Date();

      mockedIcal.parseICS.mockReturnValue({
        'confirmed-event': {
          type: 'VEVENT',
          uid: 'confirmed-event',
          summary: 'Confirmed Event',
          start: createDateWithTz(now),
          end: createDateWithTz(new Date(now.getTime() + 3600000)),
          status: 'CONFIRMED',
        },
        'tentative-event': {
          type: 'VEVENT',
          uid: 'tentative-event',
          summary: 'Tentative Event',
          start: createDateWithTz(new Date(now.getTime() + 86400000)),
          end: createDateWithTz(new Date(now.getTime() + 86400000 + 3600000)),
          status: 'TENTATIVE',
        },
        'cancelled-event': {
          type: 'VEVENT',
          uid: 'cancelled-event',
          summary: 'Cancelled Event',
          start: createDateWithTz(new Date(now.getTime() + 172800000)),
          end: createDateWithTz(new Date(now.getTime() + 172800000 + 3600000)),
          status: 'CANCELLED',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(3);
    });

    it('should handle all-day events', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with all-day event',
      });

      // Use tomorrow's date for all-day event
      const tomorrow = new Date(Date.now() + 86400000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format
      const dayAfterStr = new Date(tomorrow.getTime() + 86400000)
        .toISOString()
        .split('T')[0];

      mockedIcal.parseICS.mockReturnValue({
        'all-day-event': {
          type: 'VEVENT',
          uid: 'all-day-event',
          summary: 'All Day Event',
          start: tomorrowStr, // Date string without time
          end: dayAfterStr,
          datetype: 'date',
          status: 'CONFIRMED',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1);
    });

    it('should sanitize event summaries', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with malicious content',
      });

      const longSummary = 'A'.repeat(300); // 300 characters
      const maliciousSummary = 'Event <script>alert("xss")</script> Title';

      mockedIcal.parseICS.mockReturnValue({
        'long-summary-event': {
          type: 'VEVENT',
          uid: 'long-summary-event',
          summary: longSummary,
          start: createDateWithTz(new Date()),
          end: createDateWithTz(new Date(Date.now() + 3600000)),
          status: 'CONFIRMED',
        },
        'malicious-event': {
          type: 'VEVENT',
          uid: 'malicious-event',
          summary: maliciousSummary,
          start: createDateWithTz(new Date(Date.now() + 86400000)),
          end: createDateWithTz(new Date(Date.now() + 86400000 + 3600000)),
          status: 'CONFIRMED',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(2);
    });

    it('should skip non-VEVENT items', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with mixed items',
      });

      mockedIcal.parseICS.mockReturnValue({
        vcalendar: {
          type: 'VCALENDAR',
          version: '2.0',
        },
        'valid-event': {
          type: 'VEVENT',
          uid: 'valid-event',
          summary: 'Valid Event',
          start: createDateWithTz(new Date()),
          end: createDateWithTz(new Date(Date.now() + 3600000)),
          status: 'CONFIRMED',
        },
        vtimezone: {
          type: 'VTIMEZONE',
          tzid: 'America/New_York',
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1); // Only VEVENT counted
    });

    it('should handle events without optional fields', async () => {
      const calendarSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: 'https://example.com/calendar.ics',
      });

      mockedAxios.get.mockResolvedValue({
        data: 'iCal data with minimal event',
      });

      mockedIcal.parseICS.mockReturnValue({
        'minimal-event': {
          type: 'VEVENT',
          start: createDateWithTz(new Date()),
          end: createDateWithTz(new Date(Date.now() + 3600000)),
          // No UID, summary, status, location, description
        },
      } as any);

      const result = await service.syncCalendarSource(
        calendarSource,
        'test-tenant-1',
      );

      expect(result.success).toBe(true);
      expect(result.eventsCount).toBe(1);
    });
  });

  describe('Integration Tests - Apple Calendar and iCal URL with Real Data', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('Apple Calendar Integration', () => {
      it('should successfully sync Apple Calendar by delegating to iCal URL with realistic calendar data', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.APPLE,
          url: 'webcal://example.apple.com/published/calendar.ics',
        });

        // Mock realistic Apple Calendar iCal response
        const appleICalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN
CALSCALE:GREGORIAN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:20240310T070000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:20241103T060000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20240215T100000
DTEND;TZID=America/New_York:20240215T110000
DTSTAMP:20240201T120000Z
UID:meeting-1@apple.com
CREATED:20240201T100000Z
DESCRIPTION:Important team meeting to discuss Q1 goals
LAST-MODIFIED:20240201T110000Z
LOCATION:Conference Room A
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Team Meeting
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20240216
DTEND:20240217
DTSTAMP:20240201T120000Z
UID:vacation-day@apple.com
CREATED:20240201T100000Z
DESCRIPTION:Annual company retreat
LAST-MODIFIED:20240201T110000Z
LOCATION:Mountain Resort
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Company Retreat
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20240218T140000
DTEND;TZID=America/New_York:20240218T150000
DTSTAMP:20240201T120000Z
UID:tentative-meeting@apple.com
CREATED:20240201T100000Z
DESCRIPTION:Quarterly review - pending confirmation
LAST-MODIFIED:20240201T110000Z
LOCATION:TBD
SEQUENCE:0
STATUS:TENTATIVE
SUMMARY:Quarterly Review (Tentative)
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

        mockedAxios.get.mockResolvedValue({ data: appleICalData });

        // Mock parsed events with realistic Apple Calendar structure
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        mockedIcal.parseICS.mockReturnValue({
          'meeting-1@apple.com': {
            type: 'VEVENT',
            uid: 'meeting-1@apple.com',
            summary: 'Team Meeting',
            start: createDateWithTz(tomorrow),
            end: createDateWithTz(new Date(tomorrow.getTime() + 3600000)),
            status: 'CONFIRMED',
            location: 'Conference Room A',
            description: 'Important team meeting to discuss Q1 goals',
          },
          'vacation-day@apple.com': {
            type: 'VEVENT',
            uid: 'vacation-day@apple.com',
            summary: 'Company Retreat',
            start: nextWeek.toISOString().split('T')[0], // All-day event format
            end: new Date(nextWeek.getTime() + 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            status: 'CONFIRMED',
            location: 'Mountain Resort',
            description: 'Annual company retreat',
            datetype: 'date',
          },
          'tentative-meeting@apple.com': {
            type: 'VEVENT',
            uid: 'tentative-meeting@apple.com',
            summary: 'Quarterly Review (Tentative)',
            start: createDateWithTz(nextMonth),
            end: createDateWithTz(new Date(nextMonth.getTime() + 3600000)),
            status: 'TENTATIVE',
            location: 'TBD',
            description: 'Quarterly review - pending confirmation',
          },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(3);
        expect(result.error).toBeUndefined();
        expect(result.lastSyncedAt).toBeInstanceOf(Date);

        // Verify axios was called with correct parameters
        expect(mockedAxios.get).toHaveBeenCalledWith(
          'webcal://example.apple.com/published/calendar.ics',
          {
            timeout: 30000,
            headers: {
              'User-Agent': 'OpenMeet Calendar Sync/1.0',
              Accept: 'text/calendar,text/plain',
            },
          },
        );

        // Verify events were stored in database
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledWith(
          'test-tenant-1',
          1,
          expect.arrayContaining([
            expect.objectContaining({
              externalId: 'meeting-1@apple.com',
              summary: 'Team Meeting',
              status: 'busy',
              location: 'Conference Room A',
              description: 'Important team meeting to discuss Q1 goals',
              isAllDay: false,
            }),
            expect.objectContaining({
              externalId: 'vacation-day@apple.com',
              summary: 'Company Retreat',
              status: 'busy',
              location: 'Mountain Resort',
              description: 'Annual company retreat',
              isAllDay: true,
            }),
            expect.objectContaining({
              externalId: 'tentative-meeting@apple.com',
              summary: 'Quarterly Review (Tentative)',
              status: 'tentative',
              location: 'TBD',
              description: 'Quarterly review - pending confirmation',
              isAllDay: false,
            }),
          ]),
        );
      });

      it('should handle Apple Calendar with recurring events', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.APPLE,
          url: 'webcal://example.apple.com/recurring.ics',
        });

        const recurringICalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20240220T090000
DTEND;TZID=America/New_York:20240220T100000
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8
DTSTAMP:20240201T120000Z
UID:weekly-standup@apple.com
SUMMARY:Weekly Team Standup
DESCRIPTION:Regular team sync meeting
LOCATION:Room 101
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

        mockedAxios.get.mockResolvedValue({ data: recurringICalData });

        // Simulate node-ical expanding recurring events into individual instances
        const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Start tomorrow
        const recurringEvents: any = {};
        for (let i = 0; i < 4; i++) {
          const eventDate = new Date(
            startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000,
          );
          const eventId = `weekly-standup@apple.com-${i}`;
          recurringEvents[eventId] = {
            type: 'VEVENT',
            uid: eventId,
            summary: 'Weekly Team Standup',
            start: createDateWithTz(eventDate),
            end: createDateWithTz(new Date(eventDate.getTime() + 3600000)),
            status: 'CONFIRMED',
            location: 'Room 101',
            description: 'Regular team sync meeting',
          };
        }

        mockedIcal.parseICS.mockReturnValue(recurringEvents);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(4);
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledWith(
          'test-tenant-1',
          1,
          expect.arrayContaining([
            expect.objectContaining({
              summary: 'Weekly Team Standup',
              status: 'busy',
              location: 'Room 101',
              description: 'Regular team sync meeting',
            }),
          ]),
        );
      });
    });

    describe('iCal URL Integration with Real Calendar Data', () => {
      it('should successfully sync Google Calendar exported iCal data', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.ICAL,
          url: 'https://calendar.google.com/calendar/ical/user%40example.com/private.ics',
        });

        const googleICalData = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:My Google Calendar
X-WR-TIMEZONE:America/New_York
BEGIN:VEVENT
DTSTART:20240301T140000Z
DTEND:20240301T150000Z
DTSTAMP:20240225T100000Z
UID:abc123def456@google.com
CREATED:20240225T090000Z
DESCRIPTION:Client presentation for the new product launch
LAST-MODIFIED:20240225T095000Z
LOCATION:Client Office\\, 123 Business St\\, City\\, State
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Client Presentation
TRANSP:OPAQUE
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:This is an event reminder
TRIGGER:-P0DT0H15M0S
END:VALARM
END:VEVENT
BEGIN:VEVENT
DTSTART:20240302T000000Z
DTEND:20240303T000000Z
DTSTAMP:20240225T100000Z
UID:xyz789uvw012@google.com
CREATED:20240225T090000Z
DESCRIPTION:Team building activities and workshops
LAST-MODIFIED:20240225T095000Z
LOCATION:Offsite Location
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Team Building Day
TRANSP:TRANSPARENT
X-GOOGLE-CALENDAR-CONTENT-DISPLAY:chip
X-GOOGLE-CALENDAR-CONTENT-ICON:🎯
END:VEVENT
END:VCALENDAR`;

        mockedAxios.get.mockResolvedValue({ data: googleICalData });

        const eventDate1 = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const eventDate2 = new Date(Date.now() + 48 * 60 * 60 * 1000); // Day after tomorrow

        mockedIcal.parseICS.mockReturnValue({
          'abc123def456@google.com': {
            type: 'VEVENT',
            uid: 'abc123def456@google.com',
            summary: 'Client Presentation',
            start: createDateWithTz(eventDate1),
            end: createDateWithTz(new Date(eventDate1.getTime() + 3600000)),
            status: 'CONFIRMED',
            location: 'Client Office, 123 Business St, City, State',
            description: 'Client presentation for the new product launch',
          },
          'xyz789uvw012@google.com': {
            type: 'VEVENT',
            uid: 'xyz789uvw012@google.com',
            summary: 'Team Building Day',
            start: createDateWithTz(eventDate2),
            end: createDateWithTz(
              new Date(eventDate2.getTime() + 24 * 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
            location: 'Offsite Location',
            description: 'Team building activities and workshops',
          },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(2);
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledWith(
          'test-tenant-1',
          1,
          expect.arrayContaining([
            expect.objectContaining({
              externalId: 'abc123def456@google.com',
              summary: 'Client Presentation',
              status: 'busy',
              location: 'Client Office, 123 Business St, City, State',
              description: 'Client presentation for the new product launch',
              isAllDay: false,
            }),
            expect.objectContaining({
              externalId: 'xyz789uvw012@google.com',
              summary: 'Team Building Day',
              status: 'busy',
              location: 'Offsite Location',
              description: 'Team building activities and workshops',
              isAllDay: false,
            }),
          ]),
        );
      });

      it('should sync Outlook Calendar exported iCal data with timezone handling', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.ICAL,
          url: 'https://outlook.live.com/owa/calendar/abc123/calendar.ics',
        });

        const outlookICalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:Microsoft Exchange Server 2010
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Outlook Calendar
BEGIN:VTIMEZONE
TZID:Pacific Standard Time
BEGIN:STANDARD
DTSTART:16011104T020000
RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11
TZNAME:Pacific Standard Time
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010311T020000
RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3
TZNAME:Pacific Daylight Time
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Pacific Standard Time:20240305T100000
DTEND;TZID=Pacific Standard Time:20240305T113000
DTSTAMP:20240301T120000Z
UID:040000008200E00074C5B7101A82E0080000000020240305T100000@outlook.com
CREATED:20240301T100000Z
DESCRIPTION:Weekly project status meeting with stakeholders
LAST-MODIFIED:20240301T110000Z
LOCATION:Microsoft Teams Meeting
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Project Status Meeting
TRANSP:OPAQUE
X-MICROSOFT-CDO-BUSYSTATUS:BUSY
X-MICROSOFT-CDO-IMPORTANCE:1
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:REMINDER
TRIGGER:-PT15M
END:VALARM
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Pacific Standard Time:20240306T153000
DTEND;TZID=Pacific Standard Time:20240306T163000
DTSTAMP:20240301T120000Z
UID:040000008200E00074C5B7101A82E0080000000020240306T153000@outlook.com
CREATED:20240301T100000Z
DESCRIPTION:Optional training session on new tools
LAST-MODIFIED:20240301T110000Z
LOCATION:Training Room B
SEQUENCE:0
STATUS:TENTATIVE
SUMMARY:Optional Training Session
TRANSP:OPAQUE
X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE
END:VEVENT
END:VCALENDAR`;

        mockedAxios.get.mockResolvedValue({ data: outlookICalData });

        const outlookEvent1 = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const outlookEvent2 = new Date(Date.now() + 48 * 60 * 60 * 1000); // Day after tomorrow

        mockedIcal.parseICS.mockReturnValue({
          '040000008200E00074C5B7101A82E0080000000020240305T100000@outlook.com':
            {
              type: 'VEVENT',
              uid: '040000008200E00074C5B7101A82E0080000000020240305T100000@outlook.com',
              summary: 'Project Status Meeting',
              start: createDateWithTz(outlookEvent1),
              end: createDateWithTz(
                new Date(outlookEvent1.getTime() + 90 * 60 * 1000),
              ), // 1.5 hours
              status: 'CONFIRMED',
              location: 'Microsoft Teams Meeting',
              description: 'Weekly project status meeting with stakeholders',
            },
          '040000008200E00074C5B7101A82E0080000000020240306T153000@outlook.com':
            {
              type: 'VEVENT',
              uid: '040000008200E00074C5B7101A82E0080000000020240306T153000@outlook.com',
              summary: 'Optional Training Session',
              start: createDateWithTz(outlookEvent2),
              end: createDateWithTz(
                new Date(outlookEvent2.getTime() + 60 * 60 * 1000),
              ),
              status: 'TENTATIVE',
              location: 'Training Room B',
              description: 'Optional training session on new tools',
            },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(2);
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledWith(
          'test-tenant-1',
          1,
          expect.arrayContaining([
            expect.objectContaining({
              externalId:
                '040000008200E00074C5B7101A82E0080000000020240305T100000@outlook.com',
              summary: 'Project Status Meeting',
              status: 'busy',
              location: 'Microsoft Teams Meeting',
              description: 'Weekly project status meeting with stakeholders',
            }),
            expect.objectContaining({
              externalId:
                '040000008200E00074C5B7101A82E0080000000020240306T153000@outlook.com',
              summary: 'Optional Training Session',
              status: 'tentative',
              location: 'Training Room B',
              description: 'Optional training session on new tools',
            }),
          ]),
        );
      });

      it('should handle complex iCal with mixed event types and statuses', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.ICAL,
          url: 'https://example.com/complex-calendar.ics',
        });

        mockedAxios.get.mockResolvedValue({
          data: 'Complex calendar with various event types',
        });

        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        mockedIcal.parseICS.mockReturnValue({
          'business-meeting': {
            type: 'VEVENT',
            uid: 'business-meeting',
            summary: 'Important <script>alert("xss")</script> Business Meeting',
            start: createDateWithTz(tomorrow),
            end: createDateWithTz(
              new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
            location: 'Conference Room A',
            description: 'Quarterly business review with executives',
          },
          'cancelled-appointment': {
            type: 'VEVENT',
            uid: 'cancelled-appointment',
            summary: 'Doctor Appointment',
            start: createDateWithTz(
              new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000),
            ),
            end: createDateWithTz(
              new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
            ),
            status: 'CANCELLED',
            location: 'Medical Center',
            description:
              'Annual checkup - cancelled due to scheduling conflict',
          },
          'tentative-lunch': {
            type: 'VEVENT',
            uid: 'tentative-lunch',
            summary: 'Lunch with Client',
            start: createDateWithTz(
              new Date(nextWeek.getTime() + 12 * 60 * 60 * 1000),
            ),
            end: createDateWithTz(
              new Date(nextWeek.getTime() + 13 * 60 * 60 * 1000),
            ),
            status: 'TENTATIVE',
            location: 'Downtown Restaurant',
            description: 'Potential lunch meeting - awaiting confirmation',
          },
          'all-day-conference': {
            type: 'VEVENT',
            uid: 'all-day-conference',
            summary: 'Tech Conference 2024',
            start: nextWeek.toISOString().split('T')[0],
            end: new Date(nextWeek.getTime() + 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            status: 'CONFIRMED',
            location: 'Convention Center',
            description: 'Annual technology conference with industry leaders',
            datetype: 'date',
          },
          'no-status-event': {
            type: 'VEVENT',
            uid: 'no-status-event',
            summary: 'Event Without Status',
            start: createDateWithTz(
              new Date(nextWeek.getTime() + 15 * 60 * 60 * 1000),
            ),
            end: createDateWithTz(
              new Date(nextWeek.getTime() + 16 * 60 * 60 * 1000),
            ),
            // No status field
            location: 'Unknown',
            description: 'Event with missing status information',
          },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(5);

        // Verify event status mapping
        const storedEvents =
          mockExternalEventRepository.upsertMany.mock.calls[0][2];
        const businessMeeting = storedEvents.find(
          (e) => e.externalId === 'business-meeting',
        );
        const cancelledEvent = storedEvents.find(
          (e) => e.externalId === 'cancelled-appointment',
        );
        const tentativeEvent = storedEvents.find(
          (e) => e.externalId === 'tentative-lunch',
        );
        const allDayEvent = storedEvents.find(
          (e) => e.externalId === 'all-day-conference',
        );
        const noStatusEvent = storedEvents.find(
          (e) => e.externalId === 'no-status-event',
        );

        expect(businessMeeting).toBeDefined();
        expect(businessMeeting!.status).toBe('busy');
        expect(businessMeeting!.summary).toBe(
          'Important scriptalert("xss")/script Business Meeting',
        ); // XSS cleaned
        expect(cancelledEvent).toBeDefined();
        expect(cancelledEvent!.status).toBe('free');
        expect(tentativeEvent).toBeDefined();
        expect(tentativeEvent!.status).toBe('tentative');
        expect(allDayEvent).toBeDefined();
        expect(allDayEvent!.status).toBe('busy');
        expect(allDayEvent!.isAllDay).toBe(true);
        expect(noStatusEvent).toBeDefined();
        expect(noStatusEvent!.status).toBe('busy'); // Default status
      });

      it('should handle calendar with events at the edge of time filtering', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.ICAL,
          url: 'https://example.com/edge-case-calendar.ics',
        });

        mockedAxios.get.mockResolvedValue({
          data: 'Calendar with edge case events',
        });

        const now = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const justOverOneMonthAgo = new Date(
          oneMonthAgo.getTime() - 24 * 60 * 60 * 1000,
        );
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        const justOverOneYearFromNow = new Date(
          oneYearFromNow.getTime() + 24 * 60 * 60 * 1000,
        );

        // Adjust oneMonthAgo to be exactly at the boundary (should be included)
        const exactlyOneMonthAgo = new Date();
        exactlyOneMonthAgo.setMonth(exactlyOneMonthAgo.getMonth() - 1);

        mockedIcal.parseICS.mockReturnValue({
          'too-old-event': {
            type: 'VEVENT',
            uid: 'too-old-event',
            summary: 'Too Old Event',
            start: createDateWithTz(justOverOneMonthAgo),
            end: createDateWithTz(
              new Date(justOverOneMonthAgo.getTime() + 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
          },
          'just-old-enough': {
            type: 'VEVENT',
            uid: 'just-old-enough',
            summary: 'Just Old Enough',
            start: createDateWithTz(exactlyOneMonthAgo),
            end: createDateWithTz(
              new Date(exactlyOneMonthAgo.getTime() + 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
          },
          'current-event': {
            type: 'VEVENT',
            uid: 'current-event',
            summary: 'Current Event',
            start: createDateWithTz(now),
            end: createDateWithTz(new Date(now.getTime() + 60 * 60 * 1000)),
            status: 'CONFIRMED',
          },
          'just-far-enough': {
            type: 'VEVENT',
            uid: 'just-far-enough',
            summary: 'Just Far Enough',
            start: createDateWithTz(oneYearFromNow),
            end: createDateWithTz(
              new Date(oneYearFromNow.getTime() + 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
          },
          'too-far-future': {
            type: 'VEVENT',
            uid: 'too-far-future',
            summary: 'Too Far Future',
            start: createDateWithTz(justOverOneYearFromNow),
            end: createDateWithTz(
              new Date(justOverOneYearFromNow.getTime() + 60 * 60 * 1000),
            ),
            status: 'CONFIRMED',
          },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        expect(result.success).toBe(true);
        expect(result.eventsCount).toBeGreaterThanOrEqual(2); // At least current and future events within range

        const storedEvents =
          mockExternalEventRepository.upsertMany.mock.calls[0][2];
        const eventIds = storedEvents.map((e) => e.externalId);
        expect(eventIds).toContain('current-event');
        expect(eventIds).toContain('just-far-enough');
        expect(eventIds).not.toContain('too-old-event');
        expect(eventIds).not.toContain('too-far-future');
        // The 'just-old-enough' event may or may not be included depending on exact timing
      });

      it('should successfully sync and verify complete data transformation pipeline', async () => {
        const calendarSource = createMockCalendarSource({
          type: CalendarSourceType.ICAL,
          url: 'https://example.com/complete-test.ics',
        });

        mockedAxios.get.mockResolvedValue({
          data: 'Complete integration test data',
        });

        const eventDate = new Date();
        eventDate.setDate(eventDate.getDate() + 1); // Tomorrow

        mockedIcal.parseICS.mockReturnValue({
          'integration-test-event': {
            type: 'VEVENT',
            uid: 'integration-test-event',
            summary: 'Integration Test Event',
            start: createDateWithTz(eventDate),
            end: createDateWithTz(
              new Date(eventDate.getTime() + 90 * 60 * 1000),
            ), // 1.5 hours
            status: 'CONFIRMED',
            location: 'Test Location with Special Chars: <>&"\'',
            description:
              'Detailed event description for integration testing\nWith multiple lines\nAnd special characters: <script>test</script>',
          },
        } as any);

        const result = await service.syncCalendarSource(
          calendarSource,
          'test-tenant-1',
        );

        // Verify high-level result
        expect(result.success).toBe(true);
        expect(result.eventsCount).toBe(1);
        expect(result.error).toBeUndefined();
        expect(result.lastSyncedAt).toBeInstanceOf(Date);

        // Verify HTTP call was made correctly
        expect(mockedAxios.get).toHaveBeenCalledWith(
          'https://example.com/complete-test.ics',
          {
            timeout: 30000,
            headers: {
              'User-Agent': 'OpenMeet Calendar Sync/1.0',
              Accept: 'text/calendar,text/plain',
            },
          },
        );

        // Verify parsing was called
        expect(mockedIcal.parseICS).toHaveBeenCalledWith(
          'Complete integration test data',
        );

        // Verify database storage with complete event data
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledTimes(1);
        expect(mockExternalEventRepository.upsertMany).toHaveBeenCalledWith(
          'test-tenant-1',
          1, // calendarSourceId
          expect.arrayContaining([
            expect.objectContaining({
              externalId: 'integration-test-event',
              summary: 'Integration Test Event',
              startTime: expect.any(Date),
              endTime: expect.any(Date),
              isAllDay: false,
              status: 'busy',
              location: 'Test Location with Special Chars: <>&"\'',
              description:
                'Detailed event description for integration testing\nWith multiple lines\nAnd special characters: <script>test</script>',
              calendarSourceId: 1,
            }),
          ]),
        );

        // Verify the exact dates were preserved
        const storedEvent =
          mockExternalEventRepository.upsertMany.mock.calls[0][2][0];
        expect(storedEvent.startTime).toEqual(eventDate);
        expect(storedEvent.endTime).toEqual(
          new Date(eventDate.getTime() + 90 * 60 * 1000),
        );
      });
    });
  });
});
