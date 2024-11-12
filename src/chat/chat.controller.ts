import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.servise';
import { CommentDto } from '../event/dto/create-event.dto';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';

@ApiTags('Chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ChatController {
  constructor(private readonly chatServise: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new message' })
  async comment(
    @Body() body: CommentDto,
    @AuthUser() user: User,
  ): Promise<any> {
    const userId = user.id;
    return this.chatServise.postMessage(userId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Get Chat' })
  async getChat(@AuthUser() user: User): Promise<any> {
    const userId = user.id;
    const event = await this.chatServise.userMesages(+userId);
    if (!event) {
      throw new NotFoundException(`Chat with ID ${userId} not found`);
    }
    return event;
  }

  // @Get(':userId1/:userId2')
  // @ApiOperation({ summary: 'Get Caht' })
  // async getConversation(@Param('userId1') userId1: number, @Param('userId2') userId2: number): Promise<any> {
  //   const event = await this.chatServise.usersConversation(userId1, userId2);
  //   if (!event) {
  //     throw new NotFoundException(`Conversation not found`);
  //   }
  //   return event;
  // }
}
