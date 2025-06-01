import {
  Injectable,
  Scope,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';

import { TenantConnectionService } from '../tenant/tenant.service';
import { CalendarSourceEntity } from './infrastructure/persistence/relational/entities/calendar-source.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import {
  CreateCalendarSourceDto,
  CalendarSourceType,
} from './dto/create-calendar-source.dto';
import { UpdateCalendarSourceDto } from './dto/update-calendar-source.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable({ scope: Scope.REQUEST })
export class CalendarSourceService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getRepository(
    tenantId: string,
  ): Promise<Repository<CalendarSourceEntity>> {
    const connection =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    return connection.getRepository(CalendarSourceEntity);
  }

  async create(
    createCalendarSourceDto: CreateCalendarSourceDto,
    user: UserEntity,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    this.validateCreateDto(createCalendarSourceDto);

    const repository = await this.getRepository(tenantId);

    const calendarSource = repository.create({
      ulid: ulid(),
      userId: user.id,
      user,
      type: createCalendarSourceDto.type,
      name: createCalendarSourceDto.name,
      url: createCalendarSourceDto.url,
      accessToken: createCalendarSourceDto.accessToken,
      refreshToken: createCalendarSourceDto.refreshToken,
      expiresAt: createCalendarSourceDto.expiresAt,
      isActive: true,
      isPrivate: createCalendarSourceDto.isPrivate ?? false,
      syncFrequency: createCalendarSourceDto.syncFrequency ?? 60,
    });

    return repository.save(calendarSource);
  }

  async findAllByUser(
    userId: number,
    tenantId: string,
    includeInactive: boolean = false,
  ): Promise<CalendarSourceEntity[]> {
    const repository = await this.getRepository(tenantId);

    const whereCondition = includeInactive
      ? { userId }
      : { userId, isActive: true };

    return repository.find({
      where: whereCondition,
      order: { createdAt: 'ASC' },
    });
  }

  async findAllActiveSources(
    tenantId: string,
  ): Promise<CalendarSourceEntity[]> {
    const repository = await this.getRepository(tenantId);

    return repository.find({
      where: { isActive: true },
      relations: ['user'],
      order: { lastSyncedAt: 'ASC' }, // Prioritize sources that haven't been synced recently
    });
  }

  async findOne(id: number, tenantId: string): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await repository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!calendarSource) {
      throw new NotFoundException(`Calendar source with ID ${id} not found`);
    }

    return calendarSource;
  }

  async findByUlid(
    ulid: string,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await repository.findOne({
      where: { ulid },
      relations: ['user'],
    });

    if (!calendarSource) {
      throw new NotFoundException(
        `Calendar source with ULID ${ulid} not found`,
      );
    }

    return calendarSource;
  }

  async update(
    id: number,
    updateCalendarSourceDto: UpdateCalendarSourceDto,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findOne(id, tenantId);

    Object.assign(calendarSource, updateCalendarSourceDto);

    return repository.save(calendarSource);
  }

  async updateByUlid(
    ulid: string,
    updateCalendarSourceDto: UpdateCalendarSourceDto,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findByUlid(ulid, tenantId);

    Object.assign(calendarSource, updateCalendarSourceDto);

    return repository.save(calendarSource);
  }

  async remove(id: number, tenantId: string): Promise<void> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findOne(id, tenantId);

    await repository.remove(calendarSource);
  }

  async validateOwnership(
    calendarSourceId: number,
    userId: number,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const calendarSource = await this.findOne(calendarSourceId, tenantId);

    if (calendarSource.userId !== userId) {
      throw new ForbiddenException(
        'You can only access your own calendar sources',
      );
    }

    return calendarSource;
  }

  async refreshToken(
    id: number,
    refreshTokenDto: RefreshTokenDto,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findOne(id, tenantId);

    if (calendarSource.type === CalendarSourceType.ICAL) {
      throw new BadRequestException('Cannot refresh tokens for iCal sources');
    }

    calendarSource.accessToken = refreshTokenDto.accessToken;
    if (refreshTokenDto.refreshToken) {
      calendarSource.refreshToken = refreshTokenDto.refreshToken;
    }
    if (refreshTokenDto.expiresAt) {
      calendarSource.expiresAt = refreshTokenDto.expiresAt;
    }

    return repository.save(calendarSource);
  }

  async updateSyncStatus(
    id: number,
    lastSyncedAt: Date,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findOne(id, tenantId);
    calendarSource.lastSyncedAt = lastSyncedAt;

    return repository.save(calendarSource);
  }

  async updateSyncStatusByUlid(
    ulid: string,
    lastSyncedAt: Date,
    tenantId: string,
  ): Promise<CalendarSourceEntity> {
    const repository = await this.getRepository(tenantId);

    const calendarSource = await this.findByUlid(ulid, tenantId);
    calendarSource.lastSyncedAt = lastSyncedAt;

    return repository.save(calendarSource);
  }

  private validateCreateDto(dto: CreateCalendarSourceDto): void {
    if (dto.type === CalendarSourceType.ICAL) {
      if (!dto.url) {
        throw new BadRequestException('URL is required for iCal sources');
      }
      // Basic URL validation
      try {
        new URL(dto.url);
      } catch {
        throw new BadRequestException('Invalid URL format for iCal source');
      }
    } else {
      // OAuth sources require access token
      if (!dto.accessToken) {
        throw new BadRequestException(
          'Access token is required for OAuth sources',
        );
      }
    }
  }
}
