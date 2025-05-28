import { IsString, IsNotEmpty, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendAdminMessageDto {
  @ApiProperty({
    description: 'Subject of the admin message',
    example: 'Important Event Update',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Content of the admin message',
    example:
      'Dear attendees, we have an important update about the upcoming event...',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}

export class PreviewAdminMessageDto extends SendAdminMessageDto {
  @ApiProperty({
    description: 'Email address to send the preview to',
    example: 'admin@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  testEmail: string;
}
