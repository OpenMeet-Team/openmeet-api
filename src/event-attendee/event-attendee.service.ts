import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';
import { DeepPartial } from 'typeorm';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventAttendeeService {
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  async attendEvent(
    createEventAttendeeDto: CreateEventAttendeeDto,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    // Use primitive number type instead of Number object
    const event = { id: createEventAttendeeDto.eventId };
    const user = { id: createEventAttendeeDto.userId };

    // Create a mapped DTO with the correct types
    const mappedDto: DeepPartial<EventAttendeesEntity> = {
      rsvpStatus: createEventAttendeeDto.rsvpStatus,
      isHost: createEventAttendeeDto.isHost,
      event, // Attach the event object
      user, // Attach the user object
    };

    try {
      const attendee = this.eventAttendeesRepository.create(mappedDto);
      return await this.eventAttendeesRepository.save(attendee);
    } catch (error) {
      // Handle database save errors
      throw new Error('Failed to save attendee: ' + error.message);
    }
  }

  async leaveEvent(
    userId: number,
    eventId: number,
  ): Promise<{ message: string }> {
    await this.getTenantSpecificEventRepository();

    const attendee = await this.eventAttendeesRepository.findOne({
      where: { user: { id: userId }, event: { id: eventId } }, // Use the correct object structure
    });

    if (!attendee) {
      throw new NotFoundException('User is not an attendee of this event');
    }

    try {
      await this.eventAttendeesRepository.remove(attendee);
    } catch (error) {
      throw new Error('Failed to remove attendee: ' + error.message);
    }

    return { message: 'User has successfully left the event' };
  }
}
