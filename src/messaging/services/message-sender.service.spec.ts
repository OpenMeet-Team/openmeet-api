import { Test, TestingModule } from '@nestjs/testing';
import { MessageSenderService } from './message-sender.service';
import {
  IEmailSender,
  EMAIL_SENDER_TOKEN,
} from '../interfaces/email-sender.interface';

describe('MessageSenderService', () => {
  let service: MessageSenderService;
  let mockEmailSender: jest.Mocked<IEmailSender>;

  beforeEach(async () => {
    mockEmailSender = {
      sendEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageSenderService,
        {
          provide: EMAIL_SENDER_TOKEN,
          useValue: mockEmailSender,
        },
      ],
    }).compile();

    service = module.get<MessageSenderService>(MessageSenderService);
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    const mockEmailOptions = {
      to: 'user@example.com',
      subject: 'Test Subject',
      text: 'Test content',
      html: '<p>Test content</p>',
      tenantId: 'tenant123',
    };

    it('should send email successfully and return external ID', async () => {
      const expectedExternalId = 'ext_123456';
      mockEmailSender.sendEmail.mockResolvedValue(expectedExternalId);

      const result = await service.sendEmail(mockEmailOptions);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith(mockEmailOptions);
      expect(mockEmailSender.sendEmail).toHaveBeenCalledTimes(1);
      expect(result).toBe(expectedExternalId);
    });

    it('should handle email sending failure and return null', async () => {
      const error = new Error('SMTP connection failed');
      mockEmailSender.sendEmail.mockRejectedValue(error);

      const result = await service.sendEmail(mockEmailOptions);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith(mockEmailOptions);
      expect(result).toBeNull();
    });

    it('should handle null response from email sender', async () => {
      mockEmailSender.sendEmail.mockResolvedValue(null as any);

      const result = await service.sendEmail(mockEmailOptions);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith(mockEmailOptions);
      expect(result).toBeNull();
    });

    it('should handle undefined response from email sender', async () => {
      mockEmailSender.sendEmail.mockResolvedValue(undefined as any);

      const result = await service.sendEmail(mockEmailOptions);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith(mockEmailOptions);
      expect(result).toBeUndefined();
    });
  });

  describe('sendSystemEmail', () => {
    const mockSystemEmailOptions = {
      recipientEmail: 'user@example.com',
      subject: 'System Notification',
      text: 'System message content',
      html: '<p>System message content</p>',
      tenantId: 'tenant123',
    };

    it('should send system email with proper formatting', async () => {
      const expectedExternalId = 'sys_ext_789';
      mockEmailSender.sendEmail.mockResolvedValue(expectedExternalId);

      const result = await service.sendSystemEmail(mockSystemEmailOptions);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith({
        to: mockSystemEmailOptions.recipientEmail,
        subject: mockSystemEmailOptions.subject,
        text: mockSystemEmailOptions.text,
        html: mockSystemEmailOptions.html,
        tenantId: mockSystemEmailOptions.tenantId,
        templatePath: undefined,
        context: undefined,
      });
      expect(result).toBe(expectedExternalId);
    });

    it('should send system email without HTML when not provided', async () => {
      const expectedExternalId = 'sys_ext_890';
      const optionsWithoutHtml = {
        recipientEmail: 'user@example.com',
        subject: 'System Notification',
        text: 'System message content',
        tenantId: 'tenant123',
      };
      mockEmailSender.sendEmail.mockResolvedValue(expectedExternalId);

      const result = await service.sendSystemEmail(optionsWithoutHtml);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith({
        to: optionsWithoutHtml.recipientEmail,
        subject: optionsWithoutHtml.subject,
        text: optionsWithoutHtml.text,
        tenantId: optionsWithoutHtml.tenantId,
        templatePath: undefined,
        context: undefined,
      });
      expect(result).toBe(expectedExternalId);
    });

    it('should handle system email sending failure', async () => {
      const error = new Error('Email service unavailable');
      mockEmailSender.sendEmail.mockRejectedValue(error);

      const result = await service.sendSystemEmail(mockSystemEmailOptions);

      expect(result).toBeNull();
    });

    it('should handle empty recipient email', async () => {
      const optionsWithEmptyEmail = {
        ...mockSystemEmailOptions,
        recipientEmail: '',
      };
      mockEmailSender.sendEmail.mockResolvedValue(undefined as any);

      const result = await service.sendSystemEmail(optionsWithEmptyEmail);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith({
        to: '',
        subject: mockSystemEmailOptions.subject,
        text: mockSystemEmailOptions.text,
        html: mockSystemEmailOptions.html,
        tenantId: mockSystemEmailOptions.tenantId,
        templatePath: undefined,
        context: undefined,
      });
      expect(result).toBeUndefined();
    });

    it('should handle malformed recipient email', async () => {
      const optionsWithBadEmail = {
        ...mockSystemEmailOptions,
        recipientEmail: 'not-an-email',
      };
      mockEmailSender.sendEmail.mockRejectedValue(
        new Error('Invalid email format'),
      );

      const result = await service.sendSystemEmail(optionsWithBadEmail);

      expect(result).toBeNull();
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have email sender injected', () => {
      expect(service['emailSender']).toBeDefined();
    });
  });
});
