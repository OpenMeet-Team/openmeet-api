import { Test, TestingModule } from '@nestjs/testing';
import { EventAttendeeService } from './event-attendee.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { EventRoleService } from '../event-role/event-role.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserService } from '../user/user.service';
import { forwardRef } from '@nestjs/common';
import { stopCleanupInterval } from '../database/data-source';

describe('EventAttendeeService', () => {
  let service: EventAttendeeService;
  let module: TestingModule;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EventAttendeeService,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: () => mockRepository,
            }),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest.fn(),
          },
        },
        {
          provide: BlueskyRsvpService,
          useFactory: () => ({
            createRsvp: jest.fn(),
            deleteRsvp: jest.fn(),
          }),
        },
        {
          provide: UserService,
          useFactory: () => ({
            findById: jest.fn(),
          }),
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<EventAttendeeService>(EventAttendeeService);
  });

  describe('showEventAttendee', () => {
    it('should find an attendee', async () => {
      const mockAttendee = {
        id: 1,
        user: { id: 1, name: 'Test User' },
      };

      mockQueryBuilder.getOne.mockResolvedValueOnce(mockAttendee);
      const result = await service.showEventAttendee(1);
      expect(result).toBeDefined();
      expect(result?.user).toBeDefined();
    });

    it('should return null when attendee not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      const result = await service.showEventAttendee(999);
      expect(result).toBeNull();
    });
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });
  afterAll(() => {
    stopCleanupInterval();
  });
});
