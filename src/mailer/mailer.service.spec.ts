import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { REQUEST } from '@nestjs/core';

describe('MailerService', () => {
  let service: MailerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
            getOrThrow: jest.fn().mockReturnValue('test'),
          },
        },
        {
          provide: REQUEST,
          useValue: {},
        },
      ],
    }).compile();

    service = await module.resolve<MailerService>(MailerService);
  });

  describe('generateAdminMessagePlainText', () => {
    it('should generate correct plain text format', () => {
      const context = {
        event: {
          name: 'Test Event',
          slug: 'test-event',
        },
        admin: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        subject: 'Important Announcement',
        message: 'This is a test message.\n\nWith multiple lines.',
      };

      const tenantConfig = {
        frontendDomain: 'https://test.example.com',
        name: 'Test Platform',
      };

      // Access the private method for testing
      const result = (service as any).generateEventAdminMessagePlainText(
        context,
        tenantConfig,
      );

      expect(result).toContain('Hello,');
      expect(result).toContain(
        'John Doe from Test Event has sent you a message:',
      );
      expect(result).toContain('Important Announcement');
      expect(result).toContain(
        'This is a test message.\n\nWith multiple lines.',
      );
      expect(result).toContain(
        'View Event: https://test.example.com/events/test-event',
      );
      expect(result).toContain(
        'This message was sent by John Doe from the event',
      );
      expect(result).toContain('from the event "Test Event"');
      expect(result).toContain('Test Platform');
    });

    it('should handle admin without email', () => {
      const context = {
        event: {
          name: 'Test Event',
          slug: 'test-event',
        },
        admin: {
          firstName: 'Jane',
          lastName: 'Smith',
          // No email
        },
        subject: 'Test Subject',
        message: 'Test message',
      };

      const tenantConfig = {
        frontendDomain: 'https://test.example.com',
        name: 'Test Platform',
      };

      const result = (service as any).generateEventAdminMessagePlainText(
        context,
        tenantConfig,
      );

      expect(result).toContain('Jane Smith from Test Event');
      expect(result).toContain(
        'This message was sent by Jane Smith from the event',
      );
      expect(result).not.toContain('@'); // Should not contain any email addresses
    });
  });
});
