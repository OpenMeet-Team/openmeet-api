import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

describe('AvailabilityController', () => {
  let controller: AvailabilityController;
  let availabilityService: jest.Mocked<AvailabilityService>;

  const mockUser = new UserEntity();
  mockUser.id = 1;
  mockUser.ulid = 'user_test_ulid';
  mockUser.slug = 'testuser';
  mockUser.email = 'test@example.com';

  const mockRequest = {
    tenantId: 'test-tenant-1',
  };

  beforeEach(async () => {
    const mockAvailabilityService = {
      checkAvailability: jest.fn(),
      getConflicts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvailabilityController],
      providers: [
        {
          provide: AvailabilityService,
          useValue: mockAvailabilityService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    controller = module.get<AvailabilityController>(AvailabilityController);
    availabilityService = module.get(AvailabilityService);
  });

  describe('checkAvailability', () => {
    const mockAvailabilityDto = {
      startTime: new Date('2024-01-15T10:00:00Z'),
      endTime: new Date('2024-01-15T11:00:00Z'),
      calendarSourceIds: ['calendar_ulid_1', 'calendar_ulid_2'],
    };

    it('should return availability status with no conflicts', async () => {
      const mockAvailabilityResult = {
        available: true,
        conflicts: [],
        conflictingEvents: [],
      };

      availabilityService.checkAvailability.mockResolvedValue(mockAvailabilityResult);

      const result = await controller.checkAvailability(
        mockAvailabilityDto,
        mockUser,
      );

      expect(result).toEqual({
        available: true,
        conflicts: [],
        conflictingEvents: [],
        message: 'No conflicts found - time slot is available',
      });

      expect(availabilityService.checkAvailability).toHaveBeenCalledWith(
        mockUser.id,
        mockAvailabilityDto.startTime,
        mockAvailabilityDto.endTime,
        mockAvailabilityDto.calendarSourceIds,
        'test-tenant-1'
      );
    });

    it('should return availability status with conflicts', async () => {
      const mockConflicts = [
        {
          eventId: 'event_1',
          title: 'Existing Meeting',
          startTime: new Date('2024-01-15T10:30:00Z'),
          endTime: new Date('2024-01-15T11:30:00Z'),
          calendarSourceUlid: 'calendar_ulid_1',
        },
      ];

      const mockAvailabilityResult = {
        available: false,
        conflicts: ['calendar_ulid_1'],
        conflictingEvents: mockConflicts,
      };

      availabilityService.checkAvailability.mockResolvedValue(mockAvailabilityResult);

      const result = await controller.checkAvailability(
        mockAvailabilityDto,
        mockUser,
      );

      expect(result).toEqual({
        available: false,
        conflicts: ['calendar_ulid_1'],
        conflictingEvents: mockConflicts,
        message: 'Time slot has conflicts with existing events',
      });
    });

    it('should handle invalid time range', async () => {
      const invalidDto = {
        startTime: new Date('2024-01-15T11:00:00Z'),
        endTime: new Date('2024-01-15T10:00:00Z'), // End before start
        calendarSourceIds: ['calendar_ulid_1'],
      };

      availabilityService.checkAvailability.mockRejectedValue(
        new BadRequestException('End time must be after start time')
      );

      await expect(
        controller.checkAvailability(invalidDto, mockUser)
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle non-existent calendar sources', async () => {
      availabilityService.checkAvailability.mockRejectedValue(
        new NotFoundException('One or more calendar sources not found')
      );

      await expect(
        controller.checkAvailability(mockAvailabilityDto, mockUser)
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle empty calendar source list', async () => {
      const emptyDto = {
        ...mockAvailabilityDto,
        calendarSourceIds: [],
      };

      const mockAvailabilityResult = {
        available: true,
        conflicts: [],
        conflictingEvents: [],
      };

      availabilityService.checkAvailability.mockResolvedValue(mockAvailabilityResult);

      const result = await controller.checkAvailability(emptyDto, mockUser);

      expect(result.available).toBe(true);
      expect(availabilityService.checkAvailability).toHaveBeenCalledWith(
        mockUser.id,
        emptyDto.startTime,
        emptyDto.endTime,
        [],
        'test-tenant-1'
      );
    });
  });

  describe('getConflicts', () => {
    const mockConflictsDto = {
      startTime: new Date('2024-01-15T09:00:00Z'),
      endTime: new Date('2024-01-15T17:00:00Z'),
      calendarSourceIds: ['calendar_ulid_1', 'calendar_ulid_2'],
    };

    it('should return all conflicts for time range', async () => {
      const mockConflicts = [
        {
          eventId: 'event_1',
          title: 'Morning Meeting',
          startTime: new Date('2024-01-15T10:00:00Z'),
          endTime: new Date('2024-01-15T11:00:00Z'),
          calendarSourceUlid: 'calendar_ulid_1',
        },
        {
          eventId: 'event_2',
          title: 'Lunch Meeting',
          startTime: new Date('2024-01-15T12:00:00Z'),
          endTime: new Date('2024-01-15T13:00:00Z'),
          calendarSourceUlid: 'calendar_ulid_2',
        },
      ];

      availabilityService.getConflicts.mockResolvedValue(mockConflicts);

      const result = await controller.getConflicts(mockConflictsDto, mockUser);

      expect(result).toEqual({
        conflicts: mockConflicts,
        totalCount: 2,
        timeRange: {
          startTime: mockConflictsDto.startTime,
          endTime: mockConflictsDto.endTime,
        },
      });

      expect(availabilityService.getConflicts).toHaveBeenCalledWith(
        mockUser.id,
        mockConflictsDto.startTime,
        mockConflictsDto.endTime,
        mockConflictsDto.calendarSourceIds,
        'test-tenant-1'
      );
    });

    it('should return empty result when no conflicts found', async () => {
      availabilityService.getConflicts.mockResolvedValue([]);

      const result = await controller.getConflicts(mockConflictsDto, mockUser);

      expect(result).toEqual({
        conflicts: [],
        totalCount: 0,
        timeRange: {
          startTime: mockConflictsDto.startTime,
          endTime: mockConflictsDto.endTime,
        },
      });
    });

    it('should handle date range validation errors', async () => {
      const invalidDto = {
        startTime: new Date('2024-01-20T09:00:00Z'),
        endTime: new Date('2024-01-15T17:00:00Z'), // End before start
        calendarSourceIds: ['calendar_ulid_1'],
      };

      availabilityService.getConflicts.mockRejectedValue(
        new BadRequestException('Invalid date range')
      );

      await expect(
        controller.getConflicts(invalidDto, mockUser)
      ).rejects.toThrow(BadRequestException);
    });
  });
});