import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { REQUEST } from '@nestjs/core';

describe('MailerService', () => {
  let service: MailerService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'app.workingDirectory') {
                return process.cwd();
              }
              return 'test';
            }),
          },
        },
        {
          provide: REQUEST,
          useValue: {},
        },
      ],
    }).compile();

    service = await module.resolve<MailerService>(MailerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('renderTemplate - Event Update Email', () => {
    let originalTZ: string | undefined;

    beforeAll(() => {
      // Save original timezone and force UTC to simulate production environment
      originalTZ = process.env.TZ;
      process.env.TZ = 'UTC';
    });

    afterAll(() => {
      // Restore original timezone
      process.env.TZ = originalTZ;
    });

    it('should format date in the correct timezone when event crosses UTC day boundary', async () => {
      // This test addresses the bug where an event at 6:30 PM Pacific on Oct 22
      // (which is 1:30 AM UTC on Oct 23) was showing as "October 23" instead of "October 22"
      // because toLocaleDateString() wasn't using the event's timezone

      // Create a date that is Oct 22, 2025 at 6:30 PM Pacific Time
      // In UTC, this is Oct 23, 2025 at 1:30 AM
      const eventDate = new Date('2025-10-23T01:30:00.000Z');

      const context = {
        recipientName: 'Test User',
        eventTitle: 'Chuck Stories',
        eventDescription: 'Meet at the Port Moody Legion and share Chuck stories',
        eventDateTime: eventDate,
        eventEndDateTime: null,
        eventTimeZone: 'America/Vancouver',
        eventLocation: 'Royal Canadian Legion Branch 119, Port Moody',
        groupName: 'Coast Riders Motorcycle Club',
        organizerName: 'Alain Chevalier',
        eventUrl: 'https://test.openmeet.net/events/chuck-stories',
        groupUrl: 'https://test.openmeet.net/groups/coast-riders',
        organizerUrl: 'https://test.openmeet.net/members/alain',
        tenantConfig: {
          frontendDomain: 'https://test.openmeet.net',
        },
      };

      const html = await service.renderTemplate(
        'event/event-update-announcement',
        context,
      );

      // The HTML should contain "Wednesday, October 22, 2025" (the correct date in Pacific time)
      // NOT "Thursday, October 23, 2025" (the incorrect UTC date)
      expect(html).toContain('Wednesday, October 22, 2025');
      expect(html).not.toContain('Thursday, October 23, 2025');

      // Also verify the time is correct
      expect(html).toContain('6:30 PM');
    });

    it('should format date correctly in new-event-announcement template', async () => {
      // Test the same timezone bug fix for new event announcements
      const eventDate = new Date('2025-10-23T01:30:00.000Z');

      const context = {
        recipientName: 'Test User',
        eventTitle: 'Chuck Stories',
        eventDescription: 'Meet at the Port Moody Legion and share Chuck stories',
        eventDateTime: eventDate,
        eventEndDateTime: null,
        eventTimeZone: 'America/Vancouver',
        eventLocation: 'Royal Canadian Legion Branch 119, Port Moody',
        groupName: 'Coast Riders Motorcycle Club',
        organizerName: 'Alain Chevalier',
        eventUrl: 'https://test.openmeet.net/events/chuck-stories',
        groupUrl: 'https://test.openmeet.net/groups/coast-riders',
        organizerUrl: 'https://test.openmeet.net/members/alain',
        tenantConfig: {
          frontendDomain: 'https://test.openmeet.net',
        },
      };

      const html = await service.renderTemplate(
        'event/new-event-announcement',
        context,
      );

      expect(html).toContain('Wednesday, October 22, 2025');
      expect(html).not.toContain('Thursday, October 23, 2025');
      expect(html).toContain('6:30 PM');
    });

    it('should format date correctly in event-cancellation-announcement template', async () => {
      // Test the same timezone bug fix for event cancellations
      const eventDate = new Date('2025-10-23T01:30:00.000Z');

      const context = {
        recipientName: 'Test User',
        eventTitle: 'Chuck Stories',
        eventDescription: 'Meet at the Port Moody Legion and share Chuck stories',
        eventDateTime: eventDate,
        eventEndDateTime: null,
        eventTimeZone: 'America/Vancouver',
        eventLocation: 'Royal Canadian Legion Branch 119, Port Moody',
        groupName: 'Coast Riders Motorcycle Club',
        organizerName: 'Alain Chevalier',
        eventUrl: 'https://test.openmeet.net/events/chuck-stories',
        groupUrl: 'https://test.openmeet.net/groups/coast-riders',
        organizerUrl: 'https://test.openmeet.net/members/alain',
        tenantConfig: {
          frontendDomain: 'https://test.openmeet.net',
        },
      };

      const html = await service.renderTemplate(
        'event/event-cancellation-announcement',
        context,
      );

      expect(html).toContain('Wednesday, October 22, 2025');
      expect(html).not.toContain('Thursday, October 23, 2025');
      expect(html).toContain('6:30 PM');
    });
  });
});
