import { Inject, Injectable } from '@nestjs/common';
import { getAdminClient, getClient } from './zulip-client';
import { ZulipApiResponse, ZulipClient, ZulipCreateUserParams } from 'zulip-js';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { REQUEST } from '@nestjs/core';
import { ulid } from 'ulid';
import { UserService } from '../user/user.service';

@Injectable()
export class ZulipService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
  ) {}

  async getInitialisedClient(user: UserEntity): Promise<ZulipClient> {
    // console.log('tenantId', this.request.tenantId, user);
    try {
      // Attempt to get the client with existing user credentials
      return await getClient(user);
    } catch (error) {
      console.error('Error getting zulip client:', error, error.message);

      // Generate a unique email and password for the new Zulip user
      const userEmail = `tenant_${this.request.tenantId}__user_${user.ulid}@zulip.openmeet.net`;
      const userPassword = ulid();

      try {
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
        await this.userService.addZulipCredentialsToUser(user.id, {
          zulipUsername: userEmail,
          zulipApiKey: apiKeyResponse.api_key,
          zulipUserId: apiKeyResponse.user_id,
        });

        // Retry getting the client with the new credentials
        return await getClient(user);
      } catch (creationError) {
        console.error(
          'Error during user creation or API key retrieval:',
          creationError.message,
        );
        throw new Error('Unable to initialize Zulip client');
      }
    }
  }

  async getUserStreams(user: UserEntity) {
    const client = await this.getInitialisedClient(user);
    return await client.streams.retrieve();
  }

  async getUserStreamId(user: UserEntity, streamName: string) {
    const client = await getClient(user);
    return await client.streams.getStreamId(streamName);
  }

  async getUsers() {
    const client = await getAdminClient();
    return await client.users.retrieve();
  }

  async getUserMessages(user: UserEntity, query) {
    const client = await this.getInitialisedClient(user);
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

  async sendUserMessage(user: UserEntity, params) {
    const client = await getClient(user);
    return await client.messages.send(params);
  }

  // Test the rest of the functions
  async createChannel(user: UserEntity, params) {
    const client = await getClient(user);
    const meParams = {
      subscriptions: JSON.stringify([{ name: params.name }]),
    };
    return await client.users.me.subscriptions.add(meParams);
  }

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
