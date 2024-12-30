import { ZulipService } from '../zulip/zulip.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);
  constructor(private readonly zulipService: ZulipService) {}

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
    if (params.zulipChannelId) {
      this.zulipService.deleteChannel(params.zulipChannelId);
    }
  }
}
