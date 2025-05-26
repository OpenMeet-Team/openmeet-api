import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthEmailListener, UserSignupEvent } from './auth-email.listener';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { MessageType } from '../interfaces/message.interface';

describe('AuthEmailListener', () => {
  let listener: AuthEmailListener;
  let messagingService: jest.Mocked<UnifiedMessagingService>;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const mockMessagingService = {
      sendSystemMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthEmailListener,
        {
          provide: UnifiedMessagingService,
          useValue: mockMessagingService,
        },
        EventEmitter2,
      ],
    }).compile();

    listener = module.get<AuthEmailListener>(AuthEmailListener);
    messagingService = module.get(UnifiedMessagingService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('handleUserSignup', () => {
    it('should send signup email via messaging service', async () => {
      const event: UserSignupEvent = {
        email: 'test@example.com',
        userId: 123,
        hash: 'test-hash',
        tenantId: 'tenant123',
      };

      messagingService.sendSystemMessage.mockResolvedValue({} as any);

      await listener.handleUserSignup(event);

      expect(messagingService.sendSystemMessage).toHaveBeenCalledWith({
        recipientUserData: { id: 123, email: 'test@example.com' },
        subject: 'Confirm your email',
        content: expect.stringContaining('Welcome to our platform'),
        htmlContent: undefined,
        templateId: 'auth/activation.mjml.ejs',
        context: expect.objectContaining({
          title: 'Confirm your email',
          hash: 'test-hash',
        }),
        type: MessageType.ADMIN_CONTACT,
        systemReason: 'user_signup',
        tenantId: 'tenant123',
      });
    });

    it('should skip sending email when no tenantId provided', async () => {
      const event: UserSignupEvent = {
        email: 'test@example.com',
        userId: 123,
        hash: 'test-hash',
        // no tenantId
      };

      await listener.handleUserSignup(event);

      expect(messagingService.sendSystemMessage).not.toHaveBeenCalled();
    });

    it('should handle messaging service errors gracefully', async () => {
      const event: UserSignupEvent = {
        email: 'test@example.com',
        userId: 123,
        hash: 'test-hash',
        tenantId: 'tenant123',
      };

      messagingService.sendSystemMessage.mockRejectedValue(
        new Error('UserService not available'),
      );

      // Should not throw - errors should be caught and logged
      await expect(listener.handleUserSignup(event)).resolves.toBeUndefined();

      expect(messagingService.sendSystemMessage).toHaveBeenCalled();
    });
  });
});