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
    return this.repository.findOne({
      where: { id },
      relations: ['user', 'group', 'image'],
    });
  }

  async findBySlug(slug: string): Promise<EventSeriesEntity | undefined> {
    return this.repository.findOne({
      where: { slug },
      relations: ['user', 'group', 'image'],
    });
  }

  async findByUlid(ulid: string): Promise<EventSeriesEntity | undefined> {
    return this.repository.findOne({
      where: { ulid },
      relations: ['user', 'group', 'image'],
    });
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
    await this.repository.update(id, eventSeries);
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}