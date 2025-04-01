import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventSeriesEntity } from '../entities/event-series.entity';
import { EventSeriesRepository } from '../../../../interfaces/event-series-repository.interface';

@Injectable()
export class EventSeriesTypeOrmRepository implements EventSeriesRepository {
  constructor(
    @InjectRepository(EventSeriesEntity)
    private readonly repository: Repository<EventSeriesEntity>,
  ) {}

  async findById(id: number): Promise<EventSeriesEntity | undefined> {
    const result = await this.repository.findOne({
      where: { id },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findBySlug(slug: string): Promise<EventSeriesEntity | undefined> {
    const result = await this.repository.findOne({
      where: { slug },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findByUlid(ulid: string): Promise<EventSeriesEntity | undefined> {
    const result = await this.repository.findOne({
      where: { ulid },
      relations: ['user', 'group', 'image'],
    });
    return result ?? undefined;
  }

  async findByUser(
    userId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventSeriesEntity[], number]> {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await this.repository.findAndCount({
      where: { user: { id: userId } },
      relations: ['user', 'group', 'image'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return [data, total];
  }

  async findByGroup(
    groupId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventSeriesEntity[], number]> {
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
    const newEventSeries = this.repository.create(eventSeries);
    return this.repository.save(newEventSeries);
  }

  async update(
    id: number,
    eventSeries: Partial<EventSeriesEntity>,
  ): Promise<EventSeriesEntity> {
    await this.repository.update(id, eventSeries as any);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Event series with id ${id} not found after update`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}
