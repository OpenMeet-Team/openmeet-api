import { Test, TestingModule } from '@nestjs/testing';
import { EventAttendeeService } from './event-attendee.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventRoleService } from '../event-role/event-role.service';
import { REQUEST } from '@nestjs/core';
import { EventAttendeeStatus } from '../core/constants/constant';

describe('EventAttendeeService', () => {
  let service: EventAttendeeService;

  // Mock Data
  const mockEventAttendee = {
    id: 1,
    event: { id: 1 },
    user: {
      id: 1,
      name: 'Test User',
      slug: 'test-user',
      photo: { path: 'test/path' },
    },
    role: {
      id: 1,
      name: 'attendee',
      permissions: [
        { id: 1, name: 'view_event' },
        { id: 2, name: 'join_event' },
      ],
    },
    status: EventAttendeeStatus.Confirmed,
    approvalAnswer: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mock Query Builder
  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockEventAttendee),
    getMany: jest.fn().mockResolvedValue([mockEventAttendee]),
  };

  // Mock Repository
  const mockRepository = {
    findOne: jest.fn().mockResolvedValue(mockEventAttendee),
    find: jest.fn().mockResolvedValue([mockEventAttendee]),
    save: jest.fn().mockResolvedValue(mockEventAttendee),
    create: jest.fn().mockReturnValue(mockEventAttendee),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  // Mock Connection
  const mockConnection = {
    getRepository: jest.fn().mockReturnValue(mockRepository),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventAttendeeService,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue(mockConnection),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest
              .fn()
              .mockResolvedValue({ id: 1, name: 'attendee' }),
          },
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
    it('should return an event attendee with user details', async () => {
      const result = await service.showEventAttendee(1);

      expect(result).toBeDefined();
      expect(result?.user).toBeDefined();
      expect(result?.user?.name).toBe('Test User');
      expect(result?.user?.photo?.path).toBe('test/path');
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalled();
    });

    it('should return null when attendee not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      const result = await service.showEventAttendee(999);
      expect(result).toBeNull();
    });
  });

  describe('findEventAttendeeByUserId', () => {
    it('should find attendee by user and event ID', async () => {
      const result = await service.findEventAttendeeByUserId(1, 1);

      expect(result).toBeDefined();
      expect(result?.user?.id).toBe(1);
      expect(result?.event?.id).toBe(1);
    });

    it('should return null when attendee not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      const result = await service.findEventAttendeeByUserId(999, 999);
      expect(result).toBeNull();
    });
  });
});
