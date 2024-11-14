import { mockTenantConnectionService, mockUserService } from '../test/mocks';
import { ChatService } from './chat.service';
import { mockRepository, mockZulipService } from '../test/mocks';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from '../user/user.service';
import { TenantConnectionService } from '../tenant/tenant.service';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: ZulipService,
          useValue: mockZulipService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = await module.resolve<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
