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

  async showChats(userId: number, query: any) {
    await this.getTenantSpecificChatRepository();

    let chat: ChatEntity | null = null;
    let chats: ChatEntity[] = [];

    if (query.user) {
      chat = await this.getChatByParticipantUlid(query.user, userId);
    }

    if (query.chat) {
      chat = await this.getChatByUlid(query.chat, userId);
    }

    const foundChats = await this.chatRepository.find({
      where: { participants: { id: userId } },
    });

    if (!foundChats.length) {
      return { chats: [], chat };
    }

    chats = await this.chatRepository.find({
      relations: ['participants'],
      where: { id: In(foundChats.map((chat) => chat.id)) },
    });

    chats.forEach((chat) => {
      chat.participant = chat.participants.find(
        (participant) => participant.id !== userId,
      ) as UserEntity;
      chat.user = chat.participants.find(
        (participant) => participant.id === userId,
      ) as UserEntity;
    });

    const messages = await this.zulipService.getUserMessages(chats[0].user, {
      num_before: 0,
      num_after: 100,
      anchor: 'first_unread',
      narrow: [
        { operator: 'is', operand: 'private' },
        { operator: 'is', operand: 'unread' },
      ],
    });

    // loop through chats and add messages to each chat
    chats.forEach((chat) => {
      chat.messages = messages.filter(
        (message) => message.sender_id === chat.participant?.zulipUserId,
      );
    });

    return { chats, chat };
  }

  async getChatByUlid(chatUlid: string, userId: number) {
    await this.getTenantSpecificChatRepository();

    const chat = await this.chatRepository.findOne({
      where: { ulid: chatUlid },
      relations: ['participants'],
    });

    if (!chat) {
      return null;
    }

    const user = await this.userService.findOne(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    chat.participant = chat.participants.find(
      (participant) => participant.id !== userId,
    ) as UserEntity;

    if (!chat.participant) {
      throw new NotFoundException('Participant not found');
    }

    chat.user = user;

    if (!user.zulipUserId) {
      await this.zulipService.getInitialisedClient(user);
      await user.reload();
    }

    if (!chat.participant.zulipUserId) {
      await this.zulipService.getInitialisedClient(chat.participant);
      await chat.participant.reload();
    }

    const messages = await this.zulipService.getUserMessages(user, {
      num_before: 0,
      num_after: 100,
      anchor: 'oldest',
      include_anchor: false,
      narrow: [
        { operator: 'is', operand: 'private' },
        {
          operator: 'pm-with',
          operand: chat.participant.zulipUsername || '',
        },
      ],
    });

    chat.messages = messages;

    return chat;
  }

  async getChatByParticipantUlid(participantUlid: string, userId: number) {
    await this.getTenantSpecificChatRepository();

    const participant = await this.userService.findByUlid(participantUlid);

    if (!participant || participant.id === userId) {
      return null;
    }

    const chat = await this.chatRepository
      .createQueryBuilder('chats')
      .leftJoinAndSelect('chats.participants', 'participants')
      .where('participants.id IN (:...participantIds)', {
        participantIds: [userId, participant.id],
      })
      .getOne();

    if (!chat) {
      const createdChat = await this.createChat(userId, participant);
      if (!createdChat) {
        throw new NotFoundException('Chat not created');
      }
      return this.getChatByUlid(createdChat.ulid, userId);
    }
    return this.getChatByUlid(chat.ulid, userId);
  }

  async createChat(userId: number, participant: UserEntity) {
    await this.getTenantSpecificChatRepository();

    const chat = this.chatRepository.create({
      participants: [{ id: userId }, { id: participant.id }],
    });

    const savedChat = await this.chatRepository.save(chat);

    return savedChat;
  }

  async sendMessage(chatUlid: string, userId: number, content: string) {
    await this.getTenantSpecificChatRepository();
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const chat = await this.chatRepository.findOne({
      where: { ulid: chatUlid },
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

    const messageResponse = await this.zulipService.sendUserMessage(user, {
      type: 'direct',
      to: [participant.zulipUserId as number],
      content: content,
    });

    return messageResponse;
  }

  async setMessagesRead(userId: number, messageIds: number[]) {
    await this.getTenantSpecificChatRepository();
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.zulipUserId) {
      await this.zulipService.getInitialisedClient(user);
      await user.reload();
    }

    if (!messageIds.length) {
      return { messages: [] };
    }

    return await this.zulipService.addUserMessagesReadFlag(user, messageIds);
  }
}
