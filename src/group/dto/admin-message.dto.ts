import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsEmail,
  IsOptional,
  IsArray,
  IsInt,
} from 'class-validator';

export class SendAdminMessageDto {
  @ApiProperty({
    description: 'Subject of the admin message',
    example: 'Important group announcement',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Message content to send to all group members',
    example:
      'Hello everyone,\n\nThis is an important announcement for all group members.\n\nBest regards,\nAdmin Team',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  message: string;

  @ApiProperty({
    description:
      'Optional array of specific user IDs to send to. If not provided, sends to all members',
    example: [1, 2, 3],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  targetUserIds?: number[];
}

export class PreviewAdminMessageDto extends SendAdminMessageDto {
  @ApiProperty({
    description: 'Email address to send the preview to',
    example: 'admin@example.com',
  })
  @IsNotEmpty()
  @IsEmail()
  testEmail: string;
}
