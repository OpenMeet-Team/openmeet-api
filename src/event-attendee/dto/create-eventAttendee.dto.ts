import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';

export class CreateEventAttendeeDto {
  @ApiProperty({
    description: 'event iD',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  eventId: number;

  // @ApiProperty({
  //   description: 'User',
  // })
  // @IsNotEmpty()
  // @Type(() => Number)
  // @IsNumber()
  // userId: number;

  // @ApiProperty({ description: 'RSVP status of the attendee', example: 'going' })
  // @IsOptional()
  // @IsNotEmpty()
  // rsvpStatus: string;

  // @ApiProperty({ description: 'Is the user a host?', example: false })
  // @IsBoolean()
  // @IsOptional()
  // isHost: boolean;

  @ApiPropertyOptional({
    description: 'The status of the Event Attendee',
    enum: EventAttendeeStatus,
  })
  @IsOptional()
  @IsEnum(EventAttendeeStatus)
  status?: EventAttendeeStatus;

  @ApiPropertyOptional({
    description: 'The role of the Event Attendee',
    enum: EventAttendeeRole,
  })
  @IsOptional()
  @IsEnum(EventAttendeeRole)
  role?: EventAttendeeRole;
}
