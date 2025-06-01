import { Injectable, Scope } from '@nestjs/common';
import { Repository, FindOptionsWhere } from 'typeorm';
import { ExternalEventEntity } from '../entities/external-event.entity';
import { TenantConnectionService } from '../../../../../tenant/tenant.service';

@Injectable({ scope: Scope.REQUEST })
export class ExternalEventRepository {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getRepository(
    tenantId: string,
  ): Promise<Repository<ExternalEventEntity>> {
    const connection =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    return connection.getRepository(ExternalEventEntity);
  }

  async create(
    tenantId: string,
    externalEvent: Partial<ExternalEventEntity>,
  ): Promise<ExternalEventEntity> {
    const repository = await this.getRepository(tenantId);
    return repository.save(repository.create(externalEvent));
  }

  async createMany(
    tenantId: string,
    externalEvents: Partial<ExternalEventEntity>[],
  ): Promise<ExternalEventEntity[]> {
    const repository = await this.getRepository(tenantId);
    return repository.save(repository.create(externalEvents));
  }

  async findManyByCalendarSource(
    tenantId: string,
    calendarSourceId: number,
    options?: {
      startTime?: Date;
      endTime?: Date;
    },
  ): Promise<ExternalEventEntity[]> {
    const repository = await this.getRepository(tenantId);
    const queryBuilder = repository
      .createQueryBuilder('externalEvent')
      .where('externalEvent.calendarSourceId = :calendarSourceId', {
        calendarSourceId,
      });

    if (options?.startTime) {
      queryBuilder.andWhere('externalEvent.startTime >= :startTime', {
        startTime: options.startTime,
      });
    }

    if (options?.endTime) {
      queryBuilder.andWhere('externalEvent.endTime <= :endTime', {
        endTime: options.endTime,
      });
    }

    return queryBuilder.orderBy('externalEvent.startTime', 'ASC').getMany();
  }

  async deleteByCalendarSource(
    tenantId: string,
    calendarSourceId: number,
  ): Promise<void> {
    const repository = await this.getRepository(tenantId);
    await repository.delete({ calendarSourceId });
  }

  async deleteByCalendarSourceAndExternalIds(
    tenantId: string,
    calendarSourceId: number,
    externalIds: string[],
  ): Promise<void> {
    if (externalIds.length === 0) return;

    const repository = await this.getRepository(tenantId);
    await repository
      .createQueryBuilder()
      .delete()
      .where('calendarSourceId = :calendarSourceId', { calendarSourceId })
      .andWhere('externalId IN (:...externalIds)', { externalIds })
      .execute();
  }

  async upsertMany(
    tenantId: string,
    calendarSourceId: number,
    externalEvents: Partial<ExternalEventEntity>[],
  ): Promise<void> {
    if (externalEvents.length === 0) return;

    const repository = await this.getRepository(tenantId);

    // Use PostgreSQL's ON CONFLICT DO UPDATE for efficient upserts
    const values = externalEvents.map((event) => ({
      externalId: event.externalId,
      summary: event.summary,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      status: event.status,
      location: event.location,
      description: event.description,
      calendarSourceId,
    }));

    await repository
      .createQueryBuilder()
      .insert()
      .into(ExternalEventEntity)
      .values(values as any) // Cast to any to avoid TypeORM's complex type inference
      .orUpdate([
        'summary',
        'startTime',
        'endTime',
        'isAllDay',
        'status',
        'location',
        'description',
        'updatedAt',
      ])
      .updateEntity(false)
      .execute();
  }

  async findByExternalId(
    tenantId: string,
    calendarSourceId: number,
    externalId: string,
  ): Promise<ExternalEventEntity | null> {
    const repository = await this.getRepository(tenantId);
    return repository.findOne({
      where: {
        calendarSourceId,
        externalId,
      } as FindOptionsWhere<ExternalEventEntity>,
    });
  }

  async findByCalendarSourceAndTimeRange(
    tenantId: string,
    calendarSourceId: number,
    startTime: Date,
    endTime: Date,
  ): Promise<ExternalEventEntity[]> {
    const repository = await this.getRepository(tenantId);
    
    // Find events that overlap with the given time range
    // An event overlaps if: event.startTime < endTime AND event.endTime > startTime
    return repository
      .createQueryBuilder('externalEvent')
      .where('externalEvent.calendarSourceId = :calendarSourceId', {
        calendarSourceId,
      })
      .andWhere('externalEvent.startTime < :endTime', { endTime })
      .andWhere('externalEvent.endTime > :startTime', { startTime })
      .orderBy('externalEvent.startTime', 'ASC')
      .getMany();
  }
}
