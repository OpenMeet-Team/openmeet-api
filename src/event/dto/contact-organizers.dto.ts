import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsIn } from 'class-validator';

export class ContactOrganizersDto {
  @ApiProperty({
    description: 'Subject of the attendee contact message',
    example: 'Question about event details',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Message content from attendee to organizers',
    example: 'Hi,\n\nI have a question about the event logistics.\n\nThanks!',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  message: string;

  @ApiProperty({
    description: 'Type of contact - determines organizer notification behavior',
    example: 'question',
    enum: ['question', 'report', 'feedback'],
  })
  @IsNotEmpty()
  @IsIn(['question', 'report', 'feedback'])
  contactType: 'question' | 'report' | 'feedback';
}
