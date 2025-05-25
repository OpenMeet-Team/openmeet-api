import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

export interface ChatNewMessageEvent {
  participantId: number;
  senderId: number;
  tenantId: string;
  messageContent?: string;
}

@Injectable()
export class ChatEmailListener {
  constructor(private readonly messagingService: UnifiedMessagingService) {}

  @OnEvent('chat.new.message')
  async handleChatNewMessage(event: ChatNewMessageEvent): Promise<void> {
    try {
      // Send system message notification about new chat message
      await this.messagingService.sendSystemMessage({
        type: MessageType.CHAT_NOTIFICATION,
        subject: 'You have a new message',
        content:
          'You have received a new message. Please check your messages to view and respond.',
        channels: [MessageChannel.EMAIL],
        templateId: 'chat/chat-new-message',
        metadata: {
          eventType: 'chat.new.message',
          participantId: event.participantId,
          senderId: event.senderId,
          tenantId: event.tenantId,
        },
        recipientUserId: event.participantId,
      });
    } catch (error) {
      console.error('Error handling chat new message event:', error);
    }
  }
}
