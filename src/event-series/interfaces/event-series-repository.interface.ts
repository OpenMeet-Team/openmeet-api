import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';

export interface EventSeriesRepository {
  findById(id: number): Promise<EventSeriesEntity | undefined>;
  findBySlug(slug: string): Promise<EventSeriesEntity | undefined>;
  findByUlid(ulid: string): Promise<EventSeriesEntity | undefined>;
  findByUser(userId: number, options?: { page: number; limit: number }): Promise<[EventSeriesEntity[], number]>;
  findByGroup(groupId: number, options?: { page: number; limit: number }): Promise<[EventSeriesEntity[], number]>;
  create(eventSeries: Partial<EventSeriesEntity>): Promise<EventSeriesEntity>;
  update(id: number, eventSeries: Partial<EventSeriesEntity>): Promise<EventSeriesEntity>;
  delete(id: number): Promise<void>;
}