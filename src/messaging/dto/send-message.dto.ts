import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { MessageChannel } from '../interfaces/message.interface';

export class SendMessageDto {
  @ApiProperty({
    description: 'Subject of the message',
    example: 'Important Group Update',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    description: 'Content of the message (plain text)',
    example: 'This is an important update for all group members...',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'HTML content of the message',
    example:
      '<p>This is an <strong>important</strong> update for all group members...</p>',
  })
  @IsOptional()
  @IsString()
  htmlContent?: string;

  @ApiPropertyOptional({
    description: 'Template ID to use for styling',
    example: 'group-announcement',
  })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiProperty({
    description: 'Messaging channels to use',
    example: ['email'],
    enum: MessageChannel,
    isArray: true,
  })
  @IsArray()
  @IsEnum(MessageChannel, { each: true })
  channels: MessageChannel[];

  @ApiPropertyOptional({
    description: 'Specific user IDs to send to (for individual messages)',
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray()
  recipientUserIds?: number[];

  @ApiPropertyOptional({
    description: 'Recipient filter for bulk messages',
    example: 'all',
    enum: ['all', 'members', 'attendees', 'admins', 'moderators'],
  })
  @IsOptional()
  @IsEnum({
    all: 'all',
    members: 'members',
    attendees: 'attendees',
    admins: 'admins',
    moderators: 'moderators',
  })
  recipientFilter?: 'all' | 'members' | 'attendees' | 'admins' | 'moderators';

  @ApiPropertyOptional({
    description: 'Whether the message requires review before sending',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requireReview?: boolean;

  @ApiPropertyOptional({
    description: 'Schedule the message to be sent at a specific time',
    example: '2024-12-25T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;
}

export class RejectMessageDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the message',
    example: 'Content needs to be more specific',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
