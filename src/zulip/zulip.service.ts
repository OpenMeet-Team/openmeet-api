import { Inject, Injectable } from '@nestjs/common';
import { getAdminClient, getClient } from './zulip-client';
import {
  ZulipChannelMessageParams,
  ZulipClient,
  ZulipCreateUserParams,
  ZulipDirectMessageParams,
  ZulipFetchApiKeyResponse,
  ZulipMessage,
  ZulipMessagesRetrieveParams,
  ZulipSettings,
  ZulipSubscriptionParams,
  ZulipTopic,
  ZulipUpdateUserProfileParams,
  ZulipUser,
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
      //   // Generate a unique email and password for the new Zulip user
      const userEmail = `tenant_${this.request.tenantId}__${user.ulid}@zulip.openmeet.net`;
      const userPassword = ulid();

      const createdZulipUser = await this.createUser({
        email: userEmail,
        password: userPassword,
        full_name: user.name as string,
      });

      // Fetch the API key for the newly created user
      const apiKeyResponse = await this.getAdminApiKey(userEmail, userPassword);

      if (!apiKeyResponse.api_key) {
        throw new Error(
          `fetchApiKey: Failed to fetch API key for new Zulip user`,
        );
      }

      try {
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
          throw new Error(`addZulipCredentialsToUser: Failed to update user`);
        }

        return await getClient(updatedUser);
      } catch (error) {
        console.error('Error adding Zulip credentials to user:', error);
        throw error;
      }
    }

    return await getClient(user);
  }

  async getUserStreams(user: UserEntity) {
    const client = await getClient(user);
    return await client.streams.retrieve();
  }

  async getAdminStreamId(streamName: string): Promise<{ id: number }> {
    const client = await getAdminClient();
    const channelResponse = await client.streams.getStreamId(streamName);
    if (channelResponse.result === 'success') {
      return { id: channelResponse.stream_id };
    }
    throw new Error(`getAdminStreamId: ${channelResponse.msg}`);
  }

  async getAdminUsers(): Promise<ZulipUser[]> {
    const client = await getAdminClient();
    const usersResponse = await client.users.retrieve();
    if (usersResponse.result === 'success') {
      return usersResponse.users;
    }
    throw new Error(`getAdminUsers: ${usersResponse.msg}`);
  }

  async getUserMessages(
    user: UserEntity,
    query: ZulipMessagesRetrieveParams,
  ): Promise<ZulipMessage[]> {
    const client = await getClient(user);
    const messageResponse = await client.messages.retrieve(query);
    if (messageResponse.result === 'success') {
      return messageResponse.messages;
    }
    throw new Error(`getUserMessages: ${messageResponse.msg}`);
  }

  async getUserProfile(user: UserEntity): Promise<ZulipUser> {
    const client = await getClient(user);
    const profileResponse = await client.users.me.getProfile();

    if (profileResponse.result === 'success') {
      return profileResponse;
    }
    throw new Error(`getUserProfile: ${profileResponse.msg}`);
  }

  async getUserStreamTopics(
    user: UserEntity,
    streamId: number,
  ): Promise<ZulipTopic[]> {
    const client = await getClient(user);
    const topicsResponse = await client.streams.topics.retrieve({
      stream_id: streamId,
    });
    if (topicsResponse.result === 'success') {
      return topicsResponse.topics;
    }
    throw new Error(`getUserStreamTopics: ${topicsResponse.msg}`);
  }

  async getAdminSettings(): Promise<ZulipSettings> {
    const client = await getAdminClient();
    const settingsResponse = await client.server.settings();

    if (settingsResponse.result === 'success') {
      return settingsResponse;
    }
    throw new Error(`getAdminSettings: ${settingsResponse.msg}`);
  }

  async getAdminApiKey(
    username: string,
    password: string,
  ): Promise<ZulipFetchApiKeyResponse> {
    const client = await getAdminClient();
    const apiKeyResponse = await client.callEndpoint<ZulipFetchApiKeyResponse>(
      '/fetch_api_key',
      'POST',
      { username, password },
    );

    if (apiKeyResponse.result === 'success') {
      return apiKeyResponse;
    }

    throw new Error(`getAdminApiKey: ${apiKeyResponse.msg}`);
  }

  async updateUserProfile(
    user: UserEntity,
    params: ZulipUpdateUserProfileParams,
  ) {
    const client = await getClient(user);
    const settingsResponse = await client.callEndpoint(
      `users/${user.zulipUserId}`,
      'PATCH',
      params,
    );
    if (settingsResponse.result === 'success') {
      return settingsResponse;
    }
    throw new Error(`updateUserProfile: ${settingsResponse.msg}`);
  }

  async createUser(params: ZulipCreateUserParams) {
    const client = await getAdminClient();

    const response = await client.users.create(params);
    if (response.result === 'success') {
      return { id: response.id };
    }
    throw new Error(`createUser: ${response.msg}`);
  }

  async sendUserMessage(
    user: UserEntity,
    params: ZulipDirectMessageParams | ZulipChannelMessageParams,
  ): Promise<{ id: number }> {
    const client = await getClient(user);
    const message = await client.messages.send(params);

    if (message.result === 'success') {
      return { id: message.id };
    }

    throw new Error(`sendUserMessage: ${message.msg}`);
  }

  async subscribeUserToChannel(
    user: UserEntity,
    params: ZulipSubscriptionParams,
  ) {
    const client = await getClient(user);
    // const response = await client.callEndpoint(
    //   `users/me/subscriptions`,
    //   'POST',
    //   params,
    // );
    const response = await client.users.me.subscriptions.add(params);
    if (response.result === 'success') {
      return response;
    }
    throw new Error(`subscribeUserToChannel: ${response.msg}`);
  }

  async subscribeAdminToChannel(params: ZulipSubscriptionParams) {
    const client = await getAdminClient();
    const response = await client.users.me.subscriptions.add(params);
    console.log(response);
    if (response.result === 'success') {
      return response;
    }
    throw new Error(`subscribeAdminToChannel: ${response.msg}`);
  }

  async getAdminMessages(
    query: ZulipMessagesRetrieveParams,
  ): Promise<ZulipMessage[]> {
    const client = await getAdminClient();
    const messageResponse = await client.messages.retrieve(query);
    if (messageResponse.result === 'success') {
      return messageResponse.messages;
    }
    throw new Error(`getAdminMessages: ${messageResponse.msg}`);
  }

  async getAdminStreamTopics(streamId: number): Promise<ZulipTopic[]> {
    const client = await getAdminClient();
    const topicsResponse = await client.streams.topics.retrieve({
      stream_id: streamId,
    });
    if (topicsResponse.result === 'success') {
      return topicsResponse.topics;
    }
    throw new Error(`getAdminStreamTopics: ${topicsResponse.msg}`);
  }

  // Test the rest of the functions

  async updateUserMessage(
    user: UserEntity,
    messageId: number,
    content: string,
  ): Promise<{ id: number }> {
    const client = await getClient(user);
    const updateResponse = await client.messages.update({
      message_id: messageId,
      content: content,
    });
    if (updateResponse.result === 'success') {
      return { id: messageId };
    }
    throw new Error(`updateUserMessage: ${updateResponse.msg}`);
  }

  async updateAdminMessage(
    messageId: number,
    content: string,
  ): Promise<{ id: number }> {
    const client = await getAdminClient();
    const updateResponse = await client.messages.update({
      message_id: messageId,
      content: content,
    });
    if (updateResponse.result === 'success') {
      return { id: messageId };
    }
    throw new Error(`updateAdminMessage: ${updateResponse.msg}`);
  }

  async deleteUserMessage(
    user: UserEntity,
    messageId: number,
  ): Promise<{ id: number }> {
    const client = await getClient(user);
    const deleteResponse = await client.messages.deleteById({
      message_id: messageId,
    });
    if (deleteResponse.result === 'success') {
      return { id: messageId };
    }
    throw new Error(`deleteUserMessage: ${deleteResponse.msg}`);
  }

  async deleteAdminMessage(messageId: number): Promise<{ id: number }> {
    const client = await getAdminClient();
    const deleteResponse = await client.messages.deleteById({
      message_id: messageId,
    });

    if (deleteResponse.result === 'success') {
      return { id: messageId };
    }
    throw new Error(`deleteAdminMessage: ${deleteResponse.msg}`);
  }

  async addUserMessagesReadFlag(
    user: UserEntity,
    messageIds: number[],
  ): Promise<{ messages: number[] }> {
    const client = await getClient(user);
    const addResponse = await client.messages.flags.add({
      messages: messageIds,
      flag: 'read',
    });
    if (addResponse.result === 'success') {
      return { messages: messageIds };
    }
    throw new Error(`addUserMessagesReadFlag: ${addResponse.msg}`);
  }

  async removeUserMessagesReadFlag(
    user: UserEntity,
    messageIds: number[],
  ): Promise<{ messages: number[] }> {
    const client = await getClient(user);
    const removeResponse = await client.messages.flags.remove({
      messages: messageIds,
      flag: 'read',
    });
    if (removeResponse.result === 'success') {
      return { messages: messageIds };
    }
    throw new Error(`removeUserMessagesReadFlag: ${removeResponse.msg}`);
  }

  async deleteAdminStreamTopic(
    streamId: number,
    topicName: string,
  ): Promise<{ id: number }> {
    const client = await getAdminClient();

    const deleteResponse = await client.callEndpoint(
      `streams/${streamId}/topic_name`,
      'POST',
      {
        topic_name: topicName,
      },
    );
    if (deleteResponse.result === 'success') {
      return { id: streamId };
    }
    throw new Error(`deleteAdminStreamTopic: ${deleteResponse.msg}`);
  }
}
