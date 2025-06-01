import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { google } from 'googleapis';
import axios from 'axios';
import * as ical from 'node-ical';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';
import googleConfig from '../auth-google/config/google.config';

export interface ExternalEvent {
  sourceId: string;
  externalId: string;
  summary: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  status: 'busy' | 'free' | 'tentative';
  location?: string;
  description?: string;
}

export interface SyncResult {
  success: boolean;
  eventsCount: number;
  error?: string;
  lastSyncedAt: Date;
}

@Injectable()
export class ExternalCalendarService {
  private readonly logger = new Logger(ExternalCalendarService.name);

  constructor(
    @Inject(googleConfig.KEY)
    private readonly googleConfiguration: ConfigType<typeof googleConfig>,
    private readonly externalEventRepository: ExternalEventRepository,
  ) {}

  /**
   * Sync events from an external calendar source
   */
  async syncCalendarSource(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<SyncResult> {
    this.logger.log(
      `Starting sync for calendar source ${calendarSource.id} (${calendarSource.type})`,
    );

    try {
      switch (calendarSource.type) {
        case CalendarSourceType.GOOGLE:
          return await this.syncGoogleCalendar(calendarSource, tenantId);
        case CalendarSourceType.APPLE:
          return await this.syncAppleCalendar(calendarSource, tenantId);
        case CalendarSourceType.OUTLOOK:
          return await this.syncOutlookCalendar(calendarSource, tenantId);
        case CalendarSourceType.ICAL:
          return await this.syncICalUrl(calendarSource, tenantId);
        default:
          throw new BadRequestException(
            `Unsupported calendar source type: ${calendarSource.type}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync calendar source ${calendarSource.id}: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        eventsCount: 0,
        error: error.message,
        lastSyncedAt: new Date(),
      };
    }
  }

  /**
   * Get authorization URL for OAuth providers
   */
  getAuthorizationUrl(type: CalendarSourceType, userId: number): string {
    switch (type) {
      case CalendarSourceType.GOOGLE:
        return this.getGoogleAuthUrl(userId);
      case CalendarSourceType.OUTLOOK:
        return this.getOutlookAuthUrl(userId);
      case CalendarSourceType.APPLE:
        throw new BadRequestException(
          'Apple Calendar uses iCal URL subscription, not OAuth',
        );
      case CalendarSourceType.ICAL:
        throw new BadRequestException(
          'iCal URL sources do not require authorization',
        );
      default:
        throw new BadRequestException(`Unsupported calendar type: ${type}`);
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeAuthorizationCode(
    type: CalendarSourceType,
    code: string,
    userId: number,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    switch (type) {
      case CalendarSourceType.GOOGLE:
        return this.exchangeGoogleAuthCode(code, userId);
      case CalendarSourceType.OUTLOOK:
        return this.exchangeOutlookAuthCode(code, userId);
      default:
        throw new BadRequestException(
          `OAuth not supported for calendar type: ${type}`,
        );
    }
  }

  /**
   * Refresh expired access token
   */
  async refreshAccessToken(calendarSource: CalendarSourceEntity): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    if (!calendarSource.refreshToken) {
      throw new UnauthorizedException(
        'No refresh token available for calendar source',
      );
    }

    switch (calendarSource.type) {
      case CalendarSourceType.GOOGLE:
        return this.refreshGoogleToken(calendarSource);
      case CalendarSourceType.OUTLOOK:
        return this.refreshOutlookToken(calendarSource);
      default:
        throw new BadRequestException(
          `Token refresh not supported for calendar type: ${calendarSource.type}`,
        );
    }
  }

  /**
   * Test calendar connection
   */
  async testConnection(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const result = await this.syncCalendarSource(calendarSource, tenantId);
      return result.success;
    } catch (error) {
      this.logger.warn(
        `Connection test failed for calendar source ${calendarSource.id}: ${error.message}`,
      );
      return false;
    }
  }

  // Private implementation methods (to be implemented)
  private async syncGoogleCalendar(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<SyncResult> {
    if (
      !this.googleConfiguration.clientId ||
      !this.googleConfiguration.clientSecret
    ) {
      throw new BadRequestException('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.googleConfiguration.clientId,
      this.googleConfiguration.clientSecret,
    );

    oauth2Client.setCredentials({
      access_token: calendarSource.accessToken,
      refresh_token: calendarSource.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
      // Get events from the primary calendar for the next 30 days
      const startTime = new Date();
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + 30);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const externalEvents: ExternalEvent[] = events.map((event) => ({
        sourceId: calendarSource.ulid,
        externalId: event.id!,
        summary: event.summary || 'Untitled Event',
        startTime: new Date(event.start?.dateTime || event.start?.date || ''),
        endTime: new Date(event.end?.dateTime || event.end?.date || ''),
        isAllDay: !event.start?.dateTime,
        status: this.mapGoogleEventStatus(event.status || undefined),
        location: event.location || undefined,
        description: event.description || undefined,
      }));

      this.logger.log(
        `Synced ${externalEvents.length} events from Google Calendar for source ${calendarSource.id}`,
      );

      // Store external events in database
      if (externalEvents.length > 0) {
        await this.storeExternalEvents(
          tenantId,
          calendarSource.id,
          externalEvents,
        );
      }

      return {
        success: true,
        eventsCount: externalEvents.length,
        lastSyncedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Google Calendar sync failed: ${error.message}`,
        error.stack,
      );

      // If token expired, try to refresh
      if (error.code === 401 && calendarSource.refreshToken) {
        try {
          await this.refreshGoogleToken(calendarSource);
          // TODO: Update calendar source with new tokens
          this.logger.log(
            `Refreshed Google tokens for calendar source ${calendarSource.id}`,
          );

          return {
            success: false,
            eventsCount: 0,
            error: 'Token refreshed, retry sync',
            lastSyncedAt: new Date(),
          };
        } catch (refreshError) {
          this.logger.error(`Token refresh failed: ${refreshError.message}`);
        }
      }

      throw error;
    }
  }

  private mapGoogleEventStatus(
    status?: string | null,
  ): 'busy' | 'free' | 'tentative' {
    switch (status) {
      case 'confirmed':
        return 'busy';
      case 'tentative':
        return 'tentative';
      case 'cancelled':
        return 'free';
      default:
        return 'busy';
    }
  }

  private async syncAppleCalendar(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<SyncResult> {
    // Apple Calendar uses iCal URL, so delegate to iCal sync
    return this.syncICalUrl(calendarSource, tenantId);
  }

  private syncOutlookCalendar(
    _calendarSource: CalendarSourceEntity,
    _tenantId: string,
  ): Promise<SyncResult> {
    // TODO: Implement Microsoft Graph API integration
    throw new Error('Outlook Calendar sync not yet implemented');
  }

  private async syncICalUrl(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<SyncResult> {
    if (!calendarSource.url) {
      throw new BadRequestException(
        'iCal URL is required for iCal calendar sources',
      );
    }

    this.logger.log(
      `Fetching iCal data from URL: ${calendarSource.url} for source ${calendarSource.id}`,
    );

    try {
      // Fetch iCal data from URL with timeout
      const response = await axios.get(calendarSource.url, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'OpenMeet Calendar Sync/1.0',
          Accept: 'text/calendar,text/plain',
        },
      });

      if (!response.data) {
        throw new BadRequestException('Empty response from iCal URL');
      }

      // Parse iCal data
      const parsedEvents = ical.parseICS(response.data);
      const externalEvents: ExternalEvent[] = [];

      // Convert parsed events to our format
      for (const [key, event] of Object.entries(parsedEvents)) {
        if (event.type === 'VEVENT' && event.start && event.end) {
          // Skip events that are older than 1 month
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

          const eventStart = new Date(event.start);
          if (eventStart < oneMonthAgo) {
            continue;
          }

          // Skip events more than 1 year in the future
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

          if (eventStart > oneYearFromNow) {
            continue;
          }

          const externalEvent: ExternalEvent = {
            sourceId: calendarSource.ulid,
            externalId: event.uid || key,
            summary: this.sanitizeSummary(event.summary || 'Untitled Event'),
            startTime: new Date(event.start),
            endTime: new Date(event.end),
            isAllDay: this.isAllDayEvent(event),
            status: this.mapICalEventStatus(event.status),
            location: event.location || undefined,
            description: event.description || undefined,
          };

          externalEvents.push(externalEvent);
        }
      }

      this.logger.log(
        `Parsed ${externalEvents.length} events from iCal URL for source ${calendarSource.id}`,
      );

      // Store external events in database
      if (externalEvents.length > 0) {
        await this.storeExternalEvents(
          tenantId,
          calendarSource.id,
          externalEvents,
        );
      }

      return {
        success: true,
        eventsCount: externalEvents.length,
        lastSyncedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `iCal URL sync failed for source ${calendarSource.id}: ${error.message}`,
        error.stack,
      );

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new BadRequestException(
          'Unable to connect to iCal URL - please check the URL is correct and accessible',
        );
      }

      if (error.code === 'ETIMEDOUT') {
        throw new BadRequestException(
          'iCal URL request timed out - please try again later',
        );
      }

      throw new BadRequestException(
        `Failed to sync iCal URL: ${error.message}`,
      );
    }
  }

  private sanitizeSummary(summary: string): string {
    // Remove any potentially harmful content and limit length
    return summary.replace(/[<>]/g, '').substring(0, 255);
  }

  private isAllDayEvent(event: any): boolean {
    // Check if event is all-day by examining the start/end format
    if (!event.start || !event.end) {
      return false;
    }

    // If start/end are date strings without time (YYYY-MM-DD format)
    const startStr = event.start.toString();
    const endStr = event.end.toString();

    // Check if it's a simple date format (no time component)
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(startStr) ||
      /^\d{4}-\d{2}-\d{2}$/.test(endStr) ||
      (event.datetype === 'date' && event.datetype === 'date')
    );
  }

