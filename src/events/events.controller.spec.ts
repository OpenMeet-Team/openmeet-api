import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './events.controller';
import { EventService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { UsersService } from '../users/users.service';
import { GroupService } from '../groups/groups.service';
import { UserEntity } from '../users/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from '../categories/infrastructure/persistence/relational/entities/categories.entity';
import { Request } from 'express';
import { GroupEntity } from '../groups/infrastructure/persistence/relational/entities/group.entity';

// Mock services
const mockUsersService = {};
const mockGroupService = {};

const mockUser = {
  id: 1,
  email: 'test@example.com',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: new Date(),
  updatedAt: new Date(),
} as UserEntity;

const mockCategory = {
  id: 1,
  name: 'Test Category',
} as CategoryEntity;

const mockGroup = {
  id: 1,
  name: 'Test Group',
} as GroupEntity;

const createEventDto: CreateEventDto = {
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  group: mockGroup.id,
  type: 'in_person',
  location: 'Test Location',
  locationOnline: 'Test Location Online',
  maxAttendees: 100,
  categories: [mockCategory],
  lat: 0,
  lon: 0,
  is_public: true,
};

const mockEvent: Partial<EventEntity> = {
  id: 1,
  ...createEventDto,
  user: mockUser,
  group: mockGroup,
};

describe('EventController', () => {
  let controller: EventController;
  let service: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventController],
      providers: [
        {
          provide: EventService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    service = module.get<EventService>(EventService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new event with all the data', async () => {
      jest.spyOn(service, 'create').mockResolvedValue(mockEvent as EventEntity);

      const result = await controller.create(createEventDto, {
        user: mockUser,
      } as unknown as Request);

      expect(result).toEqual(mockEvent);
      expect(service.create).toHaveBeenCalledWith(createEventDto, mockUser.id);
    });

    it('should handle service errors', async () => {
      jest
        .spyOn(service, 'create')
        .mockRejectedValue(new Error('Database error'));
      await expect(
        controller.create(createEventDto, {
          user: mockUser,
        } as unknown as Request),
      ).rejects.toThrow('Database error');
    });
  });

  describe('findAll', () => {
    it('should return an array of events', async () => {
      const events = [mockEvent, { ...mockEvent, id: 2 }];
      jest.spyOn(service, 'findAll').mockResolvedValue(events as EventEntity[]);
      const result = await controller.findAll();
      expect(result).toEqual(events);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single event', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockEvent as EventEntity);
      const result = await controller.findOne(1);
      expect(result).toEqual(mockEvent);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw an error if event is not found', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockRejectedValue(new Error('Event not found'));
      await expect(controller.findOne(999)).rejects.toThrow('Event not found');
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ ...mockEvent, ...updateEventDto } as EventEntity);
      const result = await controller.update(1, updateEventDto, {
        user: mockUser,
      } as unknown as Request);
      expect(result).toEqual({ ...mockEvent, ...updateEventDto });
      expect(service.update).toHaveBeenCalledWith(
        1,
        updateEventDto,
        mockUser.id,
      );
    });

    it('should handle service errors during update', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(service, 'update')
        .mockRejectedValue(new Error('Update failed'));
      await expect(
        controller.update(1, updateEventDto, {
          user: mockUser,
        } as unknown as Request),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('delete', () => {
    it('should delete an event', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue(undefined);
      const result = await controller.remove(mockEvent.id as number);
      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(mockEvent.id);
    });
  });
});
