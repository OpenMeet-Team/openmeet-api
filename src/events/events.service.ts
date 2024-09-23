import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/events.entity';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(EventEntity)
    private eventRepository: Repository<EventEntity>,
  ) {}

  async create(createEventDto: CreateEventDto): Promise<EventEntity> {
    const event = this.eventRepository.create(createEventDto);
    return this.eventRepository.save(event);
  }

  async findAll(): Promise<EventEntity[]> {
    return this.eventRepository.find({
      relations: ['user'], 
    });
  }

  async findOne(id: number): Promise<EventEntity> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    return event;
  }


  async update(id: number, updateEventDto: UpdateEventDto): Promise<EventEntity> {
    const event = await this.findOne(id); 

    const updatedEvent = this.eventRepository.merge(event, updateEventDto);
    return this.eventRepository.save(updatedEvent);
  }


  async remove(id: number): Promise<void> {
    const event = await this.findOne(id); 
    await this.eventRepository.remove(event);
  }
}
