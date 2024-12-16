import { Test, TestingModule } from '@nestjs/testing';
import { EventMailService } from './event-mail.service';

describe('EventMailService', () => {
  let service: EventMailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventMailService],
    }).compile();

    service = module.get<EventMailService>(EventMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
