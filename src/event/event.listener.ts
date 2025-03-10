import { MatrixService } from '../matrix/matrix.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);
  constructor(private readonly matrixService: MatrixService) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: EventEntity) {
    // TODO: push analytics event
    this.logger.log('event.created', {
      id: params.id,
    });
  }

  @OnEvent('event.deleted')
  handleEventDeletedEvent(params: EventEntity) {
    this.logger.log('event.deleted', {
      id: params.id,
    });
    if (params.matrixRoomId) {
      // TODO: Implement room deletion in MatrixService
      // this.matrixService.deleteRoom(params.matrixRoomId);
      this.logger.log(`Matrix room ${params.matrixRoomId} should be deleted`);
    }
  }
}
