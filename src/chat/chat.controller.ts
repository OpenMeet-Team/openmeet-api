import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
  async showChats(@AuthUser() user: User): Promise<ChatEntity[]> {
    return await this.chatService.showChats(user.id);
  }

  @Get('user/:ulid')
  @ApiOperation({ summary: 'Get Chat by User ulid' })
  async getChatByUserUlid(
    @Param('ulid') userUlid: string,
    @AuthUser() user: User,
  ): Promise<ChatEntity | null> {
    return await this.chatService.getChatByUserUlid(user.id, userUlid);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Get Chat' })
  async showChat(
    @Param('uuid') uuid: string,
    @AuthUser() user: User,
  ): Promise<ChatEntity> {
    return await this.chatService.showChat(uuid, user.id);
  }

  @Post(':ulid/message')
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(
    @Param('ulid') ulid: string,
    @Body() body: { content: string },
    @AuthUser() user: User,
  ): Promise<any> {
    return await this.chatService.sendMessage(user.id, ulid, body.content);
  }
}
