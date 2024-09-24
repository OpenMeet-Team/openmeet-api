import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async create(createEventDto: CreateEventDto): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = this.eventRepository.create(createEventDto);
    return this.eventRepository.save(event);
  }

  async findAll(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      relations: ['user'],
    });
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
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);

    const updatedEvent = this.eventRepository.merge(event, updateEventDto);
    return this.eventRepository.save(updatedEvent);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
  }
}
