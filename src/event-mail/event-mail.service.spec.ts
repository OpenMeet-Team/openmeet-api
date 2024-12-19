import { Test, TestingModule } from '@nestjs/testing';
import { EventMailService } from './event-mail.service';
import { MailService } from '../mail/mail.service';
import {
  mockEventAttendeeService,
  mockEventService,
  mockMailService,
  mockTenantConnectionService,
} from '../test/mocks';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventService } from '../event/event.service';

describe('EventMailService', () => {
  let service: EventMailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMailService,
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: EventService,
          useValue: mockEventService,
        },
      ],
    }).compile();

    service = module.get<EventMailService>(EventMailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
