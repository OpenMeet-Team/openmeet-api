import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import zulipInit from 'zulip-js';

@Injectable()
export class ChannelCreatedListener {
  constructor() {}
  @OnEvent('channel.created')
  async handleUserCreatedEvent(params: any) {
    const config = { zuliprc: 'zuliprc-admin' };

    console.log('User created event received:', params);
    try {
      const client = await zulipInit(config);

      const meParams = {
        subscriptions: JSON.stringify([{ name: params.name }]),
      };

      const response = await client.users.me.subscriptions.add(meParams);

      if (response.result === 'success') {
        // To subscribe another user to a channel, you may pass in
        // the `principals` parameter, like so:
        const anotherUserParams = {
          subscriptions: JSON.stringify([{ name: params.name }]),
          principals: JSON.stringify([params.userId]),
        };
        console.log(await client.users.me.subscriptions.add(anotherUserParams));
      }
    } catch (error) {}
  }
}
