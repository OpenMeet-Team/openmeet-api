import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EventSeriesEntity } from '../entities/event-series.entity';
import { EventSeriesRepository } from '../../../../interfaces/event-series-repository.interface';
import { TenantConnectionService } from '../../../../../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventSeriesTypeOrmRepository implements EventSeriesRepository {
  private repository: Repository<EventSeriesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getTenantSpecificRepository(tenantId?: string) {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    this.repository = dataSource.getRepository(EventSeriesEntity);
  }

  async findById(id: number): Promise<EventSeriesEntity | undefined> {
    await this.getTenantSpecificRepository();
    const result = await this.repository.findOne({
      where: { id },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findBySlug(slug: string): Promise<EventSeriesEntity | undefined> {
    await this.getTenantSpecificRepository();
    const result = await this.repository.findOne({
      where: { slug },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findByUlid(ulid: string): Promise<EventSeriesEntity | undefined> {
    await this.getTenantSpecificRepository();
    const result = await this.repository.findOne({
      where: { ulid },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findByUser(
    userId: number | null,
    options?: {
      page: number;
      limit: number;
      sourceType?: string;
    },
  ): Promise<[EventSeriesEntity[], number]> {
    await this.getTenantSpecificRepository();
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = {
      relations: ['user', 'group', 'image'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    };

    // Build where clause based on filters
    const whereClause: any = {};

    // If userId is provided, filter by user
    if (userId !== null) {
      whereClause.user = { id: userId };
    }

    // If sourceType is provided, filter by sourceType
    if (options?.sourceType) {
      whereClause.sourceType = options.sourceType;
    }

    // Only add where clause if we have filters
    if (Object.keys(whereClause).length > 0) {
      query.where = whereClause;
    }

    const [data, total] = await this.repository.findAndCount(query);

    return [data, total];
  }

  async findByGroup(
    groupId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventSeriesEntity[], number]> {
    await this.getTenantSpecificRepository();
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await this.repository.findAndCount({
      where: { group: { id: groupId } },
      relations: ['user', 'group', 'image'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return [data, total];
  }

  async create(
    eventSeries: Partial<EventSeriesEntity>,
  ): Promise<EventSeriesEntity> {
    await this.getTenantSpecificRepository();
    const newEventSeries = this.repository.create(eventSeries);
    return this.repository.save(newEventSeries);
  }

  async update(
    id: number,
    eventSeries: Partial<EventSeriesEntity>,
  ): Promise<EventSeriesEntity> {
    await this.getTenantSpecificRepository();
    await this.repository.update(id, eventSeries as any);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Event series with id ${id} not found after update`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.getTenantSpecificRepository();
    await this.repository.delete(id);
  }

  async save(
    eventSeries: Partial<EventSeriesEntity>,
  ): Promise<EventSeriesEntity> {
    await this.getTenantSpecificRepository();
    return this.repository.save(eventSeries);
  }
}
