import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ExternalCalendarController } from './external-calendar.controller';
import { ExternalCalendarService } from './external-calendar.service';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import googleConfig from '../auth-google/config/google.config';

describe('ExternalCalendarController', () => {
  let controller: ExternalCalendarController;
  let externalCalendarService: jest.Mocked<ExternalCalendarService>;
  let calendarSourceService: jest.Mocked<CalendarSourceService>;

  const mockUser = new UserEntity();
  mockUser.id = 1;
  mockUser.ulid = 'user_test_ulid';
  mockUser.slug = 'testuser';
  mockUser.email = 'test@example.com';

  const mockCalendarSource = new CalendarSourceEntity();
  mockCalendarSource.id = 1;
  mockCalendarSource.ulid = 'calendar_source_ulid';
  mockCalendarSource.userId = 1;
  mockCalendarSource.type = CalendarSourceType.GOOGLE;
  mockCalendarSource.name = 'Test Google Calendar';
  mockCalendarSource.isActive = true;
  mockCalendarSource.accessToken = 'test_access_token';
  mockCalendarSource.refreshToken = 'test_refresh_token';

  const mockRequest = {
    tenantId: 'test-tenant-1',
  };

  beforeEach(async () => {
    const mockExternalCalendarService = {
      getAuthorizationUrl: jest.fn(),
      exchangeAuthorizationCode: jest.fn(),
      syncCalendarSource: jest.fn(),
      testConnection: jest.fn(),
    };

    const mockCalendarSourceService = {
      findOne: jest.fn(),
      findByUlid: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateByUlid: jest.fn(),
      updateSyncStatusByUlid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalCalendarController],
      imports: [ConfigModule.forFeature(googleConfig)],
      providers: [
        {
          provide: ExternalCalendarService,
          useValue: mockExternalCalendarService,
        },
        {
          provide: CalendarSourceService,
          useValue: mockCalendarSourceService,
        },
        {
          provide: googleConfig.KEY,
          useValue: {
            clientId: 'test_google_client_id',
            clientSecret: 'test_google_client_secret',
          },
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    controller = module.get<ExternalCalendarController>(ExternalCalendarController);
    externalCalendarService = module.get(ExternalCalendarService);
    calendarSourceService = module.get(CalendarSourceService);
  });

  describe('getAuthorizationUrl', () => {
    it('should return Google OAuth authorization URL', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?client_id=test&scope=calendar';
      externalCalendarService.getAuthorizationUrl.mockReturnValue(mockAuthUrl);

      const result = await controller.getAuthorizationUrl(
        CalendarSourceType.GOOGLE,
        mockUser,
      );

      expect(result).toEqual({
        authorizationUrl: mockAuthUrl,
        state: mockUser.id.toString(),
      });
      expect(externalCalendarService.getAuthorizationUrl).toHaveBeenCalledWith(
        CalendarSourceType.GOOGLE,
        mockUser.id
      );
    });

    it('should throw BadRequestException for invalid calendar type', async () => {
      externalCalendarService.getAuthorizationUrl.mockImplementation(() => {
        throw new BadRequestException('Unsupported calendar type');
      });

      await expect(
        controller.getAuthorizationUrl(
          'invalid' as CalendarSourceType,
          mockUser,
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-OAuth calendar types', async () => {
      externalCalendarService.getAuthorizationUrl.mockImplementation(() => {
        throw new BadRequestException('iCal URL sources do not require authorization');
      });

      await expect(
        controller.getAuthorizationUrl(
          CalendarSourceType.ICAL,
          mockUser,
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleOAuthCallback', () => {
    const mockCallbackDto = {
      code: 'auth_code_123',
      state: '1', // user ID as string
    };

    it('should exchange authorization code and create calendar source', async () => {
      const mockTokenResponse = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 3600000),
      };

      externalCalendarService.exchangeAuthorizationCode.mockResolvedValue(mockTokenResponse);
      calendarSourceService.create.mockResolvedValue(mockCalendarSource);

      const result = await controller.handleOAuthCallback(
        CalendarSourceType.GOOGLE,
        mockCallbackDto,
        mockUser,
      );

      expect(result).toEqual({
        success: true,
        calendarSource: mockCalendarSource,
        message: 'Google Calendar connected successfully',
      });

      expect(externalCalendarService.exchangeAuthorizationCode).toHaveBeenCalledWith(
        CalendarSourceType.GOOGLE,
        mockCallbackDto.code,
        mockUser.id
      );

      expect(calendarSourceService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CalendarSourceType.GOOGLE,
          name: 'Google Calendar',
          accessToken: mockTokenResponse.accessToken,
          refreshToken: mockTokenResponse.refreshToken,
          expiresAt: mockTokenResponse.expiresAt,
        }),
        mockUser,
        'test-tenant-1'
      );
    });

    it('should throw UnauthorizedException for state mismatch', async () => {
      const invalidCallbackDto = {
        code: 'auth_code_123',
        state: '999', // Different user ID
      };

      await expect(
        controller.handleOAuthCallback(
          CalendarSourceType.GOOGLE,
          invalidCallbackDto,
          mockUser,
        )
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle OAuth exchange errors gracefully', async () => {
      externalCalendarService.exchangeAuthorizationCode.mockRejectedValue(
        new BadRequestException('Invalid authorization code')
      );

      await expect(
        controller.handleOAuthCallback(
          CalendarSourceType.GOOGLE,
          mockCallbackDto,
          mockUser,
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('syncCalendarSource', () => {
    it('should trigger manual sync for user calendar source', async () => {
      const mockSyncResult = {
        success: true,
        eventsCount: 5,
        lastSyncedAt: new Date(),
      };

      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource);
      externalCalendarService.syncCalendarSource.mockResolvedValue(mockSyncResult);
      calendarSourceService.updateSyncStatusByUlid.mockResolvedValue(mockCalendarSource);

      const result = await controller.syncCalendarSource(
        mockCalendarSource.ulid,
        mockUser,
      );

      expect(result).toEqual({
        success: true,
        syncResult: mockSyncResult,
        message: 'Calendar sync completed successfully',
      });

      expect(calendarSourceService.findByUlid).toHaveBeenCalledWith(
        mockCalendarSource.ulid,
        'test-tenant-1'
      );
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledWith(
        mockCalendarSource,
        'test-tenant-1'
      );
    });

    it('should throw UnauthorizedException for calendar source not owned by user', async () => {
      calendarSourceService.findByUlid.mockResolvedValue(null as any);

      await expect(
        controller.syncCalendarSource(
          'invalid_ulid',
          mockUser,
        )
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update lastSyncedAt after successful sync', async () => {
      const mockSyncResult = {
        success: true,
        eventsCount: 3,
        lastSyncedAt: new Date(),
      };

      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource);
      externalCalendarService.syncCalendarSource.mockResolvedValue(mockSyncResult);
      calendarSourceService.updateSyncStatusByUlid.mockResolvedValue(mockCalendarSource);

      await controller.syncCalendarSource(
        mockCalendarSource.ulid,
        mockUser,
      );

      expect(calendarSourceService.updateSyncStatusByUlid).toHaveBeenCalledWith(
        mockCalendarSource.ulid,
        mockSyncResult.lastSyncedAt,
        'test-tenant-1'
      );
    });
  });

  describe('testConnection', () => {
    it('should test calendar connection successfully', async () => {
      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource);
      externalCalendarService.testConnection.mockResolvedValue(true);

      const result = await controller.testConnection(
        mockCalendarSource.ulid,
        mockUser,
      );

      expect(result).toEqual({
        success: true,
        connected: true,
        message: 'Calendar connection is working',
      });

      expect(externalCalendarService.testConnection).toHaveBeenCalledWith(
        mockCalendarSource,
        'test-tenant-1'
      );
    });

    it('should handle connection test failure', async () => {
      calendarSourceService.findByUlid.mockResolvedValue(mockCalendarSource);
      externalCalendarService.testConnection.mockResolvedValue(false);

      const result = await controller.testConnection(
        mockCalendarSource.ulid,
        mockUser,
      );

      expect(result).toEqual({
        success: true,
        connected: false,
        message: 'Calendar connection failed - check credentials',
      });
    });

    it('should throw UnauthorizedException for calendar source not owned by user', async () => {
      calendarSourceService.findByUlid.mockResolvedValue(null as any);

      await expect(
        controller.testConnection(
          'invalid_ulid',
          mockUser,
        )
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});