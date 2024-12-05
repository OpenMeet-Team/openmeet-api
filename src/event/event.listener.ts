import { ZulipService } from '../zulip/zulip.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';

@Injectable()
export class ChannelCreatedListener {
  constructor(private readonly zulipService: ZulipService) {}
  @OnEvent('event.created')
  handleUserCreatedEvent(params: EventEntity) {
    // TODO: push analytics event
    console.log('event.created', params.id);
  }

  @OnEvent('event.deleted')
  handleEventDeletedEvent(params: EventEntity) {
    console.log('event.deleted', params.id);
    if (params.zulipChannelId) {
      this.zulipService.deleteChannel(params.zulipChannelId);
    }
  }
}
