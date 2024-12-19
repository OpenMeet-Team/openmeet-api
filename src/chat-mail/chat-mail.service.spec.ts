import { Test, TestingModule } from '@nestjs/testing';
import { ChatMailService } from './chat-mail.service';
import { MailService } from '../mail/mail.service';
import { mockMailService, mockUser } from '../test/mocks';
import { TenantConnectionService } from '../tenant/tenant.service';
import { mockTenantConnectionService } from '../test/mocks';

describe('ChatMailService', () => {
  let service: ChatMailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatMailService,
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<ChatMailService>(ChatMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMailNewMessage', () => {
    it('should send mail new message', async () => {
      const participant = mockUser;
      const result = await service.sendMailNewMessage(participant);
      expect(result).toBeUndefined();
    });
  });
});
