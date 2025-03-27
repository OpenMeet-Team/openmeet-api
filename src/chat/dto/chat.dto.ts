import { ApiProperty } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({
    description: 'The topic id of the chat',
  })
  topic: string;
}

export class CreateChatMessageDto {
  @ApiProperty({
    description: 'The message content',
  })
  content: string;

  @ApiProperty({
    description: 'The Matrix user IDs to send the message to',
  })
  to: string[];
}
