import { REQUEST } from '@nestjs/core';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from './../user/user.service';
import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { ChatEntity } from './infrastructure/persistence/relational/entities/chat.entity';
import { In, Repository } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class ChatService {
  private chatRepository: Repository<ChatEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly zulipService: ZulipService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificChatRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.chatRepository = dataSource.getRepository(ChatEntity);
  }

  async showChats(userId: number) {
    await this.getTenantSpecificChatRepository();

    const foundChats = await this.chatRepository.find({
      where: { participants: { id: userId } },
    });

    const chats = await this.chatRepository.find({
      relations: ['participants'],
      where: { id: In(foundChats.map((chat) => chat.id)) },
    });

    chats.forEach((chat) => {
      chat.participant = chat.participants.find(
        (participant) => participant.id !== userId,
      ) as UserEntity;
    });

    // const messages = await this.zulipService.getUserMessages(user, {
    //   num_before: 0,
    //   num_after: 1,
    //   anchor: 'first_unread',
    //   narrow: [{ operator: 'is', operand: 'private' }],
    // });

    return chats;
  }

  async showChat(ulid: string, userId: number) {
    // Return chat messages with the given user ulid or slug
    const chat = await this.chatRepository.findOne({
      where: { ulid },
      relations: ['participants'],
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const user = await this.userService.findOne(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Set the participant to the other user in the chat
    chat.participant = chat.participants.find(
      (participant) => participant.id !== userId,
    ) as UserEntity;

    chat.user = user;

    const messagesResponse = await this.zulipService.getUserMessages(user, {
      num_before: 0,
      num_after: 10,
      anchor: 'first_unread',
      narrow: [
        { operator: 'is', operand: 'private' },
        {
          operator: 'pm-with',
          operand: chat.participant.zulipUsername,
        },
      ],
    });

    if (messagesResponse.result === 'success') {
      chat.messages = messagesResponse.messages;
    }

    return chat;
  }

  async getChatByUserUlid(userId: number, userUlid: string) {
    await this.getTenantSpecificChatRepository();

    const participant = await this.userService.findByUlid(userUlid);

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    const chat = await this.chatRepository
      .createQueryBuilder('chats')
      .innerJoin(
        'chats.participants',
        'participants',
        'participants.id IN (:...participantIds)',
        {
          participantIds: [userId, participant.id],
        },
      )
      .select(['chats', 'participants'])
      .getOne();

    if (!chat) {
      return await this.createChat(userId, userUlid);
    }

    return chat;
  }

  async createChat(userId: number, userUlid: string) {
    await this.getTenantSpecificChatRepository();

    const participant = await this.userService.findByUlid(userUlid);

    if (!participant) {
      throw new NotFoundException('User not found');
    }

    const chat = this.chatRepository.create({
      participants: [{ id: userId }, { id: participant.id }],
    });

    await this.chatRepository.save(chat);

    return this.chatRepository.findOne({
      where: { id: chat.id },
      relations: ['participants'],
    });
  }

  async sendMessage(userId: number, ulid: string, content: string) {
    await this.getTenantSpecificChatRepository();
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const chat = await this.chatRepository.findOne({
      where: { ulid },
      relations: ['participants'],
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const participant = chat.participants.find(
      (participant) => participant.id !== userId,
    ) as UserEntity;

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (!participant.zulipUserId) {
      await this.zulipService.getInitialisedClient(participant);
      await participant.reload();
    }

    const test = await this.zulipService.sendUserMessage(user, {
      type: 'direct',
      to: [participant.zulipUserId],
      content: content,
    });

    return test;

    // let channelId: number;

    // if channel does not exist, create it
    // await this.zulipService
    //   .getUserStreamId(user, `chat_${user.ulid}`)
    //   .then(async (response) => {
    //     if (response.result === 'success') {
    //       channelId = response.stream_id;
    //     } else {
    //       await this.zulipService
    //         .createZulipChannel(user, {
    //           name: `chat_${user.ulid}`,
    //         })
    //         .then((response) => {
    //           if (response.result === 'success') {
    //             channelId = response.stream_id;
    //           }
    //         });
    //     }
    //   });

    // if topic does not exist, create it

    // Send message to zulip
  }

  // async findAll(): Promise<Chat[]> {
  //   return this.chatRepository.find({ relations: ['user'] });
  // }

  // async findByUser(user: User): Promise<Chat[]> {
  //   return this.chatRepository.find({ where: { user }, relations: ['user'] });
  // }

  // async createChat(user: User, title: string): Promise<Chat> {
  //   const chat = this.chatRepository.create({ title, user });
  //   return this.chatRepository.save(chat);
  // }

  // async postMessage(userId: number, body: CommentDto) {
  //   const user = await this.userService.findOne(userId);

  //   const request = {
  //     type: 'private',
  //     to: [user?.zulipId],
  //     content: body.message,
  //   };

  //   try {
  //     const response = await this.zulipService.postZulipComment(user, request);
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to post message');
  //   }
  // }

  // async userMessages(userId: number) {
  //   const tenantId = this.request.tenantId;
  //   const user = await this.userService.findOne(userId);
  //   const tenantSpecificEmail = `${tenantId}_${user?.email}`;
  //   const params = {
  //     narrow: [
  //       // { operator: "type", operand: "private" },
  //       { operator: 'pm-with', operand: `${tenantSpecificEmail}` },
  //     ],
  //     anchor: 'newest',
  //     num_before: 100,
  //     num_after: 0,
  //   };

  //   try {
  //     const response = await this.zulipService.fetchMessages(user, params);
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to fetch Zulip messages');
  //   }
  // }

  // async usersConversation(userId1, userId2) {
  //   const user1 = await this.userService.findOne(userId1);
  //   const user2 = await this.userService.findOne(userId2);

  //   const params = {
  //     narrow: [
  //       // { operator: "type", operand: "private" },
  //       {
  //         operator: 'pm-with',
  //         operand: `${'tanzeelsaleemwork@gmail.com'},${'test114@example.com'}`,
  //       },
  //     ],
  //     anchor: 'newest',
  //     num_before: 100,
  //     num_after: 0,
  //   };

  //   try {
  //     const response = await this.zulipService.FetchMessages(params);
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to create Zulip topic');
  //   }
  // }
}
