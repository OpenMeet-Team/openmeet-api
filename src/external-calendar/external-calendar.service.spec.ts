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
});
