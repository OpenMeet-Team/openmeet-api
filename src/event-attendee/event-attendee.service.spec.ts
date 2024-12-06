import { Test, TestingModule } from '@nestjs/testing';
import { EventAttendeeService } from './event-attendee.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventRoleEntity } from '../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
  EventAttendeePermission,
} from '../core/constants/constant';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';
import { UpdateEventAttendeeDto } from './dto/update-eventAttendee.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';

describe('EventAttendeeService', () => {
  let service: EventAttendeeService;
  let eventAttendeesRepository: Repository<EventAttendeesEntity>;
  let roleRepository: Repository<EventRoleEntity>;

  // Helper function to create a mock EventAttendeesEntity
  const createMockEventAttendee = (
    partial: Partial<EventAttendeesEntity>,
  ): EventAttendeesEntity => {
    return {
      id: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: EventAttendeeStatus.Confirmed,
      event: { id: 1 } as any,
      user: { id: 1 } as any,
      role: null,
      approvalAnswer: null,
      ...partial,
    } as EventAttendeesEntity;
  };

  // Helper function to create a mock EventRoleEntity
  const createMockRole = (
    partial: Partial<EventRoleEntity>,
  ): EventRoleEntity => {
    return {
      id: 1,
      name: EventAttendeeRole.Participant,
      permissions: [],
      attendees: [],
      setEntityName: () => {},
      toJSON: () => ({}),
      hasId: () => true,
      save: () => Promise.resolve({} as EventRoleEntity),
      remove: () => Promise.resolve({} as EventRoleEntity),
      softRemove: () => Promise.resolve({} as EventRoleEntity),
      recover: () => Promise.resolve({} as EventRoleEntity),
      reload: () => Promise.resolve(),
      ...partial,
    } as EventRoleEntity;
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
    })),
  };

  const mockTenantService = {
    getTenantConnection: jest.fn().mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(mockRepository),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventAttendeeService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
        {
          provide: getRepositoryToken(EventAttendeesEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(EventRoleEntity),
          useValue: mockRepository,
        },
        {
          provide: 'REQUEST',
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<EventAttendeeService>(EventAttendeeService);
    eventAttendeesRepository = await module.resolve<
      Repository<EventAttendeesEntity>
    >(getRepositoryToken(EventAttendeesEntity));
    roleRepository = await module.resolve<Repository<EventRoleEntity>>(
      getRepositoryToken(EventRoleEntity),
    );
  });

  describe('RBAC Tests', () => {
    describe('Role Assignment', () => {
      it('should assign default attendee role when creating new attendee', async () => {
        const mockAttendeeRole = createMockRole({
          name: EventAttendeeRole.Participant,
          permissions: [
            { name: EventAttendeePermission.ViewEvent } as any,
            { name: EventAttendeePermission.CreateDiscussion } as any,
          ],
        });

        const mockCreateDto: CreateEventAttendeeDto = {
          event: { id: 1 } as any,
          user: { id: 1 } as any,
          status: EventAttendeeStatus.Confirmed,
        };

        const mockAttendee = createMockEventAttendee({
          role: mockAttendeeRole,
        });

        jest
          .spyOn(roleRepository, 'findOne')
          .mockResolvedValue(mockAttendeeRole);
        jest
          .spyOn(eventAttendeesRepository, 'create')
          .mockReturnValue(mockAttendee);
        jest
          .spyOn(eventAttendeesRepository, 'save')
          .mockResolvedValue(mockAttendee);

        const result = await service.create(mockCreateDto);

        expect(result.role).toBeDefined();
        expect(result.role.name).toBe(EventAttendeeRole.Participant);
        expect(result.role.permissions).toHaveLength(2);
      });

      it('should update attendee role when promoting to host', async () => {
        const mockOrganizerRole = createMockRole({
          id: 2,
          name: EventAttendeeRole.Host,
          permissions: [
            { name: EventAttendeePermission.ManageEvent } as any,
            { name: EventAttendeePermission.ManageAttendees } as any,
          ],
        });

        const mockAttendee = createMockEventAttendee({
          role: createMockRole({ id: 1, name: EventAttendeeRole.Participant }),
        });

        const updateDto: UpdateEventAttendeeDto = {
          role: mockOrganizerRole,
        };

        jest
          .spyOn(eventAttendeesRepository, 'findOne')
          .mockResolvedValue(mockAttendee);
        jest
          .spyOn(roleRepository, 'findOne')
          .mockResolvedValue(mockOrganizerRole);
        jest.spyOn(eventAttendeesRepository, 'save').mockResolvedValue({
          ...mockAttendee,
          role: mockOrganizerRole,
        } as EventAttendeesEntity);

        const result = await service.updateEventAttendee(1, 1, updateDto);

        expect(result.role.id).toBe(mockOrganizerRole.id);
        expect(result.role.name).toBe(EventAttendeeRole.Host);
      });
    });

    describe('Permission Loading', () => {
      it('should load attendee with role and permissions', async () => {
        const mockAttendee = createMockEventAttendee({
          role: createMockRole({
            name: EventAttendeeRole.Participant,
            permissions: [
              { name: EventAttendeePermission.ViewEvent } as any,
              { name: EventAttendeePermission.CreateDiscussion } as any,
            ],
          }),
        });

        jest
          .spyOn(eventAttendeesRepository, 'findOne')
          .mockResolvedValue(mockAttendee);

        const result = await service.findEventAttendeeByUserId(1, 1);

        if (!result) throw new Error('Result should be defined');
        expect(result.role).toBeDefined();
        expect(result.role.permissions).toBeDefined();
        expect(result.role.permissions).toHaveLength(2);
      });

      it('should return null when attendee not found', async () => {
        jest.spyOn(eventAttendeesRepository, 'findOne').mockResolvedValue(null);
        const result = await service.findEventAttendeeByUserId(999, 999);
        expect(result).toBeNull();
      });
    });

    describe('Role-based Operations', () => {
      it('should allow owner to update attendee role', async () => {
        const mockOwner = createMockEventAttendee({
          role: createMockRole({
            name: EventAttendeeRole.Host,
            permissions: [
              { name: EventAttendeePermission.ManageAttendees } as any,
            ],
          }),
        });

        const mockAttendee = createMockEventAttendee({
          role: createMockRole({ name: EventAttendeeRole.Participant }),
        });

        const newRole = createMockRole({
          id: 3,
          name: EventAttendeeRole.Moderator,
        });
        const updateDto: UpdateEventAttendeeDto = {
          role: newRole,
        };

        jest
          .spyOn(eventAttendeesRepository, 'findOne')
          .mockResolvedValueOnce(mockOwner)
          .mockResolvedValueOnce(mockAttendee);

        const result = await service.updateEventAttendee(1, 2, updateDto);

        expect(result.role.id).toBe(newRole.id);
      });

      it.skip('should not allow participants to update roles', async () => {
        // Create a regular attendee trying to update someone else's role
        const mockRegularAttendee = createMockEventAttendee({
          role: createMockRole({
            name: EventAttendeeRole.Participant,
            permissions: [
              { name: EventAttendeePermission.ViewEvent } as any,
              { name: EventAttendeePermission.CreateDiscussion } as any,
            ],
          }),
        });

        const mockTargetAttendee = createMockEventAttendee({
          id: 2,
          role: createMockRole({ name: EventAttendeeRole.Participant }),
        });

        const newRole = createMockRole({ name: EventAttendeeRole.Moderator });
        const updateDto: UpdateEventAttendeeDto = {
          role: newRole,
        };

        jest
          .spyOn(eventAttendeesRepository, 'findOne')
          .mockResolvedValueOnce(mockTargetAttendee) // First call for target attendee
          .mockResolvedValueOnce(mockRegularAttendee); // Second call for current user check

        await expect(
          service.updateEventAttendee(1, 2, updateDto),
        ).rejects.toThrow(
          new ForbiddenException(
            'You do not have permission to manage attendees',
          ),
        );

        // Verify that save was never called
        expect(eventAttendeesRepository.save).not.toHaveBeenCalled();
      });
    });
  });
});
