import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsIn } from 'class-validator';

export class ContactAdminsDto {
  @ApiProperty({
    description: 'Subject of the member contact message',
    example: 'Question about group membership',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Message content from member to admins',
    example:
      'Hi,\n\nI have a question about the upcoming group events.\n\nThanks!',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  message: string;

  @ApiProperty({
    description: 'Type of contact - determines admin notification behavior',
    example: 'question',
    enum: ['question', 'report', 'feedback'],
  })
  @IsNotEmpty()
  @IsIn(['question', 'report', 'feedback'])
  contactType: 'question' | 'report' | 'feedback';
}
