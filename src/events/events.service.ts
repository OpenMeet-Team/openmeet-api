import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../categories/categories.service';
import { QueryEventDto } from './dto/query-events.dto';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async create(
    createEventDto: CreateEventDto,
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const user = { id: userId };
    const group = createEventDto.group ? { id: createEventDto.group } : null;
    const categories = await this.categoryService.findByIds(
      createEventDto.categories,
    );

    const mappedDto = {
      ...createEventDto,
      user,
      group,
      categories,
    };
    const event = this.eventRepository.create(mappedDto);
    return this.eventRepository.save(event);
  }

  async findAll(query: QueryEventDto): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const { page, limit } = query;
  const eventQuery = this.eventRepository.createQueryBuilder('event')
    .leftJoinAndSelect('event.user', 'user')
    .where('event.status = :status', { status: 'published' });

  const total = await eventQuery.getCount();

  const results = await eventQuery
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return {
    data: results,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
  }

  async findOne(id: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    return event;
  }

  async update(
    id: number,
    updateEventDto: UpdateEventDto,
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    const group = updateEventDto.group ? { id: updateEventDto.group } : null;
    const user = { id: userId };

    const mappedDto: any = {
      ...updateEventDto,
      user,
      group,
    };

    if (updateEventDto.categories && updateEventDto.categories.length) {
      const categories = await this.categoryService.findByIds(
        updateEventDto.categories,
      );
      mappedDto.categories = categories;
    }
    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    return this.eventRepository.save(updatedEvent);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
  }
}