  private mapICalEventStatus(status?: string): 'busy' | 'free' | 'tentative' {
    if (!status) {
      return 'busy'; // Default to busy if no status
    }

    switch (status.toUpperCase()) {
      case 'CONFIRMED':
        return 'busy';
      case 'TENTATIVE':
        return 'tentative';
      case 'CANCELLED':
        return 'free';
      default:
        return 'busy';
    }
  }

  private getGoogleAuthUrl(userId: number): string {
    if (
      !this.googleConfiguration.clientId ||
      !this.googleConfiguration.clientSecret
    ) {
      throw new BadRequestException('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.googleConfiguration.clientId,
      this.googleConfiguration.clientSecret,
      `${process.env.FRONTEND_DOMAIN}/auth/google/calendar/callback`,
    );

    const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId.toString(),
      prompt: 'consent',
    });

    return url;
  }

  private getOutlookAuthUrl(_userId: number): string {
    // TODO: Implement Microsoft OAuth URL generation
    throw new Error('Outlook OAuth URL generation not yet implemented');
  }

  private async exchangeGoogleAuthCode(
    code: string,
    _userId: number,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    if (
      !this.googleConfiguration.clientId ||
      !this.googleConfiguration.clientSecret
    ) {
      throw new BadRequestException('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.googleConfiguration.clientId,
      this.googleConfiguration.clientSecret,
      `${process.env.FRONTEND_DOMAIN}/auth/google/calendar/callback`,
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new BadRequestException('No access token received from Google');
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Google OAuth code exchange failed: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to exchange Google OAuth code');
    }
  }

  private exchangeOutlookAuthCode(
    _code: string,
    _userId: number,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    // TODO: Implement Microsoft OAuth code exchange
    throw new Error('Outlook OAuth code exchange not yet implemented');
  }

  private async refreshGoogleToken(
    calendarSource: CalendarSourceEntity,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    if (
      !this.googleConfiguration.clientId ||
      !this.googleConfiguration.clientSecret
    ) {
      throw new BadRequestException('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.googleConfiguration.clientId,
      this.googleConfiguration.clientSecret,
    );

    oauth2Client.setCredentials({
      refresh_token: calendarSource.refreshToken,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new UnauthorizedException(
          'Failed to refresh Google access token',
        );
      }

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || calendarSource.refreshToken,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Google token refresh failed: ${error.message}`,
        error.stack,
      );
      throw new UnauthorizedException('Failed to refresh Google access token');
    }
  }

  private refreshOutlookToken(_calendarSource: CalendarSourceEntity): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    // TODO: Implement Microsoft token refresh
    throw new Error('Outlook token refresh not yet implemented');
  }

  /**
   * Store external events in the database
   * Uses upsert to handle existing events efficiently
   */
  private async storeExternalEvents(
    tenantId: string,
    calendarSourceId: number,
    externalEvents: ExternalEvent[],
  ): Promise<void> {
    try {
      // Convert ExternalEvent interface to database format
      const eventsToStore = externalEvents.map((event) => ({
        externalId: event.externalId,
        summary: event.summary,
        startTime: event.startTime,
        endTime: event.endTime,
        isAllDay: event.isAllDay,
        status: event.status,
        location: event.location,
        description: event.description,
        calendarSourceId,
      }));

      // Use upsert for efficient storage
      await this.externalEventRepository.upsertMany(
        tenantId,
        calendarSourceId,
        eventsToStore,
      );

      this.logger.debug(
        `Stored ${eventsToStore.length} external events for calendar source ${calendarSourceId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store external events for calendar source ${calendarSourceId}: ${error.message}`,
        error.stack,
      );
      // Don't throw here - sync should continue even if storage fails
    }
  }
}
