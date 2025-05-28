import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsEmail } from 'class-validator';

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
