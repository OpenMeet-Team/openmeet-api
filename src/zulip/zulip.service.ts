import { Injectable } from '@nestjs/common';
import { initializeZulipClient } from '../utils/zulip-client';

@Injectable()
export class ZulipService {
  constructor() {}

  async CreateZulipUser(event: any) {
    const client = await initializeZulipClient();
    return await client.users.create(event);
  }

  async CreateZulipChannel(params: any) {
    const client = await initializeZulipClient();
    const meParams = {
      subscriptions: JSON.stringify([{ name: params.name }]),
    };
    return await client.users.me.subscriptions.add(meParams);
  }

  async PostZulipComment(params: any) {
    const client = await initializeZulipClient();
    return await client.messages.send(params);
  }

  async EditZulipMessage(messageId: number, content: string) {
    const client = await initializeZulipClient();
    return await client.messages.update({
      message_id: messageId,
      content: content,
    });
  }

  async DeleteZulipMessage(messageId: number) {
    const client = await initializeZulipClient();
    return await client.messages.delete({
      message_id: messageId,
    });
  }

  async GetZulipTopics(streamName: string) {
    const client = await initializeZulipClient();
    const streamResponse = await client.streams.retrieve();
    const stream = streamResponse.streams.find((s) => s.name === streamName);

    if (!stream) {
      throw new Error(`Stream with name "${streamName}" not found.`);
    }

    const topicsResponse = await client.streams.topics.retrieve({
      stream_id: stream.stream_id,
    });

    const topics = topicsResponse.topics;
    const topicsWithMessages: any = [];

    for (const topic of topics) {
      const messagesResponse = await client.messages.retrieve({
        narrow: [
          { operator: 'stream', operand: streamName },
          { operator: 'topic', operand: topic.name },
        ],
        anchor: 'newest',
        num_before: 100,
        num_after: 0,
      });

      topicsWithMessages.push({
        topic: topic.name,
        messages: messagesResponse.messages,
      });
    }

    return topicsWithMessages;
  }
}
