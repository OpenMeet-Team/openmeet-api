import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { EventAttendeeStatus } from '../../core/constants/constant';

export class QuickRsvpDto {
  @ApiProperty({ example: 'John Doe', type: String })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john@example.com', type: String })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'summer-party-2024', type: String })
  @IsNotEmpty()
  eventSlug: string;

  @ApiProperty({
    example: EventAttendeeStatus.Confirmed,
    enum: EventAttendeeStatus,
    description: 'RSVP response status',
    default: EventAttendeeStatus.Confirmed,
  })
  @IsOptional()
  @IsEnum(EventAttendeeStatus)
  status?: EventAttendeeStatus = EventAttendeeStatus.Confirmed;
}
