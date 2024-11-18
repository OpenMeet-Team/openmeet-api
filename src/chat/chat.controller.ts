import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { ChatEntity } from './infrastructure/persistence/relational/entities/chat.entity';

@ApiTags('Chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Show Chat List' })
  async showChats(
    @AuthUser() user: User,
    @Query() query: any,
  ): Promise<{ chats: ChatEntity[]; chat: ChatEntity | null }> {
    return await this.chatService.showChats(user.id, query);
  }

  @Post(':ulid/message')
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(
    @Param('ulid') chatUlid: string,
    @Body() body: { content: string },
    @AuthUser() user: User,
  ): Promise<any> {
    return await this.chatService.sendMessage(chatUlid, user.id, body.content);
  }

  @Post('messages/read')
  @ApiOperation({ summary: 'Set messages read' })
  async setMessagesRead(
    @Body() body: { messages: number[] },
    @AuthUser() user: User,
  ): Promise<any> {
    return await this.chatService.setMessagesRead(user.id, body.messages);
  }
}
