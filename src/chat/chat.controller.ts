import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { ChatEntity } from './infrastructure/persistence/relational/entities/chat.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

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
    @Query() query?: { member?: string; chat?: string },
  ): Promise<{ chats: ChatEntity[]; chat: ChatEntity | null }> {
    return this.chatService.getChats(user as unknown as UserEntity, query);
  }

  @Post(':roomId/message')
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(
    @Param('roomId') roomId: string,
    @Body() body: { content: string },
    @AuthUser() user: User,
  ): Promise<{ eventId: string }> {
    return this.chatService.sendMessage(
      user as unknown as UserEntity,
      roomId,
      body.content,
    );
  }

  @Post('messages/read')
  @ApiOperation({ summary: 'Set messages read' })
  async setMessagesAsRead(
    @Body() body: { roomId: string; eventId: string },
    @AuthUser() user: User,
  ): Promise<void> {
    return this.chatService.markMessagesAsRead(
      user as unknown as UserEntity,
      body.roomId,
      body.eventId,
    );
  }

  @Get(':roomId/messages')
  async getMessages(
    @Param('roomId') roomId: string,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<{
    chunk: any[];
    start: string;
    end: string;
  }> {
    return this.chatService.getMessages(
      user as unknown as UserEntity,
      roomId,
      limit,
      from,
    );
  }

  @Put(':roomId/messages/:eventId')
  async updateMessage(
    @Param('roomId') roomId: string,
    @Param('eventId') eventId: string,
    @Body() body: { content: string },
    @AuthUser() user: User,
  ): Promise<{ eventId: string }> {
    return this.chatService.updateMessage(
      user as unknown as UserEntity,
      roomId,
      eventId,
      body.content,
    );
  }

  @Delete(':roomId/messages/:eventId')
  async deleteMessage(
    @Param('roomId') roomId: string,
    @Param('eventId') eventId: string,
    @AuthUser() user: User,
  ): Promise<{ eventId: string }> {
    return this.chatService.deleteMessage(
      user as unknown as UserEntity,
      roomId,
      eventId,
    );
  }

  @Post('rooms')
  async createRoom(
    @Body() body: { name: string; topic?: string; isPublic?: boolean },
    @AuthUser() user: User,
  ): Promise<{ roomId: string }> {
    const roomId = await this.chatService.createRoom({
      name: body.name,
      topic: body.topic,
      isPublic: body.isPublic,
      creatorId: (user as unknown as UserEntity).matrixUserId,
    });
    return { roomId };
  }

  @Post(':roomId/invite')
  async inviteToRoom(
    @Param('roomId') roomId: string,
    @Body() body: { userId: string },
    @AuthUser() user: User,
  ): Promise<void> {
    return this.chatService.inviteUserToRoom(
      roomId,
      body.userId,
      (user as unknown as UserEntity).matrixUserId,
    );
  }

  @Post(':roomId/kick')
  async kickFromRoom(
    @Param('roomId') roomId: string,
    @Body() body: { userId: string; reason?: string },
    @AuthUser() user: User,
  ): Promise<void> {
    return this.chatService.kickUserFromRoom(
      roomId,
      body.userId,
      body.reason,
      (user as unknown as UserEntity).matrixUserId,
    );
  }

  @Get('rooms')
  async getUserRooms(@AuthUser() user: User): Promise<any[]> {
    return this.chatService.getUserRooms(user as unknown as UserEntity);
  }
}
