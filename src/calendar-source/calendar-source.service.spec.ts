import { Test, TestingModule } from '@nestjs/testing';
import { CalendarSourceService } from './calendar-source.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { CalendarSourceEntity } from './infrastructure/persistence/relational/entities/calendar-source.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { CalendarSourceType } from './dto/create-calendar-source.dto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('CalendarSourceService', () => {
  let service: CalendarSourceService;
  let mockRepository: jest.Mocked<Repository<CalendarSourceEntity>>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;

  const createMockCalendarSource = (
    overrides: Partial<CalendarSourceEntity> = {},
  ): CalendarSourceEntity => {
    const entity = new CalendarSourceEntity();
    entity.id = 1;
    entity.ulid = 'cal_test_ulid';
    entity.userId = 1;
    entity.user = { id: 1, slug: 'test-user' } as UserEntity;
    entity.type = CalendarSourceType.GOOGLE;
    entity.name = 'Work Calendar';
    entity.url = undefined;
    entity.accessToken = 'encrypted_token';
    entity.refreshToken = 'encrypted_refresh';
    entity.expiresAt = new Date(Date.now() + 3600000);
    entity.isActive = true;
    entity.isPrivate = false;
    entity.syncFrequency = 60;
    entity.lastSyncedAt = undefined;
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    return Object.assign(entity, overrides);
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
    };

    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      create: jest.fn(),
    } as any;

    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSourceService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = await module.resolve<CalendarSourceService>(
      CalendarSourceService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      type: CalendarSourceType.GOOGLE,
      name: 'Work Calendar',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should create calendar source with required fields', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const mockSource = createMockCalendarSource();
      mockRepository.create.mockReturnValue(mockSource);
      mockRepository.save.mockResolvedValue(mockSource);

      const result = await service.create(createDto, user, 'tenant-1');

      expect(mockRepository.create).toHaveBeenCalledWith({
        ulid: expect.any(String),
        userId: user.id,
        user,
        type: createDto.type,
        name: createDto.name,
        accessToken: createDto.accessToken,
        refreshToken: createDto.refreshToken,
        expiresAt: createDto.expiresAt,
        isActive: true,
        isPrivate: false,
        syncFrequency: 60,
      });
      expect(result).toBe(mockSource);
    });

    it('should allow multiple calendar sources per user', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const existingSources = [
        createMockCalendarSource({
          type: CalendarSourceType.GOOGLE,
          name: 'Work Calendar',
        }),
        createMockCalendarSource({
          type: CalendarSourceType.APPLE,
          name: 'Personal Calendar',
        }),
      ];

      mockRepository.find.mockResolvedValue(existingSources);
      const newSource = createMockCalendarSource({
        type: CalendarSourceType.OUTLOOK,
        name: 'Team Calendar',
      });
      mockRepository.create.mockReturnValue(newSource);
      mockRepository.save.mockResolvedValue(newSource);

      const outlookDto = {
        ...createDto,
        type: CalendarSourceType.OUTLOOK,
        name: 'Team Calendar',
      };
      const result = await service.create(outlookDto, user, 'tenant-1');

      expect(result.type).toBe(CalendarSourceType.OUTLOOK);
      expect(result.name).toBe('Team Calendar');
    });

    it('should handle iCal URL sources without OAuth tokens', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const icalDto = {
        type: CalendarSourceType.ICAL,
        name: 'Team Calendar',
        url: 'https://calendar.example.com/team.ics',
      };

      const icalSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
        url: icalDto.url,
        accessToken: undefined,
        refreshToken: undefined,
        expiresAt: undefined,
      });

      mockRepository.create.mockReturnValue(icalSource);
      mockRepository.save.mockResolvedValue(icalSource);

      const result = await service.create(icalDto, user, 'tenant-1');

      expect(result.url).toBe(icalDto.url);
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
    });

    it('should validate iCal URL format', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const invalidDto = {
        type: CalendarSourceType.ICAL,
        name: 'Invalid Calendar',
        url: 'not-a-valid-url',
      };

      await expect(
        service.create(invalidDto, user, 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require URL for iCal sources', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const invalidDto = {
        type: CalendarSourceType.ICAL,
        name: 'Missing URL Calendar',
      };

      await expect(
        service.create(invalidDto, user, 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require OAuth tokens for OAuth sources', async () => {
      const user = { id: 1, slug: 'test-user' } as UserEntity;
      const invalidDto = {
        type: CalendarSourceType.GOOGLE,
        name: 'Missing Tokens Calendar',
      };

      await expect(
        service.create(invalidDto, user, 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllByUser', () => {
    it('should return all active calendar sources for user', async () => {
      const userId = 1;
      const sources = [
        createMockCalendarSource({
          type: CalendarSourceType.GOOGLE,
          name: 'Work',
        }),
        createMockCalendarSource({
          type: CalendarSourceType.APPLE,
          name: 'Personal',
        }),
      ];

      mockRepository.find.mockResolvedValue(sources);

      const result = await service.findAllByUser(userId, 'tenant-1');

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        order: { createdAt: 'ASC' },
      });
      expect(result).toBe(sources);
    });

    it('should include inactive sources when requested', async () => {
      const userId = 1;
      const allSources = [
        createMockCalendarSource({ isActive: true }),
        createMockCalendarSource({ isActive: false }),
      ];

      mockRepository.find.mockResolvedValue(allSources);

      const result = await service.findAllByUser(userId, 'tenant-1', true);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      expect(result).toBe(allSources);
    });
  });

  describe('findOne', () => {
    it('should return calendar source by id', async () => {
      const sourceId = 1;
      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);

      const result = await service.findOne(sourceId, 'tenant-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: sourceId },
        relations: ['user'],
      });
      expect(result).toBe(mockSource);
    });

    it('should throw NotFoundException when source not found', async () => {
      const sourceId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(sourceId, 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update calendar source', async () => {
      const sourceId = 1;
      const updateDto = {
        name: 'Updated Calendar',
        isPrivate: true,
        syncFrequency: 30,
      };

      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);
      const updatedSource = createMockCalendarSource({ ...updateDto });
      mockRepository.save.mockResolvedValue(updatedSource);

      const result = await service.update(sourceId, updateDto, 'tenant-1');

      expect(result.name).toBe(updateDto.name);
      expect(result.isPrivate).toBe(updateDto.isPrivate);
      expect(result.syncFrequency).toBe(updateDto.syncFrequency);
    });

    it('should throw NotFoundException when updating non-existent source', async () => {
      const sourceId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(sourceId, { name: 'Updated' }, 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete calendar source', async () => {
      const sourceId = 1;
      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);
      mockRepository.remove.mockResolvedValue(mockSource);

      await service.remove(sourceId, 'tenant-1');

      expect(mockRepository.remove).toHaveBeenCalledWith(mockSource);
    });

    it('should throw NotFoundException when deleting non-existent source', async () => {
      const sourceId = 999;
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(sourceId, 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateOwnership', () => {
    it('should allow user to access their own calendar source', async () => {
      const userId = 1;
      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);

      const result = await service.validateOwnership(1, userId, 'tenant-1');

      expect(result).toBe(mockSource);
    });

    it('should prevent unauthorized access to other users calendar sources', async () => {
      const unauthorizedUserId = 999;
      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);

      await expect(
        service.validateOwnership(1, unauthorizedUserId, 'tenant-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent calendar source', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.validateOwnership(999, 1, 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('refreshToken', () => {
    it('should update OAuth tokens', async () => {
      const sourceId = 1;
      const newTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 7200000), // 2 hours
      };

      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);
      const updatedSource = createMockCalendarSource({ ...newTokens });
      mockRepository.save.mockResolvedValue(updatedSource);

      const result = await service.refreshToken(
        sourceId,
        newTokens,
        'tenant-1',
      );

      expect(result.accessToken).toBe(newTokens.accessToken);
      expect(result.refreshToken).toBe(newTokens.refreshToken);
      expect(result.expiresAt).toBe(newTokens.expiresAt);
    });

    it('should throw error for iCal sources', async () => {
      const icalSource = createMockCalendarSource({
        type: CalendarSourceType.ICAL,
      });
      mockRepository.findOne.mockResolvedValue(icalSource);

      await expect(
        service.refreshToken(1, { accessToken: 'token' }, 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateSyncStatus', () => {
    it('should update last synced timestamp', async () => {
      const sourceId = 1;
      const syncTime = new Date();

      const mockSource = createMockCalendarSource();
      mockRepository.findOne.mockResolvedValue(mockSource);
      const updatedSource = createMockCalendarSource({
        lastSyncedAt: syncTime,
      });
      mockRepository.save.mockResolvedValue(updatedSource);

      const result = await service.updateSyncStatus(
        sourceId,
        syncTime,
        'tenant-1',
      );

      expect(result.lastSyncedAt).toBe(syncTime);
    });
  });
});
