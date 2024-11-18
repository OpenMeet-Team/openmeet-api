import { ZulipService } from '../zulip/zulip.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';

@Injectable()
export class ChannelCreatedListener {
  constructor(private readonly zulipService: ZulipService) {}
  @OnEvent('event.created')
  handleUserCreatedEvent(params: EventEntity) {
    // TODO: push analytics event
    console.log('event.created', params.id);
    try {
      // const response = await this.zulipService.createZulipChannel(params);
      // console.log(
      //   '🚀 ~ ChannelCreatedListener ~ handleUserCreatedEvent ~ response:',
      //   response,
      // );
      // if (response.result === 'success') {
      // To subscribe another user to a channel, you may pass in
      // the `principals` parameter, like so:
      //   const anotherUserParams = {
      //     subscriptions: JSON.stringify([{ name: params.name }]),
      //     principals: JSON.stringify([params.userId]),
      //   };
      //   console.log(await client.users.me.subscriptions.add(anotherUserParams));
      // }
    } catch (error) {
      console.error('Failed to create channel:', error);
      throw new NotFoundException('Failed to create channel');
    }
  }
}
