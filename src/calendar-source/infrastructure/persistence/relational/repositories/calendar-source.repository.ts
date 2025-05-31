import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CalendarSourceEntity } from '../entities/calendar-source.entity';
import { CalendarSourceType } from '../../../../enums/calendar-source-type.enum';
import { PaginationDto } from '../../../../../utils/dto/pagination.dto';
import { QueryCalendarSourceDto } from '../../../../dto/query-calendar-source.dto';

@Injectable()
export class CalendarSourceRelationalRepository {
  constructor(
    @InjectRepository(CalendarSourceEntity)
    private readonly calendarSourceRepository: Repository<CalendarSourceEntity>,
  ) {}

  async create(
    calendarSource: Partial<CalendarSourceEntity>,
  ): Promise<CalendarSourceEntity> {
    return this.calendarSourceRepository.save(
      this.calendarSourceRepository.create(calendarSource),
    );
  }

  async findAll(
    pagination: PaginationDto,
    query: QueryCalendarSourceDto,
    userId: number,
  ): Promise<CalendarSourceEntity[]> {
    const queryBuilder = this.calendarSourceRepository
      .createQueryBuilder('calendarSource')
      .where('calendarSource.userId = :userId', { userId })
      .orderBy('calendarSource.createdAt', 'DESC');

    if (query.type) {
      queryBuilder.andWhere('calendarSource.type = :type', {
        type: query.type,
      });
    }

    if (query.isActive !== undefined) {
      queryBuilder.andWhere('calendarSource.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    if (pagination.limit) {
      queryBuilder.limit(pagination.limit);
    }

    if (pagination.page && pagination.limit) {
      queryBuilder.offset((pagination.page - 1) * pagination.limit);
    }

    return queryBuilder.getMany();
  }

  async findOne(
    id: string,
    userId: number,
  ): Promise<CalendarSourceEntity | null> {
    return this.calendarSourceRepository.findOne({
      where: { id: parseInt(id), userId },
    });
  }

  async update(
    id: string,
    updateData: Partial<CalendarSourceEntity>,
    userId: number,
  ): Promise<CalendarSourceEntity> {
    // Only include fields that can be updated via TypeORM update
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user, ...updateFields } = updateData;

    await this.calendarSourceRepository.update(
      { id: parseInt(id), userId },
      updateFields,
    );

    const updated = await this.findOne(id, userId);
    if (!updated) {
      throw new Error('Calendar source not found after update');
    }

    return updated;
  }

  async remove(id: string, userId: number): Promise<void> {
    await this.calendarSourceRepository.delete({ id: parseInt(id), userId });
  }

  async findByType(
    type: CalendarSourceType,
    userId: number,
  ): Promise<CalendarSourceEntity[]> {
    return this.calendarSourceRepository.find({
      where: {
        type: type as any, // TypeORM enum handling
        userId,
      },
    });
  }

  async findActive(userId: number): Promise<CalendarSourceEntity[]> {
    return this.calendarSourceRepository.find({
      where: { userId, isActive: true },
    });
  }
}
