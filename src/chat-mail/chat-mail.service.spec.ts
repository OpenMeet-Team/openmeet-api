import { Test, TestingModule } from '@nestjs/testing';
import { ChatMailService } from './chat-mail.service';

describe('ChatMailService', () => {
  let service: ChatMailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatMailService],
    }).compile();

    service = module.get<ChatMailService>(ChatMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
