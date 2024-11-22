import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getAdminClient, getClient } from './zulip-client';
import {
  ZulipApiResponse,
  ZulipChannelMessageParams,
  ZulipClient,
  ZulipCreateUserParams,
  ZulipDirectMessageParams,
  ZulipMessagesRetrieveParams,
  ZulipSubscriptionParams,
} from 'zulip-js';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { REQUEST } from '@nestjs/core';
import { ulid } from 'ulid';
import { UserService } from '../user/user.service';

@Injectable()
export class ZulipService {
  [x: string]: any;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
  ) {}

  async getInitialisedClient(user: UserEntity): Promise<ZulipClient> {
    if (!user.zulipUserId) {
      // Generate a unique email and password for the new Zulip user
      const userEmail = `tenant_${this.request.tenantId}__${user.ulid}@zulip.openmeet.net`;
      const userPassword = ulid();

      await this.createUser({
        email: userEmail,
        password: userPassword,
        full_name: user.name as string,
      }).then((createUserResponse) => {
        if (createUserResponse?.result !== 'success') {
          throw new Error('Failed to create Zulip user');
        }
      });

      // Fetch the API key for the newly created user
      const apiKeyResponse = await this.fetchApiKey(userEmail, userPassword);

      if (apiKeyResponse.result !== 'success') {
        throw new Error('Failed to fetch API key for new Zulip user');
      }

      // Store the Zulip credentials in your user service
      const updatedUser = await this.userService.addZulipCredentialsToUser(
        user.id,
        {
          zulipUsername: userEmail,
          zulipApiKey: apiKeyResponse.api_key,
          zulipUserId: apiKeyResponse.user_id,
        },
      );

      if (!updatedUser) {
        throw new NotFoundException('Failed to update user');
      }

      return await getClient(updatedUser);
    }

    return await getClient(user);
  }

  async getUserStreams(user: UserEntity) {
    const client = await getClient(user);
    return await client.streams.retrieve();
  }

  async getUserStreamId(user: UserEntity, streamName: string) {
    const client = await getClient(user);
    return await client.streams.getStreamId(streamName);
  }

  async getAdminUsers() {
    const client = await getAdminClient();
    return await client.users.retrieve();
  }

  async getUserMessages(user: UserEntity, query: ZulipMessagesRetrieveParams) {
    const client = await getClient(user);
    return await client.messages.retrieve(query);
  }

  async getUserProfile(user: UserEntity) {
    const client = await getClient(user);
    return await client.users.me.getProfile();
  }

  async getUserStreamTopics(user: UserEntity, streamId: number) {
    const client = await getClient(user);
    return await client.streams.topics.retrieve({ stream_id: streamId });
  }

  async getAdminSettings() {
    const client = await getAdminClient();
    return await client.server.settings();
  }

  async fetchApiKey(username: string, password: string) {
    const client = await getAdminClient();
    return (await client.callEndpoint('fetch_api_key', 'POST', {
      username,
      password,
    })) as ZulipApiResponse<{
      api_key: string;
      email: string;
      user_id: number;
    }>;
  }

  async updateUserSettings(user: UserEntity, params) {
    const client = await getClient(user);
    return (await client.callEndpoint(`settings`, 'PATCH', {
      full_name: params.full_name,
    })) as ZulipApiResponse<{
      user_id: number;
    }>;
  }

  async createUser(params: ZulipCreateUserParams) {
    const client = await getAdminClient();
    return await client.users.create(params);
  }

  async sendUserMessage(
    user: UserEntity,
    params: ZulipDirectMessageParams | ZulipChannelMessageParams,
  ) {
    const client = await getClient(user);
    return await client.messages.send(params);
  }

  async subscribeUserToChannel(
    user: UserEntity,
    params: ZulipSubscriptionParams,
  ) {
    const client = await getClient(user);
    return await client.users.me.subscriptions.add(params);
  }

  async getAdminMessages(query: ZulipMessagesRetrieveParams) {
    const client = await getAdminClient();
    return await client.messages.retrieve(query);
  }

  async getAdminStreamTopics(streamId: number) {
    const client = await getAdminClient();
    return await client.streams.topics.retrieve({ stream_id: streamId });
  }

  // Test the rest of the functions

  async updateUserMessage(
    user: UserEntity,
    messageId: number,
    content: string,
  ) {
    const client = await getClient(user);
    return await client.messages.update({
      message_id: messageId,
      content: content,
    });
  }

  async deleteUserMessage(user: UserEntity, messageId: number) {
    const client = await getClient(user);
    return await client.messages.deleteById({
      message_id: messageId,
    });
  }

  async addUserMessagesReadFlag(user: UserEntity, messageIds: number[]) {
    const client = await getClient(user);
    return await client.messages.flags.add({
      messages: messageIds,
      flag: 'read',
    });
  }

  async removeUserMessagesReadFlag(user: UserEntity, messageIds: number[]) {
    const client = await getClient(user);
    return await client.messages.flags.remove({
      messages: messageIds,
      flag: 'read',
    });
  }

  // async getZulipTopics(user: UserEntity, streamName: string) {
  //   const client = await getClient(user);
  //   const streamResponse = await client.streams.retrieve();
  //   console.log(streamResponse);
  //   console.log(streamName);
  //   console.log(await client.streams.getStreamId(streamName));
  //   // const stream = streamResponse.streams.find((s) => s.name === streamName);

  //   // if (!stream) {
  //   //   throw new Error(`Stream with name "${streamName}" not found.`);
  //   // }

  //   // const topicsResponse = await client.streams.topics.retrieve({
  //   //   stream_id: stream.stream_id,
  //   // });

  //   // const topics = topicsResponse.topics;
  //   // const topicsWithMessages = [];

  //   // for (const topic of topics) {
  //   //   const messagesResponse = await client.messages.retrieve({
  //   //     narrow: [
  //   //       { operator: 'stream', operand: streamName },
  //   //       { operator: 'topic', operand: topic.name },
  //   //     ],
  //   //     anchor: 'newest',
  //   //     num_before: 100,
  //   //     num_after: 0,
  //   //   });

  //   //   topicsWithMessages.push({
  //   //     topic: topic.name,
  //   //     messages: messagesResponse.messages,
  //   //   });
  //   // }

  // return topicsWithMessages;
  // }

  // async getStreamTopicsWithMessages(streamName: string) {
  //   try {
  //     const client = await getZulipClient();
  //     const streams = await this.getStreams();
  //     const stream = streams.data?.find((s) => s.name === streamName);

  //     if (!stream) {
  //       throw new Error(`Stream "${streamName}" not found`);
  //     }

  //     const topics = await this.getTopics(stream.stream_id);
  //     const topicsWithMessages = await Promise.all(
  //       topics.data?.map(async (topic) => {
  //         const messages = await this.getMessages({
  //           narrow: [
  //             { operator: 'stream', operand: streamName },
  //             { operator: 'topic', operand: topic.name },
  //           ],
  //           anchor: 'newest',
  //           num_before: 100,
  //           num_after: 0,
  //         });

  //         return {
  //           name: topic.name,
  //           messages: messages.data || [],
  //         };
  //       }) || [],
  //     );

  //     return topicsWithMessages;
  //   } catch (error) {
  //     console.error(
  //       `Failed to retrieve topics with messages: ${error.message}`,
  //     );
  //   }
  // }
}
